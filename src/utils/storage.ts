import {
  BankAccount,
  BankReconciliationStatement,
  BankTransaction,
  DailyRegisterClose,
  PurchaseItem,
  ReconcilingItem,
  SaleTransaction,
  TaxSettings,
} from '../types';
import { DEFAULT_TAX_SETTINGS } from './formatters';
export { DEFAULT_TAX_SETTINGS };
import {
  idbSet,
  saveReceiptImageToIDB,
  getReceiptImageFromIDB,
} from './idbStorage';

export interface SyncMutation {
  id: string;
  uid: string;
  collection:
    | 'sales'
    | 'purchases'
    | 'bankAccounts'
    | 'bankTransactions'
    | 'dailyCloses'
    | 'reconcilingItems'
    | 'brsStatements'
    | 'settings';
  operation: 'set' | 'update' | 'delete';
  docId: string;
  data?: Record<string, unknown> | null;
  timestamp: number;
}

export interface LocalStorageStats {
  salesCount: number;
  purchasesCount: number;
  bankAccountsCount: number;
  bankTransactionsCount: number;
  dailyClosesCount: number;
  reconcilingItemsCount: number;
  brsStatementsCount: number;
  hasSettings: boolean;
  pendingSyncCount: number;
  lastSyncTime: number | null;
  estimatedSizeKb: number;
  isQuotaExceeded: boolean;
}

const STORAGE_KEYS = {
  SALES: 'taxguard_sales_solomon_v4_clean',
  PURCHASES: 'taxguard_purchases_solomon_v4_clean',
  BANK_ACCOUNTS: 'taxguard_bank_accounts_solomon_v4_clean',
  BANK_TRANSACTIONS: 'taxguard_bank_transactions_solomon_v4_clean',
  DAILY_CLOSES: 'taxguard_daily_closes_solomon_v4_clean',
  SETTINGS: 'taxguard_settings_solomon_v4_clean',
  RECONCILING_ITEMS: 'taxguard_reconciling_items_solomon_v4_clean',
  BRS_STATEMENTS: 'taxguard_brs_statements_solomon_v4_clean',
  SYNC_QUEUE: 'taxguard_offline_sync_queue',
  LAST_SYNC: 'taxguard_last_synced_timestamp',
  QUOTA_FLAG: 'taxguard_firestore_quota_exceeded',
  SAVED_APPS_SCRIPT_URL: 'taxguard_persistent_google_apps_script_url',
  SAVED_GOOGLE_SHEET_ID: 'taxguard_persistent_google_sheet_id',
  SAVED_GOOGLE_SHEET_URL: 'taxguard_persistent_google_sheet_url',
  SAVED_GOOGLE_SHEET_NAME: 'taxguard_persistent_google_sheet_name',
};

function getKey(baseKey: string, uid?: string | null): string {
  if (!uid || uid === 'guest') return baseKey;
  return `${baseKey}_${uid}`;
}

export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'acc-cbe-main',
    name: 'Commercial Bank of Ethiopia (CBE)',
    bankName: 'Commercial Bank of Ethiopia (CBE)',
    accountNumberMasked: '•••• 4226',
    type: 'checking',
    currentBalance: 0,
    currency: 'ETB',
    color: '#ea580c',
  },
];
export const INITIAL_SALES: SaleTransaction[] = [];
export const INITIAL_PURCHASES: PurchaseItem[] = [];
export const INITIAL_BANK_TRANSACTIONS: BankTransaction[] = [];
export const INITIAL_DAILY_CLOSES: DailyRegisterClose[] = [];
export const INITIAL_RECONCILING_ITEMS: ReconcilingItem[] = [];
export const INITIAL_BRS_STATEMENTS: BankReconciliationStatement[] = [];

// Helper functions for reading and writing to localStorage
export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);

    if (key.includes('settings') && parsed && typeof parsed === 'object') {
      parsed.businessName = parsed.businessName || 'Solomon Building Materials Shop';
      parsed.currency = parsed.currency || 'ETB';
      parsed.currencySymbol = parsed.currencySymbol || 'ETB ';
      parsed.defaultSalesTaxRate = parsed.defaultSalesTaxRate ?? 0.15;
    }
    return parsed;
  } catch (err) {
    console.error(`Failed to load ${key} from storage:`, err);
    return fallback;
  }
}

export function evictUnnecessaryStorage(): void {
  try {
    const keysToRemove: string[] = [];
    const totalKeys = localStorage.length;
    for (let i = 0; i < totalKeys; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // 1. Remove duplicate unsuffixed keys if suffixed keys exist
      if (
        k === STORAGE_KEYS.SALES ||
        k === STORAGE_KEYS.PURCHASES ||
        k === STORAGE_KEYS.BANK_TRANSACTIONS ||
        k === STORAGE_KEYS.SETTINGS
      ) {
        const hasSuffixed = Array.from({ length: totalKeys })
          .map((_, idx) => localStorage.key(idx))
          .some((otherKey) => otherKey && otherKey.startsWith(`${k}_`));
        if (hasSuffixed) {
          keysToRemove.push(k);
        }
      }

      // 2. Remove old temporary or deprecated cache keys
      if (
        k.includes('_v1') ||
        k.includes('_v2') ||
        k.includes('_v3') ||
        k.startsWith('taxguard_temp_')
      ) {
        keysToRemove.push(k);
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

function stripHeavyPayloads(data: any): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((item) => stripHeavyPayloads(item));
  }
  if (typeof data === 'object') {
    const clone: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      // If string is larger than 5KB (e.g. base64 image or large blob)
      if (typeof v === 'string' && v.length > 5000) {
        if (k === 'receiptImage' && (data as any).id) {
          saveReceiptImageToIDB((data as any).id, v).catch(() => {});
          clone[k] = `idb://receipt_img_${(data as any).id}`;
        } else {
          clone[k] = v.slice(0, 200) + '...[truncated]';
        }
      } else if (typeof v === 'object' && v !== null) {
        clone[k] = stripHeavyPayloads(v);
      } else {
        clone[k] = v;
      }
    }
    return clone;
  }
  return data;
}

export function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err: unknown) {
    // Self-healing handling for QuotaExceededError
    console.warn(`[Phone Storage] Storage limit reached for ${key}. Optimizing storage...`);
    evictUnnecessaryStorage();

    try {
      const sanitized = stripHeavyPayloads(data);
      localStorage.setItem(key, JSON.stringify(sanitized));
    } catch {
      console.warn(`[Phone Storage] Offloaded large payload for ${key} to IndexedDB.`);
      idbSet(key, data).catch(() => {});
    }
  }
}

// User-scoped loaders and savers for complete phone storage
export function loadUserLocalData(uid?: string | null) {
  // Check user-specific storage first; if empty, fall back to global base key
  const userSalesKey = getKey(STORAGE_KEYS.SALES, uid);
  let sales = loadFromStorage<SaleTransaction[]>(userSalesKey, []);
  if (sales.length === 0 && uid) {
    sales = loadFromStorage<SaleTransaction[]>(STORAGE_KEYS.SALES, []);
  }

  const userPurchasesKey = getKey(STORAGE_KEYS.PURCHASES, uid);
  let purchases = loadFromStorage<PurchaseItem[]>(userPurchasesKey, []);
  if (purchases.length === 0 && uid) {
    purchases = loadFromStorage<PurchaseItem[]>(STORAGE_KEYS.PURCHASES, []);
  }

  const userBankAccountsKey = getKey(STORAGE_KEYS.BANK_ACCOUNTS, uid);
  let bankAccounts = loadFromStorage<BankAccount[]>(userBankAccountsKey, []);
  if (bankAccounts.length === 0 && uid) {
    bankAccounts = loadFromStorage<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, []);
  }
  if (bankAccounts.length === 0) {
    bankAccounts = INITIAL_BANK_ACCOUNTS;
    saveUserLocalCollection('bankAccounts', bankAccounts, uid);
  }

  const userBankTxKey = getKey(STORAGE_KEYS.BANK_TRANSACTIONS, uid);
  let bankTransactions = loadFromStorage<BankTransaction[]>(userBankTxKey, []);
  if (bankTransactions.length === 0 && uid) {
    bankTransactions = loadFromStorage<BankTransaction[]>(STORAGE_KEYS.BANK_TRANSACTIONS, []);
  }
  if (bankTransactions.length === 0) {
    bankTransactions = INITIAL_BANK_TRANSACTIONS;
  }

  const userDailyClosesKey = getKey(STORAGE_KEYS.DAILY_CLOSES, uid);
  let dailyCloses = loadFromStorage<DailyRegisterClose[]>(userDailyClosesKey, []);
  if (dailyCloses.length === 0 && uid) {
    dailyCloses = loadFromStorage<DailyRegisterClose[]>(STORAGE_KEYS.DAILY_CLOSES, []);
  }

  const userReconcilingKey = getKey(STORAGE_KEYS.RECONCILING_ITEMS, uid);
  let reconcilingItems = loadFromStorage<ReconcilingItem[]>(userReconcilingKey, []);
  if (reconcilingItems.length === 0 && uid) {
    reconcilingItems = loadFromStorage<ReconcilingItem[]>(STORAGE_KEYS.RECONCILING_ITEMS, []);
  }

  const userBrsKey = getKey(STORAGE_KEYS.BRS_STATEMENTS, uid);
  let brsStatements = loadFromStorage<BankReconciliationStatement[]>(userBrsKey, []);
  if (brsStatements.length === 0 && uid) {
    brsStatements = loadFromStorage<BankReconciliationStatement[]>(STORAGE_KEYS.BRS_STATEMENTS, []);
  }

  const userSettingsKey = getKey(STORAGE_KEYS.SETTINGS, uid);
  let settings = loadFromStorage<TaxSettings>(userSettingsKey, DEFAULT_TAX_SETTINGS);
  if (!settings.taxIdNumber && uid) {
    settings = loadFromStorage<TaxSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_TAX_SETTINGS);
  }

  // Restore persistent Google Sheets connection if missing from settings
  try {
    const savedUrl = localStorage.getItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL);
    const savedId = localStorage.getItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID);
    const savedSheetUrl = localStorage.getItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_URL);
    const savedName = localStorage.getItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_NAME);
    if (!settings.googleAppsScriptUrl && savedUrl) {
      settings.googleAppsScriptUrl = savedUrl;
    }
    if (!settings.googleSheetId && savedId) {
      settings.googleSheetId = savedId;
    }
    if (!settings.googleSheetUrl && savedSheetUrl) {
      settings.googleSheetUrl = savedSheetUrl;
    }
    if (!settings.googleSheetName && savedName) {
      settings.googleSheetName = savedName;
    }
  } catch {}

  return {
    sales,
    purchases,
    bankAccounts,
    bankTransactions,
    dailyCloses,
    reconcilingItems,
    brsStatements,
    settings,
  };
}

export function saveUserLocalCollection<T>(
  collectionName:
    | 'sales'
    | 'purchases'
    | 'bankAccounts'
    | 'bankTransactions'
    | 'dailyCloses'
    | 'reconcilingItems'
    | 'brsStatements',
  items: T,
  uid?: string | null
): void {
  const baseKeyMap: Record<string, string> = {
    sales: STORAGE_KEYS.SALES,
    purchases: STORAGE_KEYS.PURCHASES,
    bankAccounts: STORAGE_KEYS.BANK_ACCOUNTS,
    bankTransactions: STORAGE_KEYS.BANK_TRANSACTIONS,
    dailyCloses: STORAGE_KEYS.DAILY_CLOSES,
    reconcilingItems: STORAGE_KEYS.RECONCILING_ITEMS,
    brsStatements: STORAGE_KEYS.BRS_STATEMENTS,
  };
  const baseKey = baseKeyMap[collectionName];
  if (!baseKey) return;

  const targetKey = getKey(baseKey, uid);

  // Always mirror full raw data to high-capacity IndexedDB in the background
  idbSet(targetKey, items).catch(() => {});

  if (collectionName === 'purchases' && Array.isArray(items)) {
    // For purchases, save any large receipt images to IndexedDB and lightweight reference in localStorage
    const lightweightItems = (items as unknown as PurchaseItem[]).map((p) => {
      if (p.receiptImage && p.receiptImage.length > 5000) {
        saveReceiptImageToIDB(p.id, p.receiptImage).catch(() => {});
        return {
          ...p,
          receiptImage: `idb://receipt_img_${p.id}`,
        };
      }
      return p;
    });

    saveToStorage(targetKey, lightweightItems);
  } else {
    saveToStorage(targetKey, items);
  }

  // Remove duplicate un-suffixed baseKey if uid exists to prevent double storage usage
  if (uid && uid !== 'guest' && targetKey !== baseKey) {
    try {
      localStorage.removeItem(baseKey);
    } catch {
      // ignore
    }
  }
}

export function saveUserLocalSettings(settings: TaxSettings, uid?: string | null): void {
  const targetKey = getKey(STORAGE_KEYS.SETTINGS, uid);
  saveToStorage(targetKey, settings);
  idbSet(targetKey, settings).catch(() => {});

  // Persist Google Sheets config permanently across user resets and clears
  try {
    if (settings.googleAppsScriptUrl) {
      localStorage.setItem(STORAGE_KEYS.SAVED_APPS_SCRIPT_URL, settings.googleAppsScriptUrl);
    }
    if (settings.googleSheetId) {
      localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_ID, settings.googleSheetId);
    }
    if (settings.googleSheetUrl) {
      localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_URL, settings.googleSheetUrl);
    }
    if (settings.googleSheetName) {
      localStorage.setItem(STORAGE_KEYS.SAVED_GOOGLE_SHEET_NAME, settings.googleSheetName);
    }
  } catch {}

  if (uid && uid !== 'guest' && targetKey !== STORAGE_KEYS.SETTINGS) {
    try {
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    } catch {
      // ignore
    }
  }
}

// Sync Queue Management
export function enqueueSyncMutation(mutation: SyncMutation): void {
  const queueKey = getKey(STORAGE_KEYS.SYNC_QUEUE, mutation.uid);
  const queue = loadFromStorage<SyncMutation[]>(queueKey, []);

  // If mutation data has large receipt image, offload image to IndexedDB and put reference in queue
  let processedMutation = mutation;
  if (
    mutation.data &&
    typeof mutation.data.receiptImage === 'string' &&
    mutation.data.receiptImage.length > 5000
  ) {
    const imgKey = `sync_img_${mutation.id}`;
    idbSet(imgKey, mutation.data.receiptImage).catch(() => {});
    processedMutation = {
      ...mutation,
      data: {
        ...mutation.data,
        receiptImage: `idb://${imgKey}`,
      },
    };
  }

  // Deduplicate if already queued for the same docId and operation
  const filtered = queue.filter(
    (item) => !(item.collection === mutation.collection && item.docId === mutation.docId)
  );
  filtered.push(processedMutation);
  saveToStorage(queueKey, filtered);
}

export async function hydratePurchasesImages(items: PurchaseItem[]): Promise<PurchaseItem[]> {
  const needsHydration = items.some((p) => p.receiptImage && p.receiptImage.startsWith('idb://'));
  if (!needsHydration) return items;

  const resolved = await Promise.all(
    items.map(async (p) => {
      if (p.receiptImage && p.receiptImage.startsWith('idb://')) {
        const fullImg = await getReceiptImageFromIDB(p.id);
        if (fullImg) {
          return { ...p, receiptImage: fullImg };
        }
      }
      return p;
    })
  );
  return resolved;
}

export function getPendingSyncMutations(uid?: string | null): SyncMutation[] {
  const queueKey = getKey(STORAGE_KEYS.SYNC_QUEUE, uid);
  return loadFromStorage<SyncMutation[]>(queueKey, []);
}

export function removeSyncMutation(mutationId: string, uid?: string | null): void {
  const queueKey = getKey(STORAGE_KEYS.SYNC_QUEUE, uid);
  const queue = loadFromStorage<SyncMutation[]>(queueKey, []);
  const updated = queue.filter((item) => item.id !== mutationId);
  saveToStorage(queueKey, updated);
}

export function clearSyncQueue(uid?: string | null): void {
  const queueKey = getKey(STORAGE_KEYS.SYNC_QUEUE, uid);
  saveToStorage(queueKey, []);
}

export function getLastSyncTime(uid?: string | null): number | null {
  const raw = localStorage.getItem(getKey(STORAGE_KEYS.LAST_SYNC, uid));
  return raw ? Number(raw) : null;
}

export function setLastSyncTime(uid?: string | null, timestamp: number = Date.now()): void {
  try {
    localStorage.setItem(getKey(STORAGE_KEYS.LAST_SYNC, uid), String(timestamp));
  } catch (err) {
    console.error('Failed to set last sync time:', err);
  }
}

export function getQuotaExceededFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.QUOTA_FLAG) === 'true';
  } catch {
    return false;
  }
}

export function setQuotaExceededFlag(flag: boolean): void {
  try {
    if (flag) {
      localStorage.setItem(STORAGE_KEYS.QUOTA_FLAG, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.QUOTA_FLAG);
    }
  } catch (err) {
    console.error('Failed to set quota flag:', err);
  }
}

export function getLocalStorageStats(uid?: string | null): LocalStorageStats {
  const data = loadUserLocalData(uid);
  const pending = getPendingSyncMutations(uid);
  const lastSync = getLastSyncTime(uid);
  const isQuota = getQuotaExceededFlag();

  let totalChars = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('taxguard_')) {
        const val = localStorage.getItem(key);
        totalChars += (key.length + (val?.length || 0));
      }
    }
  } catch {
    // ignore
  }

  return {
    salesCount: data.sales.length,
    purchasesCount: data.purchases.length,
    bankAccountsCount: data.bankAccounts.length,
    bankTransactionsCount: data.bankTransactions.length,
    dailyClosesCount: data.dailyCloses.length,
    reconcilingItemsCount: data.reconcilingItems.length,
    brsStatementsCount: data.brsStatements.length,
    hasSettings: Boolean(data.settings.taxIdNumber),
    pendingSyncCount: pending.length,
    lastSyncTime: lastSync,
    estimatedSizeKb: Math.max(1, Math.round((totalChars * 2) / 1024)),
    isQuotaExceeded: isQuota,
  };
}

// Phone Backup Export and Import
export function exportLocalDataBackup(uid?: string | null): string {
  const data = loadUserLocalData(uid);
  const pending = getPendingSyncMutations(uid);
  const exportPayload = {
    version: '4.0',
    exportedAt: new Date().toISOString(),
    businessName: data.settings.businessName,
    taxIdNumber: data.settings.taxIdNumber,
    parameters: data.settings,
    financialRecords: {
      sales: data.sales,
      purchases: data.purchases,
      bankAccounts: data.bankAccounts,
      bankTransactions: data.bankTransactions,
      dailyCloses: data.dailyCloses,
      reconcilingItems: data.reconcilingItems,
      brsStatements: data.brsStatements,
    },
    pendingSyncQueue: pending,
  };
  return JSON.stringify(exportPayload, null, 2);
}

export function downloadLocalDataBackup(uid?: string | null): void {
  const jsonStr = exportLocalDataBackup(uid);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `taxguard_phone_backup_${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importLocalDataBackup(
  uid: string | null | undefined,
  jsonString: string
): { success: boolean; message: string; counts?: { sales: number; purchases: number } } {
  try {
    const parsed = JSON.parse(jsonString);
    const records = parsed.financialRecords || parsed;
    const settings = parsed.parameters || parsed.settings;

    if (Array.isArray(records.sales)) {
      saveUserLocalCollection('sales', records.sales, uid);
    }
    if (Array.isArray(records.purchases)) {
      saveUserLocalCollection('purchases', records.purchases, uid);
    }
    if (Array.isArray(records.bankAccounts)) {
      saveUserLocalCollection('bankAccounts', records.bankAccounts, uid);
    }
    if (Array.isArray(records.bankTransactions)) {
      saveUserLocalCollection('bankTransactions', records.bankTransactions, uid);
    }
    if (Array.isArray(records.dailyCloses)) {
      saveUserLocalCollection('dailyCloses', records.dailyCloses, uid);
    }
    if (Array.isArray(records.reconcilingItems)) {
      saveUserLocalCollection('reconcilingItems', records.reconcilingItems, uid);
    }
    if (Array.isArray(records.brsStatements)) {
      saveUserLocalCollection('brsStatements', records.brsStatements, uid);
    }
    if (settings && typeof settings === 'object') {
      saveUserLocalSettings(settings, uid);
    }

    return {
      success: true,
      message: 'Local phone backup restored successfully!',
      counts: {
        sales: Array.isArray(records.sales) ? records.sales.length : 0,
        purchases: Array.isArray(records.purchases) ? records.purchases.length : 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Invalid backup JSON file.',
    };
  }
}

export function resetAllDataToDemo(uid?: string | null): {
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  dailyCloses: DailyRegisterClose[];
  reconcilingItems: ReconcilingItem[];
  brsStatements: BankReconciliationStatement[];
  settings: TaxSettings;
} {
  const currentSettings = loadUserLocalData(uid).settings;
  const preservedSettings: TaxSettings = {
    ...DEFAULT_TAX_SETTINGS,
    googleAppsScriptUrl: currentSettings.googleAppsScriptUrl,
    googleSheetId: currentSettings.googleSheetId,
    googleSheetUrl: currentSettings.googleSheetUrl,
    googleSheetName: currentSettings.googleSheetName,
    autoSyncToGoogleSheets: currentSettings.autoSyncToGoogleSheets,
  };

  saveUserLocalCollection('sales', INITIAL_SALES, uid);
  saveUserLocalCollection('purchases', INITIAL_PURCHASES, uid);
  saveUserLocalCollection('bankAccounts', INITIAL_BANK_ACCOUNTS, uid);
  saveUserLocalCollection('bankTransactions', INITIAL_BANK_TRANSACTIONS, uid);
  saveUserLocalCollection('dailyCloses', INITIAL_DAILY_CLOSES, uid);
  saveUserLocalCollection('reconcilingItems', INITIAL_RECONCILING_ITEMS, uid);
  saveUserLocalCollection('brsStatements', INITIAL_BRS_STATEMENTS, uid);
  saveUserLocalSettings(preservedSettings, uid);

  return {
    sales: INITIAL_SALES,
    purchases: INITIAL_PURCHASES,
    bankAccounts: INITIAL_BANK_ACCOUNTS,
    bankTransactions: INITIAL_BANK_TRANSACTIONS,
    dailyCloses: INITIAL_DAILY_CLOSES,
    reconcilingItems: INITIAL_RECONCILING_ITEMS,
    brsStatements: INITIAL_BRS_STATEMENTS,
    settings: preservedSettings,
  };
}

export { STORAGE_KEYS };
