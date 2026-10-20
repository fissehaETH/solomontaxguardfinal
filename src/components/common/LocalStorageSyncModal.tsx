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
} from 'lucide-react';
import {
  getLocalStorageStats,
  LocalStorageStats,
  downloadLocalDataBackup,
  importLocalDataBackup,
} from '../../utils/storage';
import { syncPendingToFirestore, queueAllLocalDataForSync } from '../../utils/syncEngine';

interface LocalStorageSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid?: string | null;
  userEmail?: string | null;
  onDataRestored?: () => void;
  onPullFromCloud?: () => Promise<void> | void;
}

export const LocalStorageSyncModal: React.FC<LocalStorageSyncModalProps> = ({
  isOpen,
  onClose,
  uid,
  userEmail,
  onDataRestored,
  onPullFromCloud,
}) => {
  const [stats, setStats] = useState<LocalStorageStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
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
    if (!uid) {
      setSyncFeedback({
        type: 'warning',
        message: 'Please sign in to sync with the online database. Your data is currently safe in phone storage.',
      });
      return;
    }

    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const res = await syncPendingToFirestore(uid);
      refreshStats();

      if (res.success) {
        if (res.syncedCount > 0) {
          setSyncFeedback({
            type: 'success',
            message: `Successfully synchronized ${res.syncedCount} record(s) to online cloud database!`,
          });
        } else {
          setSyncFeedback({
            type: 'success',
            message: 'All local data is already up-to-date with the online database.',
          });
        }
      } else {
        if (res.reason === 'quota_exceeded') {
          setSyncFeedback({
            type: 'warning',
            message:
              'Firestore daily free quota limit is currently exceeded for this project. All parameters and transactions remain securely stored in your phone local storage and will sync automatically once quota resets.',
          });
        } else if (res.reason === 'offline') {
          setSyncFeedback({
            type: 'warning',
            message:
              'Your phone appears offline. Data is saved locally and will sync as soon as you reconnect.',
          });
        } else {
          setSyncFeedback({
            type: 'error',
            message: res.errorMessage || 'Sync failed. Local data remains intact.',
          });
        }
      }
    } catch (err) {
      setSyncFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Sync failed.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQueueAll = () => {
    if (!uid) return;
    const count = queueAllLocalDataForSync(uid);
    refreshStats();
    setSyncFeedback({
      type: 'info',
      message: `Queued ${count} local record(s) for synchronization to online database.`,
    });
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
        if (onDataRestored) {
          onDataRestored();
        }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col border border-stone-200 dark:border-stone-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-stone-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/70 border border-orange-300 dark:border-orange-800 flex items-center justify-center text-orange-700 dark:text-orange-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">
                Phone Storage & Online Sync
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                የስልክ ውስጣዊ ማከማቻ እና የዳታ ማመሳሰያ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-stone-600 dark:text-stone-300">
          {/* Status Alert Banner */}
          {stats?.isQuotaExceeded ? (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Online Database Quota Limit Exceeded
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  Firestore free daily read units have reached their limit for today. Solomon
                  TaxGuard is currently using your phone’s local storage. All your tax settings,
                  sales, and purchases remain fully preserved and operational on this device.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Phone Local Storage is Active & Protected
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  Every transaction and parameter is continuously mirrored to your device’s local
                  storage so you can work seamlessly offline without risking data loss.
                </p>
              </div>
            </div>
          )}

          {/* Sync Feedback Message */}
          {syncFeedback && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                syncFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : syncFeedback.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : syncFeedback.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                  : 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
              }`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{syncFeedback.message}</span>
            </div>
          )}

          {/* Device Storage Statistics Card */}
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-4 bg-stone-50/50 dark:bg-stone-950/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-orange-700 dark:text-orange-400" />
                Data Stored in Phone Memory
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
                ~{stats?.estimatedSizeKb || 0} KB
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-stone-700 dark:text-stone-300 pt-1">
              <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <span>Daily Sales</span>
                <span className="font-bold text-orange-700 dark:text-orange-400">
                  {stats?.salesCount || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <span>Purchases & Expenses</span>
                <span className="font-bold text-orange-700 dark:text-orange-400">
                  {stats?.purchasesCount || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <span>Bank Accounts</span>
                <span className="font-bold text-stone-900 dark:text-white">
                  {stats?.bankAccountsCount || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <span>Bank Transactions</span>
                <span className="font-bold text-stone-900 dark:text-white">
                  {stats?.bankTransactionsCount || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <span>Daily Register Closes</span>
                <span className="font-bold text-stone-900 dark:text-white">
                  {stats?.dailyClosesCount || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <span>Tax Parameters</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {stats?.hasSettings ? 'Configured' : 'Default'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-200 dark:border-stone-800 text-[11px] text-stone-500">
              <span>Pending Cloud Sync:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded-md ${
                  (stats?.pendingSyncCount || 0) > 0
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {(stats?.pendingSyncCount || 0) > 0
                  ? `${stats?.pendingSyncCount} changes waiting`
                  : 'All synced'}
              </span>
            </div>
          </div>

          {/* Cloud Synchronization Actions */}
          <div className="space-y-2.5">
            <span className="font-bold text-stone-900 dark:text-white block">
              Online Database Actions
            </span>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex-1 py-2.5 px-4 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Synchronizing...' : 'Sync Pending to Cloud'}</span>
              </button>

              {onPullFromCloud && (
                <button
                  onClick={async () => {
                    setIsSyncing(true);
                    setSyncFeedback(null);
                    try {
                      await onPullFromCloud();
                      refreshStats();
                      setSyncFeedback({
                        type: 'success',
                        message: 'Populated local storage with online database records!',
                      });
                    } catch (err) {
                      setSyncFeedback({
                        type: 'error',
                        message: err instanceof Error ? err.message : 'Pull failed.',
                      });
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  className="py-2.5 px-3 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  title="Populate phone local storage with data from online database"
                >
                  <Download className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  <span>Pull from Database</span>
                </button>
              )}

              <button
                onClick={handleQueueAll}
                disabled={isSyncing}
                className="py-2.5 px-3 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                title="Mark all current phone records to push to online Firestore"
              >
                <Layers className="w-3.5 h-3.5 text-stone-500" />
                <span>Queue All Data</span>
              </button>
            </div>
          </div>

          {/* Offline Backup & Restore Section */}
          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/50 space-y-3">
            <span className="font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
              <Download className="w-4 h-4 text-orange-700 dark:text-orange-400" />
              Phone Backup & File Transfer
            </span>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
              Download your entire business ledger as a JSON file to your phone. You can keep it as
              an offline backup or restore it on another phone anytime.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={handleExportBackup}
                className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-white font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-700 dark:text-orange-400" />
                <span>Download Phone Backup (.json)</span>
              </button>

              <label className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-white font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Restore Backup File</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 flex items-center justify-between text-xs shrink-0">
          <span className="text-[11px] text-stone-400 truncate max-w-[200px]">
            User: {userEmail || 'Local Phone User'}
          </span>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-medium text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
