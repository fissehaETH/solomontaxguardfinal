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
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';

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
}) => {
  const [appsScriptUrl, setAppsScriptUrl] = useState(
    settings.googleAppsScriptUrl || ''
  );
  const [customSheetId, setCustomSheetId] = useState(settings.googleSheetId || '');

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

  const handleTestAppsScriptUrl = async () => {
    if (!appsScriptUrl.trim()) {
      setTestUrlStatus({
        success: false,
        message: 'Please paste your Apps Script Web App URL first.',
      });
      return;
    }

    setIsTestingUrl(true);
    setTestUrlStatus(null);
    try {
      const res = await testAppsScriptUrl(appsScriptUrl);
      setTestUrlStatus(res);
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

      // Save Apps Script settings
      onUpdateSettings({
        ...settings,
        googleAppsScriptUrl: cleanUrl,
        googleSyncMethod: 'appscript',
        googleSheetId: result.spreadsheetId || settings.googleSheetId,
        googleSheetUrl: result.spreadsheetUrl || settings.googleSheetUrl,
        googleSheetName: result.spreadsheetTitle || settings.googleSheetName,
        lastGoogleSheetSyncAt: result.syncedAt,
      });

      setSyncResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
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
            <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900">
                  Google Sheets Dual Storage
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Apps Script Web App
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Sync all financial transactions, cash audits &amp; VAT records to Google Sheets via Google Apps Script
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

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4">
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

          {/* URL Input & Test Connection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-stone-700">
              Google Apps Script Web App URL (የዌብ አፕ አድራሻ)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={appsScriptUrl}
                onChange={(e) => {
                  setAppsScriptUrl(e.target.value);
                  setTestUrlStatus(null);
                }}
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

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 flex items-center justify-between bg-stone-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>

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
                <span>Confirm &amp; Sync via Apps Script</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
