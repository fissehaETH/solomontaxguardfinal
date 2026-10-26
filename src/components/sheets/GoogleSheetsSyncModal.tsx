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
  fetchDataFromGoogleSheets,
  GoogleSheetsImportData,
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
  ArrowDownToLine,
  Database,
  Sparkles,
  ChevronDown,
  ChevronUp,
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
  initialTab?: 'sync' | 'populate';
  onPopulateData?: (
    importedData: GoogleSheetsImportData,
    mode: 'replace' | 'merge'
  ) => void;
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
  initialTab = 'sync',
  onPopulateData,
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
  const [activeTab, setActiveTab] = useState<'sync' | 'populate'>(initialTab);
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

  // Populate from Google Sheet State
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<GoogleSheetsImportData | null>(null);
  const [populateSuccess, setPopulateSuccess] = useState<string | null>(null);
  const [showDataDetails, setShowDataDetails] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const resolvedUrl = getInitialSavedUrl();
      const resolvedSheetId = getInitialSavedSheetId();
      if (resolvedUrl) {
        setAppsScriptUrl(resolvedUrl);
        setIsEditingUrl(false);
      } else {
        setIsEditingUrl(true);
      }
      if (resolvedSheetId) {
        setCustomSheetId(resolvedSheetId);
      }
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, settings.googleAppsScriptUrl, settings.googleSheetId, initialTab]);

  if (!isOpen) return null;

  const totalRecords =
    sales.length +
    purchases.length +
    bankAccounts.length +
    bankTransactions.length +
    dailyCashAudit.records.length;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(TAXGUARD_APPS_SCRIPT_CODE);
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 3000);
    } catch {
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 3000);
    }
  };

  const handleUrlChange = (newUrl: string) => {
    setAppsScriptUrl(newUrl);
    setTestUrlStatus(null);
    setFetchError(null);
    const clean = newUrl.trim();
    if (clean) {
      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, clean);
      } catch {}
      onUpdateSettings({
        ...settings,
        googleAppsScriptUrl: clean,
        googleSyncMethod: 'appscript',
      });
    }
  };

  const handleSheetIdChange = (newId: string) => {
    setCustomSheetId(newId);
    setFetchError(null);
    const clean = newId.trim();
    if (clean) {
      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, clean);
      } catch {}
      onUpdateSettings({
        ...settings,
        googleSheetId: clean,
      });
    }
  };

  const handleDisconnect = () => {
    setAppsScriptUrl('');
    setCustomSheetId('');
    setIsEditingUrl(true);
    setTestUrlStatus(null);
    setFetchError(null);
    setFetchedData(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL);
      localStorage.removeItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID);
      localStorage.removeItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_URL);
      localStorage.removeItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_NAME);
    } catch {}
    onUpdateSettings({
      ...settings,
      googleAppsScriptUrl: undefined,
      googleSheetId: undefined,
      googleSheetUrl: undefined,
      googleSheetName: undefined,
      autoSyncToGoogleSheets: false,
    });
  };

  const handleTestAppsScriptUrl = async () => {
    const cleanUrl = appsScriptUrl.trim();
    if (!cleanUrl) {
      setTestUrlStatus({
        success: false,
        message: 'Please paste your Apps Script Web App URL first.',
      });
      return;
    }

    setIsTestingUrl(true);
    setTestUrlStatus(null);
    try {
      const res = await testAppsScriptUrl(cleanUrl);
      setTestUrlStatus(res);
      if (res.success) {
        try {
          localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, cleanUrl);
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

  const handleSync = async () => {
    const cleanUrl = appsScriptUrl.trim();
    if (!cleanUrl) {
      setSyncError(
        'Please enter your Google Apps Script Web App URL (starts with https://script.google.com/macros/s/.../exec).'
      );
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

      // Save Apps Script settings permanently
      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, cleanUrl);
        if (result.spreadsheetId) {
          localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, result.spreadsheetId);
        }
        if (result.spreadsheetUrl) {
          localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_URL, result.spreadsheetUrl);
        }
        if (result.spreadsheetTitle) {
          localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_NAME, result.spreadsheetTitle);
        }
      } catch {}

      onUpdateSettings({
        ...settings,
        googleAppsScriptUrl: cleanUrl,
        googleSyncMethod: 'appscript',
        googleSheetId: result.spreadsheetId || settings.googleSheetId,
        googleSheetUrl: result.spreadsheetUrl || settings.googleSheetUrl,
        googleSheetName: result.spreadsheetTitle || settings.googleSheetName,
        lastGoogleSheetSyncAt: result.syncedAt,
        autoSyncToGoogleSheets: autoSyncEnabled,
      });

      setIsEditingUrl(false);
      setSyncResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettingsOnly = () => {
    const cleanUrl = appsScriptUrl.trim();
    const cleanSheet = customSheetId.trim();

    if (cleanUrl) {
      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, cleanUrl);
      } catch {}
    }
    if (cleanSheet) {
      try {
        localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, cleanSheet);
      } catch {}
    }

    onUpdateSettings({
      ...settings,
      googleAppsScriptUrl: cleanUrl,
      googleSyncMethod: 'appscript',
      autoSyncToGoogleSheets: autoSyncEnabled,
      googleSheetId: cleanSheet || settings.googleSheetId,
    });

    if (cleanUrl) {
      setIsEditingUrl(false);
    }

    setTestUrlStatus({
      success: true,
      message: 'Google Sheets sync settings permanently saved on this device!',
    });
  };

  const handleFetchSheetData = async () => {
    const cleanUrl = appsScriptUrl.trim();
    const cleanSheet = customSheetId.trim();

    if (!cleanUrl && !cleanSheet) {
      setFetchError(
        'Please enter either your Google Apps Script Web App URL or your Google Sheet ID / Link.'
      );
      return;
    }

    setIsFetchingSheet(true);
    setFetchError(null);
    setPopulateSuccess(null);

    try {
      const data = await fetchDataFromGoogleSheets({
        appsScriptUrl: cleanUrl || undefined,
        spreadsheetId: cleanSheet || undefined,
      });

      const totalFound =
        data.sales.length +
        data.purchases.length +
        data.bankTransactions.length +
        data.dailyCloses.length;

      if (totalFound === 0) {
        setFetchError(
          'Google Sheet was contacted successfully, but no sales or purchase rows were found. Make sure data is filled in the Sales Register or Purchase Invoices tabs.'
        );
      } else {
        setFetchedData(data);
        if (cleanUrl) {
          try {
            localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, cleanUrl);
          } catch {}
        }
        if (cleanSheet) {
          try {
            localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, cleanSheet);
          } catch {}
        }
        setIsEditingUrl(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFetchError(
        `Failed to read Google Sheet: ${msg}. If using Apps Script, ensure your deployment Access is set to "Anyone". If sharing directly, make sure "Anyone with the link can view".`
      );
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleApplyImport = (mode: 'replace' | 'merge') => {
    if (!fetchedData) return;

    if (onPopulateData) {
      onPopulateData(fetchedData, mode);
    }

    // Also persist any retrieved sheet config
    const targetUrl = appsScriptUrl.trim() || settings.googleAppsScriptUrl;
    const targetId = fetchedData.sourceSpreadsheetId || settings.googleSheetId;
    const targetTitle = fetchedData.sourceSpreadsheetTitle || settings.googleSheetName;

    try {
      if (targetUrl) localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, targetUrl);
      if (targetId) localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, targetId);
      if (targetTitle) localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_NAME, targetTitle);
    } catch {}

    onUpdateSettings({
      ...settings,
      googleAppsScriptUrl: targetUrl,
      googleSheetId: targetId,
      googleSheetName: targetTitle,
      lastGoogleSheetSyncAt: new Date().toISOString(),
    });

    setIsEditingUrl(false);

    setPopulateSuccess(
      mode === 'replace'
        ? `Successfully populated TaxGuard with ${fetchedData.sales.length} sales, ${fetchedData.purchases.length} purchases, and ${fetchedData.bankTransactions.length} bank transactions from Google Sheet!`
        : `Successfully merged ${fetchedData.sales.length} sales and ${fetchedData.purchases.length} purchases into your local ledger!`
    );
  };

  const fetchedSalesTotal = fetchedData
    ? fetchedData.sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
    : 0;
  const fetchedPurchasesTotal = fetchedData
    ? fetchedData.purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0)
    : 0;

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
                  Google Sheets Financial Ledger
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Bi-Directional
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Populate initial data from Google Sheets or sync local transactions automatically
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

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 bg-stone-50/70 px-5 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('populate')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x ${
              activeTab === 'populate'
                ? 'bg-white text-emerald-900 border-stone-200 -mb-px border-b-white shadow-2xs'
                : 'text-stone-600 border-transparent hover:text-stone-900 hover:bg-stone-100/60'
            }`}
          >
            <ArrowDownToLine className="w-4 h-4 text-emerald-700" />
            <span>Populate from Sheet (ከጉግል ሺት አስመጣ)</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              First Time
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x ${
              activeTab === 'sync'
                ? 'bg-white text-emerald-900 border-stone-200 -mb-px border-b-white shadow-2xs'
                : 'text-stone-600 border-transparent hover:text-stone-900 hover:bg-stone-100/60'
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-700" />
            <span>Auto-Sync &amp; Export (ወደ ጉግል ሺት ላክ)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {activeTab === 'populate' ? (
            /* ================= POPULATE FROM GOOGLE SHEET TAB ================= */
            <div className="space-y-4">
              {/* Introduction Callout */}
              <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-950">
                  <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>First-Time Setup: Populate Data from Google Sheet</span>
                </div>
                <p className="text-emerald-900 text-[11px] leading-relaxed">
                  Import your existing sales, purchases, bank accounts, and daily cash records directly from your Google Sheet into TaxGuard. You can review the data before applying.
                </p>
              </div>

              {/* Source Inputs / Connected Card */}
              {appsScriptUrl.trim() && !isEditingUrl ? (
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-300 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-200" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-emerald-950">
                            Connected Google Sheet
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Saved Permanently
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-600 font-mono truncate mt-0.5 max-w-md">
                          {appsScriptUrl}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsEditingUrl(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                        title="Edit or change saved Apps Script URL"
                      >
                        <Pencil className="w-3.5 h-3.5 text-stone-500" />
                        <span>Change URL</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="p-1.5 rounded-lg bg-white hover:bg-red-50 border border-stone-200 text-stone-400 hover:text-red-600 transition cursor-pointer shadow-2xs"
                        title="Clear saved connection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {(settings.googleSheetName || customSheetId.trim()) && (
                    <div className="text-[11px] text-emerald-900 bg-emerald-100/70 px-3 py-1.5 rounded-lg flex items-center justify-between border border-emerald-200">
                      <span className="font-semibold truncate">
                        Target Sheet: {settings.googleSheetName || customSheetId}
                      </span>
                      {settings.lastGoogleSheetSyncAt && (
                        <span className="text-[10px] text-emerald-700 shrink-0 font-mono">
                          Last Synced: {formatDate(settings.lastGoogleSheetSyncAt)}
                        </span>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleFetchSheetData}
                    disabled={isFetchingSheet}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isFetchingSheet ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Reading Data from Google Sheet...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="w-4 h-4 text-emerald-200" />
                        <span>Fetch Data from Connected Sheet (ከሺት መረጃዎችን ጫን)</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-stone-800">
                      Google Apps Script Web App URL
                    </label>
                    {appsScriptUrl.trim() && (
                      <button
                        type="button"
                        onClick={() => setIsEditingUrl(false)}
                        className="text-[11px] text-emerald-700 hover:underline font-semibold cursor-pointer"
                      >
                        Cancel Editing
                      </button>
                    )}
                  </div>

                  <input
                    type="url"
                    value={appsScriptUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-mono"
                  />
                  <p className="text-[10px] text-stone-500">
                    Your Web App URL is automatically remembered permanently on this browser. You won&apos;t need to re-enter it.
                  </p>

                  <div className="space-y-1 pt-1">
                    <label className="block text-xs font-semibold text-stone-700">
                      Or Google Sheet Link / Spreadsheet ID (Fallback)
                    </label>
                    <input
                      type="text"
                      value={customSheetId}
                      onChange={(e) => handleSheetIdChange(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs.../edit or Sheet ID"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-mono"
                    />
                    <p className="text-[10px] text-stone-500">
                      For direct sheet links, ensure &quot;Anyone with the link can view&quot; is enabled in Google Sheets sharing.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleFetchSheetData}
                      disabled={isFetchingSheet || (!appsScriptUrl.trim() && !customSheetId.trim())}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
                    >
                      {isFetchingSheet ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Reading Data...</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-4 h-4" />
                          <span>Save &amp; Fetch Sheet Data (ከሺት ጫን)</span>
                        </>
                      )}
                    </button>
                    {appsScriptUrl.trim() && (
                      <button
                        type="button"
                        onClick={() => setIsEditingUrl(false)}
                        className="px-4 py-2.5 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 font-semibold text-xs transition cursor-pointer"
                      >
                        Keep &amp; Hide
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {fetchError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Failed to Fetch from Google Sheet</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-red-800">{fetchError}</p>
                </div>
              )}

              {/* Fetched Data Preview */}
              {fetchedData && (
                <div className="space-y-3 p-4 rounded-xl bg-emerald-50/70 border border-emerald-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-950">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>Google Sheet Data Found &amp; Parsed!</span>
                    </div>
                    {fetchedData.sourceSpreadsheetTitle && (
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                        {fetchedData.sourceSpreadsheetTitle}
                      </span>
                    )}
                  </div>

                  {fetchedData.settings?.businessName && (
                    <div className="text-[11px] text-emerald-900 bg-white/70 p-2.5 rounded-lg border border-emerald-200">
                      <strong>Business: </strong> {fetchedData.settings.businessName}{' '}
                      {fetchedData.settings.taxIdNumber && (
                        <span> · <strong>TIN: </strong> {fetchedData.settings.taxIdNumber}</span>
                      )}
                    </div>
                  )}

                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs">
                      <span className="text-stone-500 block text-[10px] font-medium">Sales Records</span>
                      <span className="font-bold text-stone-900 text-sm">{fetchedData.sales.length}</span>
                      <span className="text-[10px] text-emerald-700 block mt-0.5 font-mono">
                        ETB {fetchedSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs">
                      <span className="text-stone-500 block text-[10px] font-medium">Purchase Invoices</span>
                      <span className="font-bold text-stone-900 text-sm">{fetchedData.purchases.length}</span>
                      <span className="text-[10px] text-blue-700 block mt-0.5 font-mono">
                        ETB {fetchedPurchasesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs">
                      <span className="text-stone-500 block text-[10px] font-medium">Bank Accounts</span>
                      <span className="font-bold text-stone-900 text-sm">{fetchedData.bankAccounts.length}</span>
                      <span className="text-[10px] text-stone-500 block mt-0.5">
                        {fetchedData.bankAccounts.map((b) => b.bankName).join(', ') || 'CBE'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs">
                      <span className="text-stone-500 block text-[10px] font-medium">Bank Transactions</span>
                      <span className="font-bold text-stone-900 text-sm">{fetchedData.bankTransactions.length}</span>
                      <span className="text-[10px] text-stone-500 block mt-0.5">Deposits &amp; transfers</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs sm:col-span-2">
                      <span className="text-stone-500 block text-[10px] font-medium">Daily Cash Closes</span>
                      <span className="font-bold text-stone-900 text-sm">{fetchedData.dailyCloses.length}</span>
                      <span className="text-[10px] text-stone-500 block mt-0.5">Audit-ready cash balances</span>
                    </div>
                  </div>

                  {/* Toggle Sample Rows */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowDataDetails(!showDataDetails)}
                      className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                    >
                      {showDataDetails ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Hide Sample Record Details</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>Show Sample Record Details ({fetchedData.sales.length} sales, {fetchedData.purchases.length} purchases)</span>
                        </>
                      )}
                    </button>

                    {showDataDetails && (
                      <div className="mt-2 space-y-2 bg-white p-3 rounded-lg border border-emerald-200 text-xs max-h-48 overflow-y-auto">
                        <div className="font-bold text-stone-800 text-[11px]">Latest Sales Found:</div>
                        {fetchedData.sales.slice(0, 3).map((s, idx) => (
                          <div key={idx} className="flex justify-between text-[10.5px] border-b border-stone-100 pb-1 font-mono">
                            <span>{s.date} · #{s.receiptNumber} ({s.customerName})</span>
                            <span className="font-bold text-emerald-800">ETB {s.totalAmount.toFixed(2)}</span>
                          </div>
                        ))}

                        <div className="font-bold text-stone-800 text-[11px] pt-1">Latest Purchases Found:</div>
                        {fetchedData.purchases.slice(0, 3).map((p, idx) => (
                          <div key={idx} className="flex justify-between text-[10.5px] border-b border-stone-100 pb-1 font-mono">
                            <span>{p.date} · #{p.invoiceNumber} ({p.vendorName})</span>
                            <span className="font-bold text-blue-800">ETB {p.totalAmount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Apply Actions */}
                  <div className="pt-2 border-t border-emerald-200/80 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyImport('replace')}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                        <span>Populate &amp; Replace (First-Time Setup)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyImport('merge')}
                        className="py-2.5 px-4 rounded-xl bg-white hover:bg-stone-100 text-stone-800 font-bold text-xs border border-stone-300 transition cursor-pointer"
                      >
                        <span>Merge with Existing</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500 text-center">
                      &quot;Populate &amp; Replace&quot; replaces demo data with your real Google Sheet records. &quot;Merge&quot; keeps your existing entries and adds new ones.
                    </p>
                  </div>
                </div>
              )}

              {/* Success Banner */}
              {populateSuccess && (
                <div className="p-4 rounded-xl bg-emerald-100 border border-emerald-400 text-emerald-950 space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                    <span>Ledger Successfully Populated!</span>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">{populateSuccess}</p>
                  <div className="pt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition cursor-pointer"
                    >
                      View Loaded Records
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ================= AUTO-SYNC & EXPORT TAB ================= */
            <div className="space-y-4">
              {/* Apps Script Highlights */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/90 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-950">
                    <Code2 className="w-4 h-4 text-emerald-700" />
                    <span>Google Apps Script Synchronization</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-[11px] shadow-2xs transition cursor-pointer"
                  >
                    {isCodeCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Code Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Apps Script Code</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-emerald-900 leading-relaxed text-[11px]">
                  Syncs directly through your deployed Apps Script Web App without requiring expiring OAuth tokens or permissions prompts on client devices. It automatically updates all 5 tabs in your target Google Sheet.
                </p>
              </div>

              {/* 4-Step Setup Guide */}
              <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-2.5 shadow-2xs">
                <h4 className="text-xs font-bold text-stone-800 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-orange-700" />
                  <span>30-Second Setup Guide (የአፕስክሪፕት አዘገጃጀት መመሪያ)</span>
                </h4>
                <ol className="text-[11px] text-stone-600 space-y-1.5 list-none">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Open your Google Sheet (or{' '}
                      <a
                        href="https://sheets.new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 font-semibold underline"
                      >
                        create a new one at sheets.new
                      </a>
                      ).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      In Google Sheets top menu, click <strong>Extensions</strong> &rarr; <strong>Apps Script</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      Delete default code, paste the copied script, and click <strong>Deploy</strong> &rarr; <strong>New deployment</strong> &rarr; Type: <strong>Web app</strong> (Execute as: <strong>Me</strong>, Access: <strong>Anyone</strong>).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      4
                    </span>
                    <span>Copy the generated <strong>Web app URL</strong> (ends in <code>/exec</code>) and paste it below.</span>
                  </li>
                </ol>

                <div className="pt-2 flex items-center justify-between border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setIsShowCodeSnippet(!isShowCodeSnippet)}
                    className="text-[11px] text-stone-500 hover:text-stone-800 underline cursor-pointer"
                  >
                    {isShowCodeSnippet ? 'Hide Script Code Preview' : 'Show Script Code Preview (Code.gs)'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="text-[11px] text-emerald-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Script Code</span>
                  </button>
                </div>

                {isShowCodeSnippet && (
                  <div className="relative mt-2 p-3 bg-stone-900 rounded-lg text-emerald-300 font-mono text-[10px] max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{TAXGUARD_APPS_SCRIPT_CODE}</pre>
                  </div>
                )}
              </div>

              {/* URL Input / Connected Card in Auto-Sync Tab */}
              {appsScriptUrl.trim() && !isEditingUrl ? (
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-300 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                        <Link2 className="w-4 h-4 text-emerald-200" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-emerald-950">
                            Apps Script Web App Connected
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Saved Permanently
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-600 font-mono truncate mt-0.5 max-w-md">
                          {appsScriptUrl}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTestAppsScriptUrl}
                        disabled={isTestingUrl}
                        className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                        title="Test Web App connection"
                      >
                        {isTestingUrl ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-emerald-700" />
                        )}
                        <span>Test</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingUrl(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                        title="Change Apps Script URL"
                      >
                        <Pencil className="w-3.5 h-3.5 text-stone-500" />
                        <span>Change</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="p-1.5 rounded-lg bg-white hover:bg-red-50 border border-stone-200 text-stone-400 hover:text-red-600 transition cursor-pointer shadow-2xs"
                        title="Clear saved connection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {testUrlStatus && (
                    <div
                      className={`p-2 rounded-lg text-[11px] flex items-center gap-2 ${
                        testUrlStatus.success
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {testUrlStatus.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      <span>{testUrlStatus.message}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-stone-700">
                      Google Apps Script Web App URL (የዌብ አፕ አድራሻ)
                    </label>
                    {appsScriptUrl.trim() && (
                      <button
                        type="button"
                        onClick={() => setIsEditingUrl(false)}
                        className="text-[11px] text-emerald-700 hover:underline font-semibold cursor-pointer"
                      >
                        Cancel Editing
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={appsScriptUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleTestAppsScriptUrl}
                      disabled={isTestingUrl || !appsScriptUrl.trim()}
                      className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      {isTestingUrl ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-emerald-700" />
                      )}
                      <span>Test URL</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-stone-500">
                    Once entered, this URL is permanently saved on this device. You will not have to paste it every time.
                  </p>
                  {testUrlStatus && (
                    <div
                      className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                        testUrlStatus.success
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {testUrlStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <span>{testUrlStatus.message}</span>
                    </div>
                  )}
                  {appsScriptUrl.trim() && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsEditingUrl(false)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition cursor-pointer"
                      >
                        Done &amp; Save URL
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Automatic Sync Feature Toggle */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50/80 to-teal-50/60 border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-emerald-200" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2">
                        <span>Automatic Sync to Google Sheets</span>
                        {autoSyncEnabled && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Active
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-stone-600">
                        Automatically syncs sales, purchases, bank deposits &amp; register closes in the background.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={autoSyncEnabled}
                      onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                <p className="text-[10.5px] text-stone-500 leading-relaxed pl-10">
                  When enabled, any recorded sale, expense, bank transfer, or cash audit automatically updates your Google Sheet within ~3 seconds. No manual sync needed!
                </p>
              </div>

              {/* 5-Tab Structure Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <span>5 Tabs Included in Cloud Spreadsheet:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-orange-50/60 border border-orange-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-orange-700 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-900 block">1. Overview &amp; Tax Summary</span>
                      <span className="text-[10px] text-stone-500">TIN, VAT (15%), 2% WHT, Audit Verdict</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-900 block">2. Sales Register ({sales.length})</span>
                      <span className="text-[10px] text-stone-500">Daily sales, cash/transfer split, gross total</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-blue-700 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-900 block">3. Purchase Invoices ({purchases.length})</span>
                      <span className="text-[10px] text-stone-500">VAT invoices, 50k ETB rule check, supplier TIN</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-200 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-purple-700 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-900 block">4. Bank Accounts &amp; Txns ({bankTransactions.length})</span>
                      <span className="text-[10px] text-stone-500">{bankAccounts.length} accounts &amp; reconciled transactions</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 flex items-center gap-2 sm:col-span-2">
                    <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                    <div>
                      <span className="font-semibold text-stone-900 block">
                        5. Daily Cash Reconciliation ({dailyCashAudit.records.length} days)
                      </span>
                      <span className="text-[10px] text-stone-500">
                        Gross sales, cash safe on hand, actual bank deposits &amp; daily deposit gaps
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sync Result Banner */}
              {syncResult && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Successfully Synced to Google Sheets via Apps Script!</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-mono">
                      {formatDate(syncResult.syncedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800">
                    Updated {totalRecords} records across all 5 spreadsheet tabs.
                  </p>
                  {syncResult.spreadsheetUrl && (
                    <a
                      href={syncResult.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shadow-2xs transition"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Open Synced Google Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              {/* Error Banner */}
              {syncError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Sync Notice</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-red-800">{syncError}</p>
                </div>
              )}

              {/* Confirmation Callout */}
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/90 text-amber-950 text-[11px] leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Confirmation Required: </strong>
                  Clicking <strong>Confirm &amp; Sync</strong> will write your latest financial records into the 5 tabs in your Google Sheet via your deployed Apps Script Web App.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 flex items-center justify-between bg-stone-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing || isFetchingSheet}
            className="px-4 py-2 rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold text-xs transition cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveSettingsOnly}
              disabled={isSyncing || isFetchingSheet || (!appsScriptUrl.trim() && !customSheetId.trim())}
              className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
            >
              Save Settings
            </button>

            {activeTab === 'populate' ? (
              <button
                type="button"
                onClick={handleFetchSheetData}
                disabled={isFetchingSheet || (!appsScriptUrl.trim() && !customSheetId.trim())}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                {isFetchingSheet ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Fetching Data...</span>
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>Fetch Sheet Data</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing || !appsScriptUrl.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Syncing via Google Apps Script...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Confirm &amp; Sync Now</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

