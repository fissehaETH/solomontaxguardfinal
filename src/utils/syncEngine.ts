import {
  getPendingSyncMutations,
  removeSyncMutation,
  setLastSyncTime,
  setQuotaExceededFlag,
  loadUserLocalData,
  enqueueSyncMutation,
  saveUserLocalCollection,
  saveUserLocalSettings,
} from './storage';
import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  DailyRegisterClose,
  ReconcilingItem,
  BankReconciliationStatement,
  TaxSettings,
  SyncStatusCode,
} from '../types';
import { calculateDailyCashExamination } from './dailyCashReconciliation';
import {
  syncViaAppsScript,
  fetchGoogleSheetsData,
  GoogleSheetsSyncResult,
  GoogleSheetsImportData,
} from '../services/googleSheetsService';
import { sanitizeId } from './dataMappers';

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  conflictsRejected: number;
  remainingCount: number;
  status: SyncStatusCode;
  reason?: 'completed' | 'quota_exceeded' | 'offline' | 'error' | 'conflicts_resolved';
  errorMessage?: string;
}

/**
 * Sync Down: Overwrites device LocalStorage record with fresh remote record.
 */
export function applyRemoteRecordToLocalStorage(
  collectionName: string,
  remoteRecord: any,
  uid: string
): void {
  try {
    const currentList = loadUserLocalData(uid);
    if (collectionName === 'sales') {
      const exists = currentList.sales.some((s) => s.id === remoteRecord.id);
      const next = exists
        ? currentList.sales.map((s) => (s.id === remoteRecord.id ? remoteRecord : s))
        : [remoteRecord, ...currentList.sales];
      saveUserLocalCollection('sales', next, uid);
    } else if (collectionName === 'purchases') {
      const exists = currentList.purchases.some((p) => p.id === remoteRecord.id);
      const next = exists
        ? currentList.purchases.map((p) => (p.id === remoteRecord.id ? remoteRecord : p))
        : [remoteRecord, ...currentList.purchases];
      saveUserLocalCollection('purchases', next, uid);
    } else if (collectionName === 'bankAccounts') {
      const exists = currentList.bankAccounts.some((a) => a.id === remoteRecord.id);
      const next = exists
        ? currentList.bankAccounts.map((a) => (a.id === remoteRecord.id ? remoteRecord : a))
        : [...currentList.bankAccounts, remoteRecord];
      saveUserLocalCollection('bankAccounts', next, uid);
    } else if (collectionName === 'bankTransactions') {
      const exists = currentList.bankTransactions.some((t) => t.id === remoteRecord.id);
      const next = exists
        ? currentList.bankTransactions.map((t) => (t.id === remoteRecord.id ? remoteRecord : t))
        : [remoteRecord, ...currentList.bankTransactions];
      saveUserLocalCollection('bankTransactions', next, uid);
    } else if (collectionName === 'dailyCloses') {
      const exists = currentList.dailyCloses.some((c) => c.id === remoteRecord.id);
      const next = exists
        ? currentList.dailyCloses.map((c) => (c.id === remoteRecord.id ? remoteRecord : c))
        : [remoteRecord, ...currentList.dailyCloses];
      saveUserLocalCollection('dailyCloses', next, uid);
    } else if (collectionName === 'reconcilingItems') {
      const currentReconciling = currentList.reconcilingItems || [];
      const exists = currentReconciling.some((r) => r.id === remoteRecord.id);
      const next = exists
        ? currentReconciling.map((r) => (r.id === remoteRecord.id ? remoteRecord : r))
        : [remoteRecord, ...currentReconciling];
      saveUserLocalCollection('reconcilingItems', next, uid);
    } else if (collectionName === 'brsStatements') {
      const currentBrs = currentList.brsStatements || [];
      const exists = currentBrs.some((b) => b.id === remoteRecord.id);
      const next = exists
        ? currentBrs.map((b) => (b.id === remoteRecord.id ? remoteRecord : b))
        : [remoteRecord, ...currentBrs];
      saveUserLocalCollection('brsStatements', next, uid);
    } else if (collectionName === 'settings') {
      saveUserLocalSettings({ ...currentList.settings, ...remoteRecord }, uid);
    }
  } catch (err) {
    console.warn('Failed to overwrite local storage with remote record:', err);
  }
}

/**
 * Synchronizes LocalStorage financial data to Google Sheets via Apps Script Web App.
 */
export async function syncLocalDataToGoogleSheets(
  settings: TaxSettings,
  uid: string,
  overrides?: {
    sales?: SaleTransaction[];
    purchases?: PurchaseItem[];
    bankAccounts?: BankAccount[];
    bankTransactions?: BankTransaction[];
    dailyCloses?: DailyRegisterClose[];
  }
): Promise<GoogleSheetsSyncResult> {
  const cleanUrl = settings.googleAppsScriptUrl?.trim();
  if (!cleanUrl) {
    return {
      success: false,
      spreadsheetId: '',
      spreadsheetUrl: '',
      spreadsheetTitle: '',
      syncedAt: new Date().toISOString(),
      recordsCount: {
        sales: 0,
        purchases: 0,
        bankAccounts: 0,
        bankTransactions: 0,
        dailyCashRecords: 0,
      },
      error: 'Google Apps Script Web App URL is not configured.',
    };
  }

  const local = loadUserLocalData(uid);
  const activeSales = overrides?.sales ?? local.sales;
  const activePurchases = overrides?.purchases ?? local.purchases;
  const activeBankAccounts = overrides?.bankAccounts ?? local.bankAccounts;
  const activeBankTransactions = overrides?.bankTransactions ?? local.bankTransactions;
  const activeDailyCloses = overrides?.dailyCloses ?? local.dailyCloses;

  const cashAudit = calculateDailyCashExamination(
    activeSales,
    activePurchases,
    activeBankTransactions,
    activeDailyCloses
  );

  const res = await syncViaAppsScript(cleanUrl, {
    appsScriptUrl: cleanUrl,
    existingSpreadsheetId: settings.googleSheetId,
    settings,
    sales: activeSales,
    purchases: activePurchases,
    bankAccounts: activeBankAccounts,
    bankTransactions: activeBankTransactions,
    dailyCloses: activeDailyCloses,
    dailyCashAudit: cashAudit,
  });

  if (res.success) {
    // Flush pending queue
    const pending = getPendingSyncMutations(uid);
    for (const p of pending) {
      removeSyncMutation(p.id, uid);
    }
    setLastSyncTime(uid, Date.now());
    setQuotaExceededFlag(false);
  }

  return res;
}

/**
 * Pulls all financial records directly from Google Sheets via Apps Script Web App
 * and updates LocalStorage with full parity.
 */
export async function pullFromGoogleSheetsToLocalStorage(
  settings: TaxSettings,
  uid: string,
  onDataLoaded: (data: GoogleSheetsImportData) => void
): Promise<{ success: boolean; message: string; count: number }> {
  const cleanUrl = settings.googleAppsScriptUrl?.trim() || settings.googleSheetUrl?.trim();
  if (!cleanUrl) {
    throw new Error('Please configure your Google Apps Script Web App URL in settings first.');
  }

  const imported = await fetchGoogleSheetsData(cleanUrl, settings);

  // Save all entities into LocalStorage with full parity
  if (imported.sales && imported.sales.length > 0) {
    saveUserLocalCollection('sales', imported.sales, uid);
  }
  if (imported.purchases && imported.purchases.length > 0) {
    saveUserLocalCollection('purchases', imported.purchases, uid);
  }
  if (imported.bankAccounts && imported.bankAccounts.length > 0) {
    saveUserLocalCollection('bankAccounts', imported.bankAccounts, uid);
  }
  if (imported.bankTransactions && imported.bankTransactions.length > 0) {
    saveUserLocalCollection('bankTransactions', imported.bankTransactions, uid);
  }
  if (imported.dailyCloses && imported.dailyCloses.length > 0) {
    saveUserLocalCollection('dailyCloses', imported.dailyCloses, uid);
  }
  if (imported.settings && Object.keys(imported.settings).length > 0) {
    const merged = { ...settings, ...imported.settings };
    saveUserLocalSettings(merged, uid);
  }

  // Update caller's React state
  onDataLoaded(imported);

  const total =
    imported.sales.length +
    imported.purchases.length +
    imported.bankAccounts.length +
    imported.bankTransactions.length +
    imported.dailyCloses.length;

  return {
    success: true,
    message: `Pulled ${imported.sales.length} sales, ${imported.purchases.length} purchases, ${imported.bankAccounts.length} bank accounts, ${imported.bankTransactions.length} txs, and ${imported.dailyCloses.length} daily closes from Google Sheets!`,
    count: total,
  };
}

export function hasDoneInitialCloudSync(uid: string): boolean {
  try {
    return localStorage.getItem(`taxguard_initial_sync_done_${uid}`) === 'true';
  } catch {
    return false;
  }
}

export function setInitialCloudSyncDone(uid: string): void {
  try {
    localStorage.setItem(`taxguard_initial_sync_done_${uid}`, 'true');
  } catch {}
}
