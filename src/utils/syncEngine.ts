import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db, isFirestoreQuotaError, isFirestoreOfflineError } from '../firebase';
import {
  getPendingSyncMutations,
  removeSyncMutation,
  setLastSyncTime,
  setQuotaExceededFlag,
  getQuotaExceededFlag,
  loadUserLocalData,
  enqueueSyncMutation,
  saveUserLocalCollection,
  saveUserLocalSettings,
  SyncMutation,
} from './storage';
import { DEFAULT_TAX_SETTINGS } from './formatters';
import { idbGet } from './idbStorage';
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
 * Synchronizes all pending local mutations from phone storage to Firestore.
 */
export async function syncPendingToFirestore(uid: string): Promise<SyncResult> {
  if (!uid) {
    return {
      success: false,
      syncedCount: 0,
      remainingCount: 0,
      reason: 'error',
      errorMessage: 'User must be signed in to sync data with online database.',
    };
  }

  const pending = getPendingSyncMutations(uid);
  if (pending.length === 0) {
    setQuotaExceededFlag(false);
    setLastSyncTime(uid, Date.now());
    return {
      success: true,
      syncedCount: 0,
      remainingCount: 0,
      reason: 'completed',
    };
  }

  let syncedCount = 0;

  for (const item of [...pending]) {
    try {
      const docRef = doc(db, item.collection, item.docId);

      if (item.operation === 'delete') {
        try {
          await deleteDoc(docRef);
        } catch (delErr: unknown) {
          const msg = delErr instanceof Error ? delErr.message : String(delErr);
          if (
            msg.includes('permission') ||
            msg.includes('not-found') ||
            msg.includes('Missing or insufficient permissions')
          ) {
            console.warn(
              `Doc ${item.collection}/${item.docId} not deletable in remote, removing from queue:`,
              msg
            );
          } else {
            throw delErr;
          }
        }
      } else {
        const itemData = { ...(item.data || {}) };
        if (
          itemData.receiptImage &&
          typeof itemData.receiptImage === 'string' &&
          itemData.receiptImage.startsWith('idb://')
        ) {
          const idbKey = itemData.receiptImage.replace('idb://', '');
          const fullImg = await idbGet<string>(idbKey);
          if (fullImg) {
            itemData.receiptImage = fullImg;
          } else {
            delete itemData.receiptImage;
          }
        }

        if (item.operation === 'set') {
          const payload: Record<string, unknown> = {
            ...itemData,
            ownerId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(docRef, payload, { merge: true });
        } else if (item.operation === 'update') {
          const payload: Record<string, unknown> = {
            ...itemData,
            updatedAt: serverTimestamp(),
          };
          await updateDoc(docRef, payload);
        }
      }

      removeSyncMutation(item.id, uid);
      syncedCount++;
    } catch (err: unknown) {
      console.warn(`Sync failed for item ${item.collection}/${item.docId}:`, err);

      if (isFirestoreQuotaError(err)) {
        setQuotaExceededFlag(true);
        return {
          success: false,
          syncedCount,
          remainingCount: pending.length - syncedCount,
          reason: 'quota_exceeded',
          errorMessage:
            'Firebase daily free quota limit exceeded. All your data is safely saved in your phone storage and will sync when quota resets.',
        };
      }

      if (isFirestoreOfflineError(err) || !navigator.onLine) {
        return {
          success: false,
          syncedCount,
          remainingCount: pending.length - syncedCount,
          reason: 'offline',
          errorMessage:
            'Device is currently offline. All changes remain saved locally and will sync once internet returns.',
        };
      }

      // If specific doc has invalid permissions or corrupt data, remove it from queue to unblock remainder
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission') || msg.includes('Missing or insufficient permissions')) {
        console.warn(`Removing unwriteable mutation ${item.id} to avoid permanent queue block.`);
        removeSyncMutation(item.id, uid);
        continue;
      }

      return {
        success: false,
        syncedCount,
        remainingCount: pending.length - syncedCount,
        reason: 'error',
        errorMessage: msg,
      };
    }
  }

  setLastSyncTime(uid, Date.now());
  setQuotaExceededFlag(false);

  return {
    success: true,
    syncedCount,
    remainingCount: 0,
    reason: 'completed',
  };
}

/**
 * Synchronizes an individual mutation to Firestore immediately after an operation.
 * If quota is exceeded or offline, leaves mutation in queue for later sync.
 */
export async function syncOperationToFirestore(
  mutation: SyncMutation
): Promise<{ success: boolean; isQuota?: boolean; isOffline?: boolean; error?: string }> {
  if (!mutation.uid || mutation.uid === 'guest') {
    return { success: true };
  }

  if (getQuotaExceededFlag()) {
    return { success: false, isQuota: true };
  }

  if (!navigator.onLine) {
    return { success: false, isOffline: true };
  }

  try {
    const docRef = doc(db, mutation.collection, mutation.docId);

    if (mutation.operation === 'delete') {
      try {
        await deleteDoc(docRef);
      } catch (delErr: unknown) {
        const msg = delErr instanceof Error ? delErr.message : String(delErr);
        if (
          msg.includes('permission') ||
          msg.includes('not-found') ||
          msg.includes('Missing or insufficient permissions')
        ) {
          console.warn(
            `Doc ${mutation.collection}/${mutation.docId} not deletable in remote, removing from queue:`,
            msg
          );
        } else {
          throw delErr;
        }
      }
    } else {
      const itemData = { ...(mutation.data || {}) };
      if (
        itemData.receiptImage &&
        typeof itemData.receiptImage === 'string' &&
        itemData.receiptImage.startsWith('idb://')
      ) {
        const idbKey = itemData.receiptImage.replace('idb://', '');
        const fullImg = await idbGet<string>(idbKey);
        if (fullImg) {
          itemData.receiptImage = fullImg;
        } else {
          delete itemData.receiptImage;
        }
      }

      if (mutation.operation === 'set') {
        const payload: Record<string, unknown> = {
          ...itemData,
          ownerId: mutation.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(docRef, payload, { merge: true });
      } else if (mutation.operation === 'update') {
        const payload: Record<string, unknown> = {
          ...itemData,
          updatedAt: serverTimestamp(),
        };
        await updateDoc(docRef, payload);
      }
    }

    removeSyncMutation(mutation.id, mutation.uid);
    setLastSyncTime(mutation.uid, Date.now());
    setQuotaExceededFlag(false);
    return { success: true };
  } catch (err: unknown) {
    if (isFirestoreQuotaError(err)) {
      setQuotaExceededFlag(true);
      return { success: false, isQuota: true };
    }
    if (isFirestoreOfflineError(err)) {
      return { success: false, isOffline: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Missing or insufficient permissions') && mutation.operation === 'delete') {
      removeSyncMutation(mutation.id, mutation.uid);
      return { success: true };
    }
    console.warn(`Immediate sync failed for ${mutation.collection}/${mutation.docId}:`, err);
    return { success: false, error: msg };
  }
}

/**
 * Queue all local phone records for a full initial sync into Firestore if needed.
 */
export function queueAllLocalDataForSync(uid: string): number {
  if (!uid) return 0;
  const data = loadUserLocalData(uid);
  let queued = 0;

  // Queue settings
  if (data.settings.taxIdNumber) {
    enqueueSyncMutation({
      id: `sync-settings-${uid}-${Date.now()}`,
      uid,
      collection: 'settings',
      operation: 'set',
      docId: uid,
      data: {
        businessName: data.settings.businessName,
        taxIdNumber: data.settings.taxIdNumber,
        currency: data.settings.currency,
        currencySymbol: data.settings.currencySymbol,
        defaultSalesTaxRate: data.settings.defaultSalesTaxRate,
        corporateTaxRate: data.settings.corporateTaxRate,
        fiscalYearStartMonth: data.settings.fiscalYearStartMonth,
      },
      timestamp: Date.now(),
    });
    queued++;
  }

  // Queue bank accounts
  data.bankAccounts.forEach((acc) => {
    enqueueSyncMutation({
      id: `sync-acc-${acc.id}`,
      uid,
      collection: 'bankAccounts',
      operation: 'set',
      docId: acc.id,
      data: acc as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  // Queue sales
  data.sales.forEach((s) => {
    enqueueSyncMutation({
      id: `sync-sale-${s.id}`,
      uid,
      collection: 'sales',
      operation: 'set',
      docId: s.id,
      data: s as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  // Queue purchases
  data.purchases.forEach((p) => {
    enqueueSyncMutation({
      id: `sync-purchase-${p.id}`,
      uid,
      collection: 'purchases',
      operation: 'set',
      docId: p.id,
      data: p as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  // Queue bank transactions
  data.bankTransactions.forEach((tx) => {
    enqueueSyncMutation({
      id: `sync-btx-${tx.id}`,
      uid,
      collection: 'bankTransactions',
      operation: 'set',
      docId: tx.id,
      data: tx as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  // Queue daily closes
  data.dailyCloses.forEach((c) => {
    enqueueSyncMutation({
      id: `sync-close-${c.id}`,
      uid,
      collection: 'dailyCloses',
      operation: 'set',
      docId: c.id,
      data: c as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  // Queue reconciling items
  data.reconcilingItems.forEach((r) => {
    enqueueSyncMutation({
      id: `sync-rec-${r.id}`,
      uid,
      collection: 'reconcilingItems',
      operation: 'set',
      docId: r.id,
      data: r as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  // Queue BRS statements
  data.brsStatements.forEach((b) => {
    enqueueSyncMutation({
      id: `sync-brs-${b.id}`,
      uid,
      collection: 'brsStatements',
      operation: 'set',
      docId: b.id,
      data: b as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
    queued++;
  });

  return queued;
}

export interface UserSyncedData {
  sales?: SaleTransaction[];
  purchases?: PurchaseItem[];
  bankAccounts?: BankAccount[];
  bankTransactions?: BankTransaction[];
  dailyCloses?: DailyRegisterClose[];
  reconcilingItems?: ReconcilingItem[];
  brsStatements?: BankReconciliationStatement[];
  settings?: TaxSettings;
}

export function hasDoneInitialCloudSync(uid?: string | null): boolean {
  if (!uid || uid === 'guest') return true;
  try {
    return localStorage.getItem(`taxguard_initial_sync_done_${uid}`) === 'true';
  } catch {
    return false;
  }
}

export function setInitialCloudSyncDone(uid?: string | null, done = true): void {
  if (!uid || uid === 'guest') return;
  try {
    if (done) {
      localStorage.setItem(`taxguard_initial_sync_done_${uid}`, 'true');
    } else {
      localStorage.removeItem(`taxguard_initial_sync_done_${uid}`);
    }
  } catch (err) {
    console.error('Failed to set initial sync flag:', err);
  }
}

/**
 * First-time sync to the database and populate local storage:
 * - If Firestore has data: populates local storage and notifies React state.
 * - If Firestore is empty and local storage has records: syncs local records to database.
 * - Gracefully catches quota limit / offline conditions without crashing.
 */
export async function performFirstTimeCloudSync(
  uid: string,
  onProgress?: (data: UserSyncedData) => void,
  force = false
): Promise<{ success: boolean; populatedFromRemote: boolean; message: string }> {
  if (!uid || uid === 'guest') {
    return { success: true, populatedFromRemote: false, message: 'Local storage is active (guest mode).' };
  }

  // If already synced previously on this device and not forced, skip the heavy multi-query initial pull
  if (!force && hasDoneInitialCloudSync(uid)) {
    return { success: true, populatedFromRemote: false, message: 'Initial cloud sync previously completed.' };
  }

  if (!navigator.onLine) {
    return { success: false, populatedFromRemote: false, message: 'Device is offline. Local storage is active.' };
  }

  try {
    let remoteDocCount = 0;
    const syncedData: UserSyncedData = {};

    // 1. Fetch Sales
    try {
      const salesSnap = await getDocs(query(collection(db, 'sales'), where('ownerId', '==', uid)));
      if (!salesSnap.empty) {
        remoteDocCount += salesSnap.size;
        const fetchedSales: SaleTransaction[] = salesSnap.docs.map((d) => {
          const data = d.data();
          const totalAmount = Number(data.totalAmount) || 0;
          const bankTransferAmount =
            typeof data.bankTransferAmount === 'number'
              ? Math.min(Math.max(0, Number(data.bankTransferAmount)), totalAmount)
              : data.paymentMethod === 'bank_transfer'
              ? totalAmount
              : 0;
          const cashAmount = Math.max(0, totalAmount - bankTransferAmount);
          return {
            id: data.id,
            receiptNumber: data.receiptNumber || 'REC-001',
            date: data.date,
            time: data.time || '17:00',
            customerName: data.customerName,
            items: data.items || [],
            subtotal: Number(data.subtotal) || 0,
            taxRate: Number(data.taxRate) || 0,
            taxAmount: Number(data.taxAmount) || 0,
            totalAmount,
            cashAmount,
            bankTransferAmount,
            paymentMethod: bankTransferAmount > 0 && cashAmount === 0 ? 'bank_transfer' : 'cash',
            bankAccountId: data.bankAccountId,
            isReconciledWithBank: Boolean(data.isReconciledWithBank),
            notes: data.notes,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
          };
        });
        fetchedSales.sort((a, b) => b.date.localeCompare(a.date));
        saveUserLocalCollection('sales', fetchedSales, uid);
        syncedData.sales = fetchedSales;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial sales sync skipped:', err);
    }

    // 2. Fetch Purchases
    try {
      const purSnap = await getDocs(query(collection(db, 'purchases'), where('ownerId', '==', uid)));
      if (!purSnap.empty) {
        remoteDocCount += purSnap.size;
        const fetchedPurchases: PurchaseItem[] = purSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.id,
            invoiceNumber: data.invoiceNumber || 'INV-001',
            date: data.date,
            vendorName: data.vendorName || 'Supplier',
            vendorTin: data.vendorTin,
            itemName: data.itemName || 'Goods',
            category: data.category || 'inventory_cogs',
            quantity: Number(data.quantity) || 1,
            unitCost: Number(data.unitCost) || 0,
            subtotal: Number(data.subtotal) || 0,
            taxRate: Number(data.taxRate) || 0,
            taxAmount: Number(data.taxAmount) || 0,
            totalAmount: Number(data.totalAmount) || 0,
            deductibility: data.deductibility || 'fully_deductible',
            deductiblePercentage: Number(data.deductiblePercentage) || 100,
            paymentMethod: data.paymentMethod || 'cash',
            bankAccountId: data.bankAccountId,
            isReconciledWithBank: Boolean(data.isReconciledWithBank),
            receiptImage: data.receiptImage,
            notes: data.notes,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
          };
        });
        fetchedPurchases.sort((a, b) => b.date.localeCompare(a.date));
        saveUserLocalCollection('purchases', fetchedPurchases, uid);
        syncedData.purchases = fetchedPurchases;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial purchases sync skipped:', err);
    }

    // 3. Fetch Bank Accounts
    try {
      const accSnap = await getDocs(query(collection(db, 'bankAccounts'), where('ownerId', '==', uid)));
      if (!accSnap.empty) {
        remoteDocCount += accSnap.size;
        const fetchedAccounts: BankAccount[] = accSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.id,
            name: data.name,
            bankName: data.bankName,
            accountNumberMasked: data.accountNumberMasked,
            type: data.type || 'checking',
            currentBalance: Number(data.currentBalance) || 0,
            currency: data.currency || 'ETB',
            color: data.color || '#ea580c',
          };
        });
        saveUserLocalCollection('bankAccounts', fetchedAccounts, uid);
        syncedData.bankAccounts = fetchedAccounts;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial bankAccounts sync skipped:', err);
    }

    // 4. Fetch Bank Transactions
    try {
      const txSnap = await getDocs(query(collection(db, 'bankTransactions'), where('ownerId', '==', uid)));
      if (!txSnap.empty) {
        remoteDocCount += txSnap.size;
        const fetchedTxs: BankTransaction[] = txSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.id,
            bankAccountId: data.bankAccountId,
            date: data.date,
            description: data.description,
            type: data.type || 'credit',
            amount: Number(data.amount) || 0,
            category: data.category || 'general_income',
            referenceId: data.referenceId,
            isReconciled: Boolean(data.isReconciled),
            notes: data.notes,
          };
        });
        fetchedTxs.sort((a, b) => b.date.localeCompare(a.date));
        saveUserLocalCollection('bankTransactions', fetchedTxs, uid);
        syncedData.bankTransactions = fetchedTxs;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial bankTransactions sync skipped:', err);
    }

    // 5. Fetch Daily Closes
    try {
      const closeSnap = await getDocs(query(collection(db, 'dailyCloses'), where('ownerId', '==', uid)));
      if (!closeSnap.empty) {
        remoteDocCount += closeSnap.size;
        const fetchedCloses: DailyRegisterClose[] = closeSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.id,
            date: data.date,
            openingFloat: Number(data.openingFloat) || 0,
            cashSales: Number(data.cashSales) || 0,
            cardSales: Number(data.cardSales) || 0,
            bankTransferSales: Number(data.bankTransferSales) || 0,
            totalGrossSales: Number(data.totalGrossSales) || 0,
            totalTaxCollected: Number(data.totalTaxCollected) || 0,
            cashPaidOutForPurchases: Number(data.cashPaidOutForPurchases) || 0,
            actualCashCounted: Number(data.actualCashCounted) || 0,
            cashVariance: Number(data.cashVariance) || 0,
            bankDepositAmount: Number(data.bankDepositAmount) || 0,
            closedBy: data.closedBy,
            status: data.status,
            notes: data.notes,
          };
        });
        saveUserLocalCollection('dailyCloses', fetchedCloses, uid);
        syncedData.dailyCloses = fetchedCloses;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial dailyCloses sync skipped:', err);
    }

    // 6. Fetch Settings
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', uid));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        const loadedSettings: TaxSettings = {
          businessName: data.businessName || DEFAULT_TAX_SETTINGS.businessName,
          taxIdNumber: data.taxIdNumber || DEFAULT_TAX_SETTINGS.taxIdNumber,
          currency: data.currency || DEFAULT_TAX_SETTINGS.currency,
          currencySymbol: data.currencySymbol || DEFAULT_TAX_SETTINGS.currencySymbol,
          defaultSalesTaxRate:
            typeof data.defaultSalesTaxRate === 'number'
              ? data.defaultSalesTaxRate
              : DEFAULT_TAX_SETTINGS.defaultSalesTaxRate,
          corporateTaxRate:
            typeof data.corporateTaxRate === 'number'
              ? data.corporateTaxRate
              : DEFAULT_TAX_SETTINGS.corporateTaxRate,
          fiscalYearStartMonth:
            typeof data.fiscalYearStartMonth === 'number'
              ? data.fiscalYearStartMonth
              : DEFAULT_TAX_SETTINGS.fiscalYearStartMonth,
        };
        saveUserLocalSettings(loadedSettings, uid);
        syncedData.settings = loadedSettings;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial settings sync skipped:', err);
    }

    // 7. Fetch Reconciling Items (CBRS)
    try {
      const recSnap = await getDocs(
        query(collection(db, 'reconcilingItems'), where('ownerId', '==', uid))
      );
      if (!recSnap.empty) {
        remoteDocCount += recSnap.size;
        const fetchedRecs: ReconcilingItem[] = recSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.id,
            bankAccountId: data.bankAccountId,
            date: data.date,
            type: data.type || 'deposit_in_transit',
            referenceNumber: data.referenceNumber,
            partyOrDescription: data.partyOrDescription,
            amount: Number(data.amount) || 0,
            isCleared: Boolean(data.isCleared),
            notes: data.notes,
          };
        });
        fetchedRecs.sort((a, b) => b.date.localeCompare(a.date));
        saveUserLocalCollection('reconcilingItems', fetchedRecs, uid);
        syncedData.reconcilingItems = fetchedRecs;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial reconcilingItems sync skipped:', err);
    }

    // 8. Fetch BRS Statements
    try {
      const brsSnap = await getDocs(
        query(collection(db, 'brsStatements'), where('ownerId', '==', uid))
      );
      if (!brsSnap.empty) {
        remoteDocCount += brsSnap.size;
        const fetchedBrs: BankReconciliationStatement[] = brsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.id,
            statementNumber: data.statementNumber,
            bankAccountId: data.bankAccountId,
            statementDate: data.statementDate,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            balancePerBankStatement: Number(data.balancePerBankStatement) || 0,
            unadjustedBookBalance: Number(data.unadjustedBookBalance) || 0,
            depositsInTransitTotal: Number(data.depositsInTransitTotal) || 0,
            outstandingChequesTotal: Number(data.outstandingChequesTotal) || 0,
            unrecordedCreditsTotal: Number(data.unrecordedCreditsTotal) || 0,
            bankChargesTotal: Number(data.bankChargesTotal) || 0,
            adjustedBankBalance: Number(data.adjustedBankBalance) || 0,
            adjustedBookBalance: Number(data.adjustedBookBalance) || 0,
            variance: Number(data.variance) || 0,
            status: data.status,
            preparedBy: data.preparedBy,
            certifiedAt: data.certifiedAt,
            notes: data.notes,
          };
        });
        fetchedBrs.sort((a, b) => b.statementDate.localeCompare(a.statementDate));
        saveUserLocalCollection('brsStatements', fetchedBrs, uid);
        syncedData.brsStatements = fetchedBrs;
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn('Initial brsStatements sync skipped:', err);
    }

    if (onProgress && Object.keys(syncedData).length > 0) {
      onProgress(syncedData);
    }

    // If Firestore was empty and local storage has records, upload local records to database
    if (remoteDocCount === 0) {
      const local = loadUserLocalData(uid);
      const totalLocalRecords =
        local.sales.length + local.purchases.length + local.bankTransactions.length;
      if (totalLocalRecords > 0) {
        queueAllLocalDataForSync(uid);
        await syncPendingToFirestore(uid);
      }
    }

    setInitialCloudSyncDone(uid, true);
    setLastSyncTime(uid, Date.now());
    setQuotaExceededFlag(false);

    return {
      success: true,
      populatedFromRemote: remoteDocCount > 0,
      message:
        remoteDocCount > 0
          ? `Populated local storage with ${remoteDocCount} records from cloud database.`
          : 'First-time database sync completed.',
    };
  } catch (err: unknown) {
    if (isFirestoreQuotaError(err)) {
      setQuotaExceededFlag(true);
      return {
        success: false,
        populatedFromRemote: false,
        message: 'Daily cloud read quota reached. All data is active and securely saved in local storage.',
      };
    }
    return {
      success: false,
      populatedFromRemote: false,
      message: err instanceof Error ? err.message : 'Initial sync deferred.',
    };
  }
}
