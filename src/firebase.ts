import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot safely without throwing
async function testConnection() {
  try {
    if (navigator.onLine) {
      await getDocFromServer(doc(db, 'test', 'connection'));
    }
  } catch {
    // Non-blocking: local storage is primary
  }
}
testConnection();

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Quota limit exceeded') ||
    msg.includes('quota metric') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Free daily read units') ||
    msg.includes('quota') ||
    msg.includes('exceeded free quota')
  );
}

export function isFirestoreOfflineError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('network-request-failed') ||
    msg.includes('Failed to get document because the client is offline') ||
    msg.includes('could not reach Cloud Firestore')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (isFirestoreQuotaError(error)) {
    console.warn(
      `[Local Storage Primary] Firestore free quota reached on ${path}. Data remains 100% active in local storage.`
    );
    return;
  }
  if (isFirestoreOfflineError(error)) {
    console.warn(
      `[Local Storage Primary] Device is offline for ${path}. Changes queued locally in phone storage.`
    );
    return;
  }
  console.warn(`Firestore Operation Notice (${operationType} on ${path}):`, errInfo.error);
}

