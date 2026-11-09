import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Cloud,
  CloudOff,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  HardDrive,
  FileText,
  X,
  Info,
  Trash2,
  AlertOctagon,
} from 'lucide-react';
import {
  getLocalStorageStats,
  LocalStorageStats,
  downloadLocalDataBackup,
  importLocalDataBackup,
} from '../../utils/storage';
import { syncLocalDataToGoogleSheets } from '../../utils/syncEngine';
import { TaxSettings } from '../../types';

interface LocalStorageSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid?: string | null;
  userEmail?: string | null;
  settings?: TaxSettings;
  onDataRestored?: () => void;
  onPullFromCloud?: () => Promise<void> | void;
  onClearCloudDatabases?: () => Promise<{
    sheetsSuccess: boolean;
    message: string;
  }>;
}

export const LocalStorageSyncModal: React.FC<LocalStorageSyncModalProps> = ({
  isOpen,
  onClose,
  uid,
  userEmail,
  settings,
  onDataRestored,
  onPullFromCloud,
  onClearCloudDatabases,
}) => {
  const [stats, setStats] = useState<LocalStorageStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);

  const refreshStats = () => {
    setStats(getLocalStorageStats(uid));
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setSyncFeedback(null);
    }
  }, [isOpen, uid]);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    if (!settings || !settings.googleAppsScriptUrl) {
      setSyncFeedback({
        type: 'warning',
        message: 'Google Apps Script Web App URL is not configured. Set it in Settings to enable cloud sync.',
      });
      return;
    }

    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const res = await syncLocalDataToGoogleSheets(settings, uid || 'local');
      refreshStats();

      if (res.success) {
        setSyncFeedback({
          type: 'success',
          message: `Synced with Google Sheets (${res.recordsCount.sales} sales, ${res.recordsCount.purchases} purchases, ${res.recordsCount.bankAccounts} bank accounts, ${res.recordsCount.bankTransactions} txs)!`,
        });
      } else {
        setSyncFeedback({
          type: 'warning',
          message: res.error || 'Failed to sync with Google Sheets. Local data remains safe.',
        });
      }
    } catch {
      setSyncFeedback({
        type: 'info',
        message: 'All records are securely stored locally on this device.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportBackup = () => {
    downloadLocalDataBackup(uid);
    setSyncFeedback({
      type: 'success',
      message: 'Phone backup file downloaded (.json). Keep this file safe!',
    });
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const res = importLocalDataBackup(uid, content);
      refreshStats();
      if (res.success) {
        setSyncFeedback({
          type: 'success',
          message: res.message,
        });
        if (onDataRestored) onDataRestored();
      } else {
        setSyncFeedback({
          type: 'error',
          message: res.message,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-stone-900 rounded-2xl w-full max-w-lg shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-linear-to-r from-amber-700 to-amber-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Data Storage &amp; Sync</h3>
              <p className="text-xs text-amber-200/90 font-medium">
                LocalStorage (Primary) + Google Sheets via Apps Script
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Feedback alert */}
          {syncFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                syncFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : syncFeedback.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                  : syncFeedback.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              {syncFeedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              {syncFeedback.type === 'error' && <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />}
              {syncFeedback.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              {syncFeedback.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
              <div className="flex-1 font-medium">{syncFeedback.message}</div>
            </div>
          )}

          {/* Architecture Card */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-400">
              <Layers className="w-4 h-4 text-amber-700" />
              <span>Two-Tier Storage Architecture</span>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              1. <strong>Primary Database</strong>: Browser LocalStorage for instant 0ms offline mutations.<br />
              2. <strong>Cloud Database &amp; Backup</strong>: Google Sheets spreadsheet tabs via Google Apps Script Web App.
            </p>
          </div>

          {/* Stats breakdown */}
          {stats && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">
                <span>Local Device Storage Stats</span>
                <span className="text-amber-700 dark:text-amber-400 font-mono">
                  {stats.formattedSize} ({stats.storageUsagePercent}% of quota)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-center">
                  <div className="text-lg font-black text-stone-800 dark:text-stone-100 font-mono">
                    {stats.salesCount}
                  </div>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Sales Records</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-center">
                  <div className="text-lg font-black text-stone-800 dark:text-stone-100 font-mono">
                    {stats.purchasesCount}
                  </div>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Purchases</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-center">
                  <div className="text-lg font-black text-stone-800 dark:text-stone-100 font-mono">
                    {stats.bankAccountsCount}
                  </div>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Bank Accounts</div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-center">
                  <div className="text-lg font-black text-stone-800 dark:text-stone-100 font-mono">
                    {stats.bankTransactionsCount}
                  </div>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Bank Txns</div>
                </div>
              </div>
            </div>
          )}

          {/* Sync actions */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">
              Cloud Synchronization
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="p-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync with Google Sheets</span>
              </button>

              {onPullFromCloud && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsSyncing(true);
                    try {
                      await onPullFromCloud();
                      refreshStats();
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  className="p-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>Pull from Google Sheets</span>
                </button>
              )}
            </div>
          </div>

          {/* Local Backup / Restore Section */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">
              Offline File Backup (.json)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                className="p-2.5 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-700" />
                <span>Download .JSON</span>
              </button>

              <label className="p-2.5 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                <Upload className="w-4 h-4 text-emerald-700" />
                <span>Restore .JSON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Clear Cloud Database Section */}
          {onClearCloudDatabases && (
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-red-900 dark:text-red-400 text-xs flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span>Clear Google Sheets Cloud Backup</span>
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 block pt-0.5">
                    Wipes remote records from Google Sheets spreadsheet tabs. Phone LocalStorage stays safe.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(!showClearConfirm)}
                  className="py-1.5 px-3 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 font-bold text-xs hover:bg-red-200 dark:hover:bg-red-800/60 transition cursor-pointer shrink-0"
                >
                  Clear Sheet
                </button>
              </div>

              {showClearConfirm && (
                <div className="p-3 rounded-xl bg-white dark:bg-stone-900 border border-red-200 dark:border-red-800 space-y-2.5 text-xs animate-fade-in">
                  <p className="text-[11px] text-red-800 dark:text-red-300">
                    Are you sure you want to clear all data tabs in Google Sheets? Local phone storage will remain intact.
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      disabled={isSyncing}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={async () => {
                        setIsSyncing(true);
                        try {
                          const res = await onClearCloudDatabases();
                          setSyncFeedback({
                            type: res.sheetsSuccess ? 'success' : 'warning',
                            message: res.message,
                          });
                          setShowClearConfirm(false);
                          refreshStats();
                        } catch (err) {
                          setSyncFeedback({
                            type: 'error',
                            message: err instanceof Error ? err.message : 'Wipe failed.',
                          });
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                    >
                      {isSyncing ? 'Wiping...' : 'Confirm Wipe Google Sheets'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-stone-50 dark:bg-stone-800/50 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold text-xs text-stone-800 dark:text-stone-200 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
