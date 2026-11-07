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
import {
  db,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { resolveLastWriteWins } from './conflictResolution';

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
 * Sync Down: Overwrites device LocalStorage record with fresh remote database version.
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
    } else if (collectionName === 'settings') {
      saveUserLocalSettings({ ...currentList.settings, ...remoteRecord }, uid);
    }
  } catch (err) {
    console.warn('Failed to overwrite local storage with remote record:', err);
  }
}

/**
 * Synchronizes pending offline mutations to Cloud Firestore with Last-Write-Wins conflict resolution:
 * - If incoming payload is older than existing database record: REJECT update completely (REJECTED_STALE_DATA)
 *   and overwrite device's LocalStorage state with the remote database record (Sync Down).
 * - If incoming payload is newer: ACCEPT and overwrite database state (SYNC_SUCCESS).
 */
export async function syncPendingToFirestore(uid?: string | null): Promise<SyncResult> {
  const activeUid = uid || 'local';
  const pending = getPendingSyncMutations(activeUid);

  if (pending.length === 0) {
    return {
      success: true,
      syncedCount: 0,
      conflictsRejected: 0,
      remainingCount: 0,
      status: 'SYNC_SUCCESS',
      reason: 'completed',
    };
  }

  let syncedCount = 0;
  let conflictsRejected = 0;

  for (const item of pending) {
    try {
      const docRef = doc(db, item.collection, item.docId);

      // Multi-device conflict resolution check against existing Firestore record
      if (item.data && (item.operation === 'set' || item.operation === 'update')) {
        const existingSnap = await getDoc(docRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as any;
          const conflict = resolveLastWriteWins(item.data, existingData);

          // Outdated payload: REJECT update completely and perform Sync Down
          if (conflict.code === 'REJECTED_STALE_DATA') {
            console.warn(`[Sync Conflict] REJECTED_STALE_DATA on ${item.collection}/${item.docId}:`, conflict.message);
            removeSyncMutation(item.id, activeUid);
            applyRemoteRecordToLocalStorage(item.collection, existingData, activeUid);
            conflictsRejected++;
            continue;
          }
        }
      }

      if (item.operation === 'set' && item.data) {
        // Up-to-date payload: accept and overwrite remote database
        const clientCreatedAt = item.data.createdAt || new Date().toISOString();
        const clientUpdatedAt = item.data.updatedAt || new Date().toISOString();
        await setDoc(docRef, {
          ...item.data,
          createdAt: clientCreatedAt,
          updatedAt: clientUpdatedAt,
        });
      } else if (item.operation === 'update' && item.data) {
        const { createdAt: _ignoredCreatedAt, ...updateFields } = item.data;
        const clientUpdatedAt = item.data.updatedAt || new Date().toISOString();
        await updateDoc(docRef, {
          ...updateFields,
          updatedAt: clientUpdatedAt,
        });
      } else if (item.operation === 'delete') {
        await deleteDoc(docRef);
      }

      removeSyncMutation(item.id, activeUid);
      syncedCount++;
    } catch (err: unknown) {
      console.warn(`Failed to sync mutation ${item.id} to Firestore:`, err);
      try {
        handleFirestoreError(
          err,
          item.operation === 'delete' ? OperationType.DELETE : OperationType.WRITE,
          `${item.collection}/${item.docId}`
        );
      } catch (e) {
        console.error('Handled Firestore sync error:', e);
      }
      return {
        success: false,
        syncedCount,
        conflictsRejected,
        remainingCount: pending.length - (syncedCount + conflictsRejected),
        status: 'REJECTED_STALE_DATA',
        reason: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  setQuotaExceededFlag(false);
  setLastSyncTime(activeUid, Date.now());

  return {
    success: true,
    syncedCount,
    conflictsRejected,
    remainingCount: 0,
    status: conflictsRejected > 0 ? 'REJECTED_STALE_DATA' : 'SYNC_SUCCESS',
    reason: conflictsRejected > 0 ? 'conflicts_resolved' : 'completed',
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

/**
 * Performs first-time cloud synchronization for a signed-in user.
 * Fetches records from Firestore; if remote records exist, loads them into local state.
 */
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
  if (!uid || uid === 'guest') {
    return { success: false, message: 'No valid user authenticated' };
  }

  try {
    // 1. Fetch Sales
    const salesSnap = await getDocs(
      query(collection(db, 'sales'), where('ownerId', '==', uid))
    );
    const remoteSales: SaleTransaction[] = [];
    salesSnap.forEach((d) => remoteSales.push(d.data() as SaleTransaction));

    // 2. Fetch Purchases
    const purchasesSnap = await getDocs(
      query(collection(db, 'purchases'), where('ownerId', '==', uid))
    );
    const remotePurchases: PurchaseItem[] = [];
    purchasesSnap.forEach((d) => remotePurchases.push(d.data() as PurchaseItem));

    // 3. Fetch Bank Accounts
    const bankAccountsSnap = await getDocs(
      query(collection(db, 'bankAccounts'), where('ownerId', '==', uid))
    );
    const remoteBankAccounts: BankAccount[] = [];
    bankAccountsSnap.forEach((d) => remoteBankAccounts.push(d.data() as BankAccount));

    // 4. Fetch Bank Transactions
    const bankTxSnap = await getDocs(
      query(collection(db, 'bankTransactions'), where('ownerId', '==', uid))
    );
    const remoteBankTransactions: BankTransaction[] = [];
    bankTxSnap.forEach((d) => remoteBankTransactions.push(d.data() as BankTransaction));

    // 5. Fetch Daily Closes
    const dailyClosesSnap = await getDocs(
      query(collection(db, 'dailyCloses'), where('ownerId', '==', uid))
    );
    const remoteDailyCloses: DailyRegisterClose[] = [];
    dailyClosesSnap.forEach((d) => remoteDailyCloses.push(d.data() as DailyRegisterClose));

    // 6. Fetch Reconciling Items
    const reconcilingSnap = await getDocs(
      query(collection(db, 'reconcilingItems'), where('ownerId', '==', uid))
    );
    const remoteReconcilingItems: ReconcilingItem[] = [];
    reconcilingSnap.forEach((d) => remoteReconcilingItems.push(d.data() as ReconcilingItem));

    // 7. Fetch BRS Statements
    const brsSnap = await getDocs(
      query(collection(db, 'brsStatements'), where('ownerId', '==', uid))
    );
    const remoteBrsStatements: BankReconciliationStatement[] = [];
    brsSnap.forEach((d) => remoteBrsStatements.push(d.data() as BankReconciliationStatement));

    // 8. Fetch Tax Settings
    const settingsDocSnap = await getDoc(doc(db, 'settings', uid));
    const remoteSettings = settingsDocSnap.exists()
      ? (settingsDocSnap.data() as TaxSettings)
      : undefined;

    const hasRemoteData =
      remoteSales.length > 0 ||
      remotePurchases.length > 0 ||
      remoteBankAccounts.length > 0 ||
      Boolean(remoteSettings);

    if (hasRemoteData) {
      onDataLoaded({
        sales: remoteSales,
        purchases: remotePurchases,
        bankAccounts: remoteBankAccounts,
        bankTransactions: remoteBankTransactions,
        dailyCloses: remoteDailyCloses,
        reconcilingItems: remoteReconcilingItems,
        brsStatements: remoteBrsStatements,
        settings: remoteSettings,
      });
      setInitialCloudSyncDone(uid);
      return {
        success: true,
        message: `Synced ${remoteSales.length} sales and ${remotePurchases.length} purchases from Cloud Firestore.`,
      };
    } else {
      // Remote is empty, hydrate local data to state
      const local = loadUserLocalData(uid);
      onDataLoaded(local);
      setInitialCloudSyncDone(uid);
      return {
        success: true,
        message: 'Connected to Firestore cloud database.',
      };
    }
  } catch (err: unknown) {
    console.warn('Initial Firestore sync warning:', err);
    try {
      handleFirestoreError(err, OperationType.LIST, `users/${uid}`);
    } catch (e) {
      console.error('Handled initial sync error:', e);
    }
    // Fall back to local phone data without blocking the user
    const local = loadUserLocalData(uid);
    onDataLoaded(local);
    return {
      success: false,
      message: 'Network offline. Using local device storage.',
    };
  }
}

export function queueAllLocalDataForSync(uid?: string | null): number {
  const activeUid = uid || 'local';
  const local = loadUserLocalData(activeUid);
  let count = 0;

  for (const s of local.sales) {
    enqueueSyncMutation({
      id: `queue-sale-${s.id}`,
      uid: activeUid,
      collection: 'sales',
      operation: 'set',
      docId: s.id,
      data: s as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    count++;
  }

  for (const p of local.purchases) {
    enqueueSyncMutation({
      id: `queue-purchase-${p.id}`,
      uid: activeUid,
      collection: 'purchases',
      operation: 'set',
      docId: p.id,
      data: p as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    count++;
  }

  for (const b of local.bankAccounts) {
    enqueueSyncMutation({
      id: `queue-bankacc-${b.id}`,
      uid: activeUid,
      collection: 'bankAccounts',
      operation: 'set',
      docId: b.id,
      data: b as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    count++;
  }

  return count;
}
