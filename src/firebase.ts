import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut as firebaseSignOut,
  User,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  runTransaction,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Set persistence explicitly to local persistence
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Failed to set auth persistence to local:', err);
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
    tenantId: string | null;
    providerData: string[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const err = error as { code?: string; message?: string };
  const authInfo = {
    userId: auth.currentUser?.uid ?? null,
    email: auth.currentUser?.email ?? null,
    emailVerified: auth.currentUser?.emailVerified ?? false,
    isAnonymous: auth.currentUser?.isAnonymous ?? false,
    tenantId: auth.currentUser?.tenantId ?? null,
    providerData: auth.currentUser?.providerData.map((p) => p.providerId) ?? [],
  };
  const errInfo: FirestoreErrorInfo = {
    error: err?.message || String(error),
    operationType,
    path,
    authInfo,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Check if sessionStorage is accessible (storage partitioning / iframe check)
export function isSessionStorageAccessible(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__test_ss_accessibility__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Google Sign-in flow using signInWithPopup.
 * Handles popup blocker gracefully.
 */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code || '';

    if (code === 'auth/popup-blocked' || msg.includes('popup') || msg.includes('blocked')) {
      throw new Error(
        'Popup was blocked by the browser. Please allow popups for this site or open in a new browser window.'
      );
    }
    if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
      return null;
    }
    throw err;
  }
}

export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  firebaseSignOut,
  onAuthStateChanged,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  runTransaction,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  addDoc,
  Timestamp,
};
export type { User };
