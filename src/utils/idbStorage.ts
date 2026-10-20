/**
 * IndexedDB Persistent Storage for Large Assets & Offline Data
 * IndexedDB has gigabytes of storage capacity on mobile and desktop browsers,
 * preventing any QuotaExceededError from localStorage.
 */

const DB_NAME = 'taxguard_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'taxguard_store';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

export async function idbSet<T = unknown>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Could not set key "${key}":`, err);
  }
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore error on delete
  }
}

export async function idbClear(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

/**
 * Save large receipt image separately in IndexedDB to avoid filling localStorage
 */
export async function saveReceiptImageToIDB(purchaseId: string, imageBase64: string): Promise<void> {
  if (!purchaseId || !imageBase64) return;
  await idbSet(`receipt_img_${purchaseId}`, imageBase64);
}

/**
 * Retrieve receipt image from IndexedDB
 */
export async function getReceiptImageFromIDB(purchaseId: string): Promise<string | null> {
  if (!purchaseId) return null;
  return await idbGet<string>(`receipt_img_${purchaseId}`);
}
