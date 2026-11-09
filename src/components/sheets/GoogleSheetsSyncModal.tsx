import React, { useState } from 'react';
import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  DailyRegisterClose,
  TaxSettings,
} from '../../types';
import { DailyCashAuditSummary } from '../../utils/dailyCashReconciliation';
import {
  syncViaAppsScript,
  testAppsScriptUrl,
  TAXGUARD_APPS_SCRIPT_CODE,
  GoogleSheetsSyncResult,
} from '../../services/googleSheetsService';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  X,
  FileText,
  Coins,
  Landmark,
  ShieldCheck,
  Calendar,
  Layers,
  Code2,
  Copy,
  Check,
  Globe,
  HelpCircle,
  Zap,
  Database,
  Pencil,
  Link2,
  Trash2,
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { STORAGE_KEYS } from '../../utils/storage';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TaxSettings;
  onUpdateSettings: (newSettings: TaxSettings) => void;
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  dailyCloses: DailyRegisterClose[];
  dailyCashAudit: DailyCashAuditSummary;
  onClearCloudDatabases?: () => Promise<{
    sheetsSuccess: boolean;
    message: string;
  }>;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  sales,
  purchases,
  bankAccounts,
  bankTransactions,
  dailyCloses,
  dailyCashAudit,
  onClearCloudDatabases,
}) => {
  const getInitialSavedUrl = () => {
    if (settings.googleAppsScriptUrl) return settings.googleAppsScriptUrl;
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL) ||
        localStorage.getItem('taxguard_persistent_google_apps_script_url') ||
        ''
      );
    } catch {
      return '';
    }
  };

  const getInitialSavedSheetId = () => {
    if (settings.googleSheetId) return settings.googleSheetId;
    try {
      return (
        localStorage.getItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID) ||
        localStorage.getItem('taxguard_persistent_google_sheet_id') ||
        ''
      );
    } catch {
      return '';
    }
  };

  const initialUrl = getInitialSavedUrl();
  const [appsScriptUrl, setAppsScriptUrl] = useState(initialUrl);
  const [customSheetId, setCustomSheetId] = useState(getInitialSavedSheetId());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(
    settings.autoSyncToGoogleSheets !== false
  );
  const [isEditingUrl, setIsEditingUrl] = useState(!Boolean(initialUrl));

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<GoogleSheetsSyncResult | null>(null);

  // Apps Script code copy feedback & view toggle
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [isShowCodeSnippet, setIsShowCodeSnippet] = useState(false);

  // Testing connection state
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testUrlStatus, setTestUrlStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const totalRecords =
    sales.length + purchases.length + bankAccounts.length + bankTransactions.length + dailyCloses.length;

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(TAXGUARD_APPS_SCRIPT_CODE);
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = TAXGUARD_APPS_SCRIPT_CODE;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 3000);
    }
  };

  const handleTestConnection = async () => {
    const clean = appsScriptUrl.trim();
    if (!clean) {
      setTestUrlStatus({
        success: false,
        message: 'Please paste your Google Apps Script Web App URL first.',
      });
      return;
    }
    setIsTestingUrl(true);
    setTestUrlStatus(null);
    try {
      const res = await testAppsScriptUrl(clean);
      setTestUrlStatus(res);
      if (res.success) {
        onUpdateSettings({
          ...settings,
          googleAppsScriptUrl: clean,
          autoSyncToGoogleSheets: autoSyncEnabled,
        });
        try {
          localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, clean);
        } catch {}
      }
    } catch (err) {
      setTestUrlStatus({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingUrl(false);
    }
  };

  const handleSaveSettings = () => {
    const cleanUrl = appsScriptUrl.trim();
    const cleanSheet = customSheetId.trim();

    onUpdateSettings({
      ...settings,
      googleAppsScriptUrl: cleanUrl || undefined,
      googleSheetId: cleanSheet || undefined,
      autoSyncToGoogleSheets: autoSyncEnabled,
    });

    try {
      if (cleanUrl) localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, cleanUrl);
      if (cleanSheet) localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, cleanSheet);
    } catch {}

    setTestUrlStatus({
      success: true,
      message: 'Google Sheets backup settings saved successfully on this device!',
    });
  };

  const handleTriggerFirestoreBackup = async () => {
    const cleanUrl = appsScriptUrl.trim();
    if (!cleanUrl) {
      setSyncError('Please enter and verify your Google Apps Script Web App URL.');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await syncViaAppsScript(cleanUrl, {
        appsScriptUrl: cleanUrl,
        existingSpreadsheetId: customSheetId.trim() || settings.googleSheetId,
        settings,
        sales,
        purchases,
        bankAccounts,
        bankTransactions,
        dailyCloses,
        dailyCashAudit,
      });

      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, cleanUrl);
        if (result.spreadsheetId) localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, result.spreadsheetId);
        if (result.spreadsheetUrl) localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_URL, result.spreadsheetUrl);
        if (result.spreadsheetTitle) localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_NAME, result.spreadsheetTitle);
      } catch {}

      onUpdateSettings({
        ...settings,
        googleAppsScriptUrl: cleanUrl,
        googleSheetId: result.spreadsheetId || settings.googleSheetId,
        googleSheetUrl: result.spreadsheetUrl || settings.googleSheetUrl,
        googleSheetName: result.spreadsheetTitle || settings.googleSheetName,
        lastGoogleSheetSyncAt: result.syncedAt,
        autoSyncToGoogleSheets: autoSyncEnabled,
      });

      setSyncResult(result);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-stone-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900">
                  Google Sheets Passive Backup
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Passive Backup
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Automated secondary cloud backup destination for Firebase Firestore
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Architecture Pipeline Banner */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Strict Tri-Tier Data Persistence Architecture</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="p-2.5 rounded-lg bg-white border border-stone-200">
                <span className="text-stone-500 block font-medium">1. Local Storage</span>
                <span className="font-bold text-stone-900">Primary UI State</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-orange-200">
                <span className="text-orange-600 block font-medium">2. Firebase Firestore</span>
                <span className="font-bold text-stone-900">Cloud Primary (Reads & Writes)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-emerald-200">
                <span className="text-emerald-700 block font-medium">3. Google Sheets</span>
                <span className="font-bold text-stone-900">Secondary Passive Backup</span>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed pt-1">
              Google Sheets operates strictly as an isolated passive backup destination for Firebase Firestore. The client app reads exclusively from Firebase Firestore and LocalStorage. Writes follow: LocalStorage &rarr; Firebase Firestore &rarr; Google Sheets. Original timestamps (<code>createdAt</code>) remain 100% immutable.
            </p>
          </div>

          {/* Web App URL Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>Google Apps Script Web App URL</span>
              </label>
              {appsScriptUrl && !isEditingUrl && (
                <button
                  type="button"
                  onClick={() => setIsEditingUrl(true)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit URL</span>
                </button>
              )}
            </div>

            {isEditingUrl ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={appsScriptUrl}
                    onChange={(e) => setAppsScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 font-mono focus:outline-none focus:border-emerald-600 bg-stone-50"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingUrl || !appsScriptUrl.trim()}
                    className="px-4 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingUrl ? 'animate-spin' : ''}`} />
                    <span>{isTestingUrl ? 'Testing...' : 'Test & Save'}</span>
                  </button>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-stone-400">Must end in <code>/exec</code> and access set to &quot;Anyone&quot;.</span>
                  {initialUrl && (
                    <button
                      type="button"
                      onClick={() => setIsEditingUrl(false)}
                      className="text-stone-500 hover:text-stone-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-3">
                <div className="truncate text-xs font-mono text-stone-700">
                  {appsScriptUrl}
                </div>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                  Connected
                </span>
              </div>
            )}

            {/* Test Status Feedback */}
            {testUrlStatus && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testUrlStatus.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {testUrlStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{testUrlStatus.message}</span>
              </div>
            )}
          </div>

          {/* Backup Preferences */}
          <div className="p-4 rounded-xl border border-stone-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-stone-900 block">
                  Automatic Secondary Cloud Backup
                </span>
                <span className="text-[11px] text-stone-500">
                  Automatically back up records to Google Sheets after Firestore commits
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(e) => {
                    setAutoSyncEnabled(e.target.checked);
                    onUpdateSettings({
                      ...settings,
                      autoSyncToGoogleSheets: e.target.checked,
                    });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {settings.lastGoogleSheetSyncAt && (
              <div className="text-[11px] text-stone-500 pt-2 border-t border-stone-100 flex items-center justify-between">
                <span>Last Google Sheets Backup:</span>
                <span className="font-semibold text-stone-700">
                  {formatDate(settings.lastGoogleSheetSyncAt)}
                </span>
              </div>
            )}
          </div>

          {/* Manual Backup Trigger */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleTriggerFirestoreBackup}
              disabled={isSyncing || !appsScriptUrl.trim()}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isSyncing
                  ? 'Pushing Backup to Google Sheets...'
                  : `Trigger Backup to Google Sheets (${totalRecords} Records)`}
              </span>
            </button>

            {/* Clear Tertiary Database (Google Sheets) Button */}
            {onClearCloudDatabases && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Are you sure you want to clear all backup tabs in your Google Sheet? LocalStorage data will remain safe.')) {
                      return;
                    }
                    setIsSyncing(true);
                    setSyncError(null);
                    try {
                      const res = await onClearCloudDatabases();
                      if (res.sheetsSuccess) {
                        setSyncResult({
                          success: true,
                          spreadsheetId: settings.googleSheetId || '',
                          spreadsheetUrl: settings.googleSheetUrl || '',
                          spreadsheetTitle: settings.googleSheetName || 'Google Sheets',
                          syncedAt: new Date().toISOString(),
                          recordsCount: { sales: 0, purchases: 0, bankAccounts: 0, bankTransactions: 0, dailyCashRecords: 0 },
                          method: 'appscript',
                        });
                      } else {
                        setSyncError(res.message);
                      }
                    } catch (err) {
                      setSyncError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing || !appsScriptUrl.trim()}
                  className="w-full py-2.5 px-3 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Clear All Google Sheet Backup Tabs</span>
                </button>
              </div>
            )}

            {syncError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            {syncResult && syncResult.success && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Backup complete! Updated 5 tabs in Google Sheet &quot;{syncResult.spreadsheetTitle}&quot;.
                  </span>
                </div>
                {syncResult.spreadsheetUrl && (
                  <a
                    href={syncResult.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-bold text-emerald-700 hover:underline shrink-0 text-[11px]"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Apps Script Setup Instructions Toggle */}
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsShowCodeSnippet(!isShowCodeSnippet)}
              className="w-full p-3.5 bg-stone-50 hover:bg-stone-100 flex items-center justify-between text-xs font-bold text-stone-800 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-700" />
                <span>Google Apps Script Setup Code (Code.gs)</span>
              </div>
              <span className="text-[11px] text-stone-500 font-normal">
                {isShowCodeSnippet ? 'Hide code' : 'View code'}
              </span>
            </button>

            {isShowCodeSnippet && (
              <div className="p-4 bg-stone-900 text-stone-200 text-xs space-y-3 font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                  <span className="text-stone-400 text-[11px]">Paste this script into Extensions &gt; Apps Script</span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-white rounded text-[11px] cursor-pointer"
                  >
                    {isCodeCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-stone-400" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-60 overflow-y-auto text-[11px] text-stone-300 leading-relaxed">
                  {TAXGUARD_APPS_SCRIPT_CODE}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs">
          <span className="text-[11px] text-stone-400">
            Passive Backup Target: Google Sheets
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
