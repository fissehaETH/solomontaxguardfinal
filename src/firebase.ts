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
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set persistence explicitly to local persistence
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Failed to set auth persistence to local:', err);
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Detect Android / Mobile / Standalone PWA environment
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android|iphone|ipad|ipod|windows phone|mobile/i.test(ua);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
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
 * Android & Iframe-optimized Google Sign-in flow.
 * Attempts popup authentication with fallback to redirect only if sessionStorage is accessible.
 */
export async function signInWithGoogle(options?: { preferRedirect?: boolean }): Promise<User | null> {
  const preferRedirect = options?.preferRedirect ?? false;
  const sessionStorageWorking = isSessionStorageAccessible();

  if (preferRedirect && sessionStorageWorking) {
    await signInWithRedirect(auth, googleProvider);
    return null;
  }

  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code || '';

    // If popup was blocked and sessionStorage is accessible, fall back to redirect
    if (
      (code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        msg.includes('popup') ||
        msg.includes('blocked')) &&
      sessionStorageWorking
    ) {
      console.info('Popup was blocked. Falling back to redirect sign-in...');
      await signInWithRedirect(auth, googleProvider);
      return null;
    }

    if (code === 'auth/popup-blocked' || msg.includes('popup') || msg.includes('blocked')) {
      throw new Error(
        'Popup sign-in was blocked by browser or iframe settings. Please open the application in a new browser tab/window to sign in with Google.'
      );
    }

    throw err;
  }
}

export { signInWithPopup, signInWithRedirect, getRedirectResult, firebaseSignOut };
