import {
  getPendingSyncMutations,
  removeSyncMutation,
  setLastSyncTime,
  setQuotaExceededFlag,
  loadUserLocalData,
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
} from '../types';

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  remainingCount: number;
  reason?: 'completed' | 'quota_exceeded' | 'offline' | 'error';
  errorMessage?: string;
}

/**
 * Local-first storage sync stub (Firestore removed as a database).
 * Cloud backups are now handled directly via Google Sheets & Apps Script.
 */
export async function syncPendingToFirestore(uid?: string | null): Promise<SyncResult> {
  const pending = getPendingSyncMutations(uid);
  // Clear any old queued mutations since Firestore is no longer used
  for (const item of pending) {
    removeSyncMutation(item.id, uid);
  }
  setQuotaExceededFlag(false);
  setLastSyncTime(uid || 'local', Date.now());

  return {
    success: true,
    syncedCount: pending.length,
    remainingCount: 0,
    reason: 'completed',
  };
}

export function hasDoneInitialCloudSync(uid: string): boolean {
  return true;
}

export async function performFirstTimeCloudSync(
  uid: string,
  onDataLoaded: (data: {
    sales?: SaleTransaction[];
    purchases?: PurchaseItem[];
    bankAccounts?: BankAccount[];
    bankTransactions?: BankTransaction[];
    dailyCloses?: DailyRegisterClose[];
    reconcilingItems?: ReconcilingItem[];
    brsStatements?: BankReconciliationStatement[];
    settings?: TaxSettings;
  }) => void,
  force = false
): Promise<{ success: boolean; message: string }> {
  const localData = loadUserLocalData(uid);
  onDataLoaded(localData);
  return {
    success: true,
    message: 'Local phone records loaded successfully.',
  };
}

export function queueAllLocalDataForSync(uid?: string | null): number {
  return 0;
}
