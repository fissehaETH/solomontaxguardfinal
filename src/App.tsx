import React, { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirestoreQuotaError,
  OperationType,
} from './firebase';
import {
  BankAccount,
  BankReconciliationStatement,
  BankTransaction,
  DailyRegisterClose,
  PurchaseItem,
  ReconcilingItem,
  SaleTransaction,
  TaxSettings,
} from './types';
import {
  DEFAULT_TAX_SETTINGS,
  calculateAuditReadiness,
  getSaleCashAmount,
  getSaleBankTransferAmount,
} from './utils/formatters';
import { calculateDailyCashExamination } from './utils/dailyCashReconciliation';
import {
  loadUserLocalData,
  saveUserLocalCollection,
  saveUserLocalSettings,
  enqueueSyncMutation,
  getPendingSyncMutations,
  removeSyncMutation,
  getQuotaExceededFlag,
  setQuotaExceededFlag,
  resetAllDataToDemo,
  hydratePurchasesImages,
} from './utils/storage';
import {
  syncPendingToFirestore,
  performFirstTimeCloudSync,
  hasDoneInitialCloudSync,
} from './utils/syncEngine';
import { LocalStorageSyncModal } from './components/common/LocalStorageSyncModal';
import { AndroidShell } from './components/layout/AndroidShell';
import { BottomNav, ActiveTab } from './components/layout/BottomNav';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { SalesManager } from './components/sales/SalesManager';
import { PurchaseManager } from './components/purchases/PurchaseManager';
import { BankManager } from './components/bank/BankManager';
import { TaxAuditEngine } from './components/audit/TaxAuditEngine';
import { SettingsModal } from './components/settings/SettingsModal';
import { HowToUseModal } from './components/help/HowToUseModal';
import { TaxAICopilotModal } from './components/ai/TaxAICopilotModal';
import { CheckCircle2, Landmark, ShieldCheck, LogIn, HelpCircle, Sun, Moon, Smartphone } from 'lucide-react';

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

export default function App() {
  // Firebase Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLocalGuestMode, setIsLocalGuestMode] = useState(() => {
    try {
      return localStorage.getItem('taxguard_guest_mode') === 'true';
    } catch {
      return false;
    }
  });

  // Phone Local Storage initial hydration
  const initialLocal = loadUserLocalData(null);

  // Primary financial state: initialized immediately from phone storage
  const [sales, setSales] = useState<SaleTransaction[]>(initialLocal.sales);
  const [purchases, setPurchases] = useState<PurchaseItem[]>(initialLocal.purchases);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initialLocal.bankAccounts);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(initialLocal.bankTransactions);
  const [dailyCloses, setDailyCloses] = useState<DailyRegisterClose[]>(initialLocal.dailyCloses);
  const [reconcilingItems, setReconcilingItems] = useState<ReconcilingItem[]>(initialLocal.reconcilingItems);
  const [brsStatements, setBrsStatements] = useState<BankReconciliationStatement[]>(initialLocal.brsStatements);
  const [settings, setSettings] = useState<TaxSettings>(initialLocal.settings);
  const [hasSettingsDoc, setHasSettingsDoc] = useState(Boolean(initialLocal.settings.taxIdNumber));

  // Phone Local Storage & Sync Queue Status
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(getQuotaExceededFlag());
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getPendingSyncMutations(null).length);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Navigation & Modal triggers
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isAddSaleOpen, setIsAddSaleOpen] = useState(false);
  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
  const [isDailyCloseOpen, setIsDailyCloseOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAICopilotOpen, setIsAICopilotOpen] = useState(false);
  const [initialEditingSale, setInitialEditingSale] = useState<SaleTransaction | null>(null);
  const [initialEditingPurchase, setInitialEditingPurchase] = useState<PurchaseItem | null>(null);

  // Light / Dark Mode Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('taxguard_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage errors
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    try {
      localStorage.setItem('taxguard_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Track Firebase Authentication state & sync queue
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      const activeUid = currentUser?.uid || 'guest';
      const localData = loadUserLocalData(activeUid);
      if (localData.sales.length > 0) setSales(localData.sales);
      if (localData.purchases.length > 0) {
        setPurchases(localData.purchases);
        hydratePurchasesImages(localData.purchases).then((hydrated) => setPurchases(hydrated)).catch(() => {});
      }
      if (localData.bankAccounts.length > 0) setBankAccounts(localData.bankAccounts);
      if (localData.bankTransactions.length > 0) setBankTransactions(localData.bankTransactions);
      if (localData.dailyCloses.length > 0) setDailyCloses(localData.dailyCloses);
      if (localData.reconcilingItems.length > 0) setReconcilingItems(localData.reconcilingItems);
      if (localData.brsStatements.length > 0) setBrsStatements(localData.brsStatements);
      if (localData.settings.taxIdNumber) {
        setSettings(localData.settings);
        setHasSettingsDoc(true);
      }
      setPendingSyncCount(getPendingSyncMutations(currentUser?.uid).length);

      // 2. First-time sync to database and populate local storage, or background sync pending
      if (currentUser && navigator.onLine) {
        if (!hasDoneInitialCloudSync(currentUser.uid)) {
          performFirstTimeCloudSync(currentUser.uid, (syncedData) => {
            if (syncedData.sales) setSales(syncedData.sales);
            if (syncedData.purchases) {
              setPurchases(syncedData.purchases);
              hydratePurchasesImages(syncedData.purchases)
                .then((hydrated) => setPurchases(hydrated))
                .catch(() => {});
            }
            if (syncedData.bankAccounts) setBankAccounts(syncedData.bankAccounts);
            if (syncedData.bankTransactions) setBankTransactions(syncedData.bankTransactions);
            if (syncedData.dailyCloses) setDailyCloses(syncedData.dailyCloses);
            if (syncedData.reconcilingItems) setReconcilingItems(syncedData.reconcilingItems);
            if (syncedData.brsStatements) setBrsStatements(syncedData.brsStatements);
            if (syncedData.settings) {
              setSettings(syncedData.settings);
              setHasSettingsDoc(true);
            }
          })
            .then((res) => {
              if (res.success) {
                showToast(res.message);
                setIsQuotaExceeded(false);
                setQuotaExceededFlag(false);
              }
              setPendingSyncCount(getPendingSyncMutations(currentUser.uid).length);
            })
            .catch(() => {});
        } else {
          syncPendingToFirestore(currentUser.uid)
            .then((res) => {
              if (res.success && res.syncedCount > 0) {
                showToast(`Synced ${res.syncedCount} pending local record(s) to online database.`);
                setIsQuotaExceeded(false);
                setQuotaExceededFlag(false);
              }
              setPendingSyncCount(getPendingSyncMutations(currentUser.uid).length);
            })
            .catch(() => {});
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Background sync on connection restored
  useEffect(() => {
    const handleOnline = () => {
      if (user) {
        syncPendingToFirestore(user.uid)
          .then((res) => {
            if (res.success && res.syncedCount > 0) {
              showToast(`Synced ${res.syncedCount} pending changes to online database!`);
              setIsQuotaExceeded(false);
              setQuotaExceededFlag(false);
            }
            setPendingSyncCount(getPendingSyncMutations(user.uid).length);
          })
          .catch(() => {});
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user]);

  // On-demand cloud refresh: pulls latest data from remote Firestore and updates local storage
  const handleRefreshFromCloud = async () => {
    if (!user) {
      showToast('Please sign in with Google to sync with cloud database.');
      return;
    }
    showToast('Syncing with online database...');
    try {
      const res = await performFirstTimeCloudSync(
        user.uid,
        (syncedData) => {
          if (syncedData.sales) setSales(syncedData.sales);
          if (syncedData.purchases) {
            setPurchases(syncedData.purchases);
            hydratePurchasesImages(syncedData.purchases)
              .then((hydrated) => setPurchases(hydrated))
              .catch(() => {});
          }
          if (syncedData.bankAccounts) setBankAccounts(syncedData.bankAccounts);
          if (syncedData.bankTransactions) setBankTransactions(syncedData.bankTransactions);
          if (syncedData.dailyCloses) setDailyCloses(syncedData.dailyCloses);
          if (syncedData.reconcilingItems) setReconcilingItems(syncedData.reconcilingItems);
          if (syncedData.brsStatements) setBrsStatements(syncedData.brsStatements);
          if (syncedData.settings) {
            setSettings(syncedData.settings);
            setHasSettingsDoc(true);
          }
        },
        true /* force */
      );
      if (res.success) {
        showToast(res.message);
        setIsQuotaExceeded(false);
        setQuotaExceededFlag(false);
      } else {
        showToast(res.message);
      }
      setPendingSyncCount(getPendingSyncMutations(user.uid).length);
    } catch (err) {
      console.warn('Manual sync failed:', err);
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('Signed out.');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Helper to commit actions to online Firestore safely with local sync queue tracking
  const safeWrite = async (
    action: () => Promise<void>,
    op: OperationType,
    path: string,
    syncMutationId: string,
    uid?: string | null
  ) => {
    if (!user) return;
    try {
      await action();
      removeSyncMutation(syncMutationId, uid);
      setPendingSyncCount(getPendingSyncMutations(uid).length);
      setIsQuotaExceeded(false);
      setQuotaExceededFlag(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        op === OperationType.DELETE &&
        (msg.includes('Missing or insufficient permissions') ||
          msg.includes('permission') ||
          msg.includes('not-found'))
      ) {
        console.warn(`[Local Storage Primary] Document ${path} removed locally:`, msg);
        removeSyncMutation(syncMutationId, uid);
        setPendingSyncCount(getPendingSyncMutations(uid).length);
        return;
      }
      if (isFirestoreQuotaError(err)) {
        setIsQuotaExceeded(true);
        setQuotaExceededFlag(true);
      }
      handleFirestoreError(err, op, path);
    }
  };

  // Firestore & Phone Local Storage Action Handlers
  const handleAddSale = async (newSale: SaleTransaction) => {
    const saleId = sanitizeId(newSale.id);
    const existingForDate = sales.find((s) => s.date === newSale.date && s.id !== saleId);
    if (existingForDate) {
      showToast(
        `Daily sales for ${newSale.date} is already recorded. Please edit or delete it first.`
      );
      return;
    }
    const totalAmount = Number(newSale.totalAmount) || 0;
    const transferAmount =
      typeof newSale.bankTransferAmount === 'number'
        ? Math.min(Math.max(0, Number(newSale.bankTransferAmount)), totalAmount)
        : newSale.paymentMethod === 'bank_transfer'
        ? totalAmount
        : 0;
    const cashAmount = Math.max(0, totalAmount - transferAmount);
    const paymentMethod =
      transferAmount > 0 && cashAmount === 0 ? 'bank_transfer' : 'cash';

    const localItem: SaleTransaction = {
      ...newSale,
      id: saleId,
      totalAmount,
      cashAmount,
      bankTransferAmount: transferAmount,
      paymentMethod,
      createdAt: newSale.createdAt || Date.now(),
    };

    // 1. Optimistic React State
    const nextSales = [localItem, ...sales.filter((s) => s.id !== saleId)];
    setSales(nextSales);

    // 2. Immediate Phone Local Storage
    saveUserLocalCollection('sales', nextSales, user?.uid);

    // 3. Queue Sync Mutation
    const syncId = `sync-sale-${saleId}`;
    const salePayload: Record<string, unknown> = {
      id: saleId,
      ownerId: user?.uid || 'guest',
      receiptNumber: newSale.receiptNumber.slice(0, 100),
      date: newSale.date.slice(0, 30),
      time: (newSale.time || '17:00').slice(0, 20),
      customerName: (newSale.customerName || 'Daily Z-Summary').slice(0, 200),
      items: (newSale.items || []).slice(0, 10),
      subtotal: Number(newSale.subtotal) || 0,
      taxRate: Number(newSale.taxRate) || 0,
      taxAmount: Number(newSale.taxAmount) || 0,
      totalAmount,
      cashAmount,
      bankTransferAmount: transferAmount,
      paymentMethod,
      isReconciledWithBank: Boolean(newSale.isReconciledWithBank),
      notes: (newSale.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (transferAmount > 0 && newSale.bankAccountId) {
      salePayload.bankAccountId = sanitizeId(newSale.bankAccountId);
    }

    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'sales',
      operation: 'set',
      docId: saleId,
      data: salePayload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (transferAmount > 0 && newSale.bankAccountId) {
      const nextAccounts = bankAccounts.map((a) =>
        a.id === newSale.bankAccountId
          ? { ...a, currentBalance: a.currentBalance + transferAmount }
          : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    // 4. Online Firestore write if user logged in
    await safeWrite(
      async () => {
        await setDoc(doc(db, 'sales', saleId), salePayload);
        if (transferAmount > 0 && newSale.bankAccountId) {
          const targetAcc = bankAccounts.find((a) => a.id === newSale.bankAccountId);
          if (targetAcc) {
            await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
              currentBalance: targetAcc.currentBalance + transferAmount,
              updatedAt: serverTimestamp(),
            });
            const txId = sanitizeId(`btx-sale-${saleId}`);
            await setDoc(doc(db, 'bankTransactions', txId), {
              id: txId,
              ownerId: user!.uid,
              bankAccountId: targetAcc.id,
              date: newSale.date.slice(0, 30),
              description: `Daily Bank Transfer Sales (${newSale.date}) — Ref ${newSale.receiptNumber}`.slice(0, 500),
              type: 'credit',
              amount: transferAmount,
              category: 'sale_deposit',
              referenceId: saleId,
              isReconciled: true,
              notes: `Auto-reconciled with Daily Sales ${newSale.receiptNumber} (Transfer portion)`.slice(0, 1000),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      },
      OperationType.CREATE,
      `sales/${saleId}`,
      syncId,
      user?.uid
    );

    showToast(
      isQuotaExceeded
        ? `Daily sales (${newSale.date}) saved in phone storage! (Will sync when database ready)`
        : `Daily sales (${newSale.date}) saved!`
    );
  };

  const handleUpdateSale = async (updatedSale: SaleTransaction) => {
    const saleId = sanitizeId(updatedSale.id);
    const conflictingSale = sales.find(
      (s) => s.date === updatedSale.date && s.id !== saleId
    );
    if (conflictingSale) {
      showToast(
        `Daily sales for ${updatedSale.date} is already recorded. Please edit or delete it first.`
      );
      return;
    }
    const oldSale = sales.find((s) => s.id === saleId);
    const totalAmount = Number(updatedSale.totalAmount) || 0;
    const transferAmount =
      typeof updatedSale.bankTransferAmount === 'number'
        ? Math.min(Math.max(0, Number(updatedSale.bankTransferAmount)), totalAmount)
        : updatedSale.paymentMethod === 'bank_transfer'
        ? totalAmount
        : 0;
    const cashAmount = Math.max(0, totalAmount - transferAmount);
    const paymentMethod =
      transferAmount > 0 && cashAmount === 0 ? 'bank_transfer' : 'cash';

    const localItem: SaleTransaction = {
      ...updatedSale,
      id: saleId,
      totalAmount,
      cashAmount,
      bankTransferAmount: transferAmount,
      paymentMethod,
    };

    // 1. Optimistic React state update
    const nextSales = sales.map((s) => (s.id === saleId ? localItem : s));
    setSales(nextSales);

    // 2. Phone Local Storage
    saveUserLocalCollection('sales', nextSales, user?.uid);

    // 3. Queue sync mutation
    const syncId = `sync-sale-${saleId}`;
    const updatePayload: Record<string, unknown> = {
      receiptNumber: updatedSale.receiptNumber.slice(0, 100),
      date: updatedSale.date.slice(0, 30),
      time: (updatedSale.time || '17:00').slice(0, 20),
      customerName: (updatedSale.customerName || 'Daily Z-Summary').slice(0, 200),
      items: (updatedSale.items || []).slice(0, 10),
      subtotal: Number(updatedSale.subtotal) || 0,
      taxRate: Number(updatedSale.taxRate) || 0,
      taxAmount: Number(updatedSale.taxAmount) || 0,
      totalAmount,
      cashAmount,
      bankTransferAmount: transferAmount,
      paymentMethod,
      bankAccountId:
        transferAmount > 0 && updatedSale.bankAccountId
          ? sanitizeId(updatedSale.bankAccountId)
          : '',
      isReconciledWithBank: Boolean(updatedSale.isReconciledWithBank),
      notes: (updatedSale.notes || '').slice(0, 1000),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'sales',
      operation: 'update',
      docId: saleId,
      data: updatePayload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // Adjust bank balances locally if bank transfer portion changed
    const oldTransfer = oldSale ? getSaleBankTransferAmount(oldSale) : 0;
    const oldBankId = oldSale?.bankAccountId || '';
    const newBankId =
      transferAmount > 0 && updatedSale.bankAccountId
        ? sanitizeId(updatedSale.bankAccountId)
        : '';

    if (oldTransfer > 0 || transferAmount > 0) {
      const nextAccounts = bankAccounts.map((a) => {
        let bal = a.currentBalance;
        if (a.id === oldBankId) bal -= oldTransfer;
        if (a.id === newBankId) bal += transferAmount;
        return { ...a, currentBalance: bal };
      });
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    // 4. Online Firestore write
    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'sales', saleId), updatePayload);
        if (oldTransfer > 0 && oldBankId) {
          const oldAcc = bankAccounts.find((a) => a.id === oldBankId);
          if (oldAcc && oldBankId !== newBankId) {
            await updateDoc(doc(db, 'bankAccounts', oldAcc.id), {
              currentBalance: oldAcc.currentBalance - oldTransfer,
              updatedAt: serverTimestamp(),
            });
          }
        }
        if (newBankId) {
          const targetAcc = bankAccounts.find((a) => a.id === newBankId);
          if (targetAcc) {
            const delta =
              oldBankId === newBankId ? transferAmount - oldTransfer : transferAmount;
            if (delta !== 0) {
              await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
                currentBalance: targetAcc.currentBalance + delta,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        const txId = sanitizeId(`btx-sale-${saleId}`);
        const existingAutoTx = bankTransactions.find((t) => t.id === txId);
        if (transferAmount > 0 && newBankId) {
          if (existingAutoTx) {
            await updateDoc(doc(db, 'bankTransactions', txId), {
              bankAccountId: newBankId,
              date: updatedSale.date.slice(0, 30),
              description: `Daily Bank Transfer Sales (${updatedSale.date}) — Ref ${updatedSale.receiptNumber}`.slice(0, 500),
              amount: transferAmount,
              notes: `Auto-reconciled with Daily Sales ${updatedSale.receiptNumber} (Transfer portion)`.slice(0, 1000),
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'bankTransactions', txId), {
              id: txId,
              ownerId: user!.uid,
              bankAccountId: newBankId,
              date: updatedSale.date.slice(0, 30),
              description: `Daily Bank Transfer Sales (${updatedSale.date}) — Ref ${updatedSale.receiptNumber}`.slice(0, 500),
              type: 'credit',
              amount: transferAmount,
              category: 'sale_deposit',
              referenceId: saleId,
              isReconciled: true,
              notes: `Auto-reconciled with Daily Sales ${updatedSale.receiptNumber} (Transfer portion)`.slice(0, 1000),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } else if (existingAutoTx) {
          await deleteDoc(doc(db, 'bankTransactions', txId));
        }
      },
      OperationType.UPDATE,
      `sales/${saleId}`,
      syncId,
      user?.uid
    );

    showToast(`Daily sales (${updatedSale.date}) updated!`);
  };

  const handleDeleteSale = async (id: string) => {
    const oldSale = sales.find((s) => s.id === id);
    const nextSales = sales.filter((s) => s.id !== id);
    setSales(nextSales);
    saveUserLocalCollection('sales', nextSales, user?.uid);

    const syncId = `sync-del-sale-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'sales',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (oldSale) {
      const oldTransfer = getSaleBankTransferAmount(oldSale);
      const oldBankId = oldSale.bankAccountId || '';
      if (oldTransfer > 0 && oldBankId) {
        const nextAccounts = bankAccounts.map((a) =>
          a.id === oldBankId ? { ...a, currentBalance: a.currentBalance - oldTransfer } : a
        );
        setBankAccounts(nextAccounts);
        saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
      }
    }

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'sales', id));
        if (oldSale) {
          const oldTransfer = getSaleBankTransferAmount(oldSale);
          const oldBankId = oldSale.bankAccountId || '';
          if (oldTransfer > 0 && oldBankId) {
            const acc = bankAccounts.find((a) => a.id === oldBankId);
            if (acc) {
              await updateDoc(doc(db, 'bankAccounts', acc.id), {
                currentBalance: acc.currentBalance - oldTransfer,
                updatedAt: serverTimestamp(),
              });
            }
          }
          const txId = sanitizeId(`btx-sale-${oldSale.id}`);
          await deleteDoc(doc(db, 'bankTransactions', txId));
        }
      },
      OperationType.DELETE,
      `sales/${id}`,
      syncId,
      user?.uid
    );

    showToast('Daily sales entry removed.');
  };
  const handleAddPurchase = async (newPurchase: PurchaseItem) => {
    const purchaseId = sanitizeId(newPurchase.id);
    const paymentMethod = newPurchase.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash';

    const localItem: PurchaseItem = {
      ...newPurchase,
      id: purchaseId,
      createdAt: newPurchase.createdAt || Date.now(),
    };

    // 1. Optimistic React State
    const nextPurchases = [localItem, ...purchases.filter((p) => p.id !== purchaseId)];
    setPurchases(nextPurchases);

    // 2. Immediate Phone Local Storage
    saveUserLocalCollection('purchases', nextPurchases, user?.uid);

    // 3. Queue sync mutation
    const syncId = `sync-purchase-${purchaseId}`;
    const purchasePayload: Record<string, unknown> = {
      id: purchaseId,
      ownerId: user?.uid || 'guest',
      invoiceNumber: newPurchase.invoiceNumber.slice(0, 100),
      date: newPurchase.date.slice(0, 30),
      vendorName: newPurchase.vendorName.slice(0, 200),
      itemName: newPurchase.itemName.slice(0, 300),
      category: newPurchase.category.slice(0, 60),
      quantity: Number(newPurchase.quantity) || 0,
      unitCost: Number(newPurchase.unitCost) || 0,
      subtotal: Number(newPurchase.subtotal) || 0,
      taxRate: Number(newPurchase.taxRate) || 0,
      taxAmount: Number(newPurchase.taxAmount) || 0,
      totalAmount: Number(newPurchase.totalAmount) || 0,
      deductibility: newPurchase.deductibility,
      deductiblePercentage: Number(newPurchase.deductiblePercentage) || 0,
      paymentMethod,
      isReconciledWithBank: Boolean(newPurchase.isReconciledWithBank),
      notes: (newPurchase.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (newPurchase.vendorTin && newPurchase.vendorTin.trim()) {
      purchasePayload.vendorTin = newPurchase.vendorTin.trim().slice(0, 100);
    }
    if (paymentMethod !== 'cash' && newPurchase.bankAccountId) {
      purchasePayload.bankAccountId = sanitizeId(newPurchase.bankAccountId);
    }
    if (newPurchase.receiptImage) {
      purchasePayload.receiptImage = newPurchase.receiptImage.slice(0, 750000);
    }

    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'purchases',
      operation: 'set',
      docId: purchaseId,
      data: purchasePayload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (paymentMethod !== 'cash' && newPurchase.bankAccountId) {
      const nextAccounts = bankAccounts.map((a) =>
        a.id === newPurchase.bankAccountId
          ? { ...a, currentBalance: a.currentBalance - newPurchase.totalAmount }
          : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    // 4. Online Firestore write if user logged in
    await safeWrite(
      async () => {
        await setDoc(doc(db, 'purchases', purchaseId), purchasePayload);
        if (paymentMethod !== 'cash' && newPurchase.bankAccountId) {
          const targetAcc = bankAccounts.find((a) => a.id === newPurchase.bankAccountId);
          if (targetAcc) {
            await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
              currentBalance: targetAcc.currentBalance - newPurchase.totalAmount,
              updatedAt: serverTimestamp(),
            });
            const txId = sanitizeId(`btx-pur-${purchaseId}`);
            await setDoc(doc(db, 'bankTransactions', txId), {
              id: txId,
              ownerId: user!.uid,
              bankAccountId: targetAcc.id,
              date: newPurchase.date.slice(0, 30),
              description: `Vendor Invoice ${newPurchase.invoiceNumber}: ${newPurchase.vendorName}`.slice(0, 500),
              type: 'debit',
              amount: Number(newPurchase.totalAmount) || 0,
              category: 'vendor_payout',
              referenceId: purchaseId,
              isReconciled: true,
              notes: `Tied to verified invoice ${newPurchase.invoiceNumber}`.slice(0, 1000),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      },
      OperationType.CREATE,
      `purchases/${purchaseId}`,
      syncId,
      user?.uid
    );

    showToast(
      isQuotaExceeded
        ? `Purchase invoice ${newPurchase.invoiceNumber} saved in phone storage! (Will sync when database ready)`
        : `Purchase invoice ${newPurchase.invoiceNumber} saved!`
    );
  };

  const handleUpdatePurchase = async (updatedPurchase: PurchaseItem) => {
    const purchaseId = sanitizeId(updatedPurchase.id);
    const oldPurchase = purchases.find((p) => p.id === purchaseId);
    const paymentMethod =
      updatedPurchase.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash';

    const localItem: PurchaseItem = {
      ...updatedPurchase,
      id: purchaseId,
    };

    // 1. Optimistic React state update
    const nextPurchases = purchases.map((p) => (p.id === purchaseId ? localItem : p));
    setPurchases(nextPurchases);

    // 2. Phone Local Storage
    saveUserLocalCollection('purchases', nextPurchases, user?.uid);

    // 3. Queue sync mutation
    const syncId = `sync-purchase-${purchaseId}`;
    const updatePayload: Record<string, unknown> = {
      invoiceNumber: updatedPurchase.invoiceNumber.slice(0, 100),
      date: updatedPurchase.date.slice(0, 30),
      vendorName: updatedPurchase.vendorName.slice(0, 200),
      vendorTin: (updatedPurchase.vendorTin || '').trim().slice(0, 100),
      itemName: updatedPurchase.itemName.slice(0, 300),
      category: updatedPurchase.category.slice(0, 60),
      quantity: Number(updatedPurchase.quantity) || 0,
      unitCost: Number(updatedPurchase.unitCost) || 0,
      subtotal: Number(updatedPurchase.subtotal) || 0,
      taxRate: Number(updatedPurchase.taxRate) || 0,
      taxAmount: Number(updatedPurchase.taxAmount) || 0,
      totalAmount: Number(updatedPurchase.totalAmount) || 0,
      deductibility: updatedPurchase.deductibility,
      deductiblePercentage: Number(updatedPurchase.deductiblePercentage) || 0,
      paymentMethod,
      bankAccountId:
        paymentMethod !== 'cash' && updatedPurchase.bankAccountId
          ? sanitizeId(updatedPurchase.bankAccountId)
          : '',
      isReconciledWithBank: Boolean(updatedPurchase.isReconciledWithBank),
      receiptImage: (updatedPurchase.receiptImage || '').slice(0, 750000),
      notes: (updatedPurchase.notes || '').slice(0, 1000),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'purchases',
      operation: 'update',
      docId: purchaseId,
      data: updatePayload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // Adjust bank balances locally
    const oldBankId =
      oldPurchase && oldPurchase.paymentMethod === 'bank_transfer' && oldPurchase.bankAccountId
        ? oldPurchase.bankAccountId
        : '';
    const oldAmount = oldPurchase && oldBankId ? oldPurchase.totalAmount : 0;
    const newBankId =
      paymentMethod === 'bank_transfer' && updatedPurchase.bankAccountId
        ? sanitizeId(updatedPurchase.bankAccountId)
        : '';
    const newAmount = newBankId ? Number(updatedPurchase.totalAmount) || 0 : 0;

    if (oldBankId || newBankId) {
      const nextAccounts = bankAccounts.map((a) => {
        let bal = a.currentBalance;
        if (a.id === oldBankId) bal += oldAmount;
        if (a.id === newBankId) bal -= newAmount;
        return { ...a, currentBalance: bal };
      });
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    // 4. Online Firestore write
    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'purchases', purchaseId), updatePayload);
        if (oldBankId && oldBankId !== newBankId) {
          const oldAcc = bankAccounts.find((a) => a.id === oldBankId);
          if (oldAcc) {
            await updateDoc(doc(db, 'bankAccounts', oldAcc.id), {
              currentBalance: oldAcc.currentBalance + oldAmount,
              updatedAt: serverTimestamp(),
            });
          }
        }
        if (newBankId) {
          const targetAcc = bankAccounts.find((a) => a.id === newBankId);
          if (targetAcc) {
            const delta = oldBankId === newBankId ? newAmount - oldAmount : newAmount;
            if (delta !== 0) {
              await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
                currentBalance: targetAcc.currentBalance - delta,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        const txId = sanitizeId(`btx-pur-${purchaseId}`);
        const existingAutoTx = bankTransactions.find((t) => t.id === txId);
        if (newBankId && newAmount > 0) {
          if (existingAutoTx) {
            await updateDoc(doc(db, 'bankTransactions', txId), {
              bankAccountId: newBankId,
              date: updatedPurchase.date.slice(0, 30),
              description: `Vendor Invoice ${updatedPurchase.invoiceNumber}: ${updatedPurchase.vendorName}`.slice(0, 500),
              amount: newAmount,
              notes: `Tied to verified invoice ${updatedPurchase.invoiceNumber}`.slice(0, 1000),
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'bankTransactions', txId), {
              id: txId,
              ownerId: user!.uid,
              bankAccountId: newBankId,
              date: updatedPurchase.date.slice(0, 30),
              description: `Vendor Invoice ${updatedPurchase.invoiceNumber}: ${updatedPurchase.vendorName}`.slice(0, 500),
              type: 'debit',
              amount: newAmount,
              category: 'vendor_payout',
              referenceId: purchaseId,
              isReconciled: true,
              notes: `Tied to verified invoice ${updatedPurchase.invoiceNumber}`.slice(0, 1000),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } else if (existingAutoTx) {
          await deleteDoc(doc(db, 'bankTransactions', txId));
        }
      },
      OperationType.UPDATE,
      `purchases/${purchaseId}`,
      syncId,
      user?.uid
    );

    showToast(`Purchase invoice ${updatedPurchase.invoiceNumber} updated!`);
  };

  const handleDeletePurchase = async (id: string) => {
    const oldPurchase = purchases.find((p) => p.id === id);
    const nextPurchases = purchases.filter((p) => p.id !== id);
    setPurchases(nextPurchases);
    saveUserLocalCollection('purchases', nextPurchases, user?.uid);

    const syncId = `sync-del-pur-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'purchases',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (oldPurchase && oldPurchase.paymentMethod === 'bank_transfer' && oldPurchase.bankAccountId) {
      const nextAccounts = bankAccounts.map((a) =>
        a.id === oldPurchase.bankAccountId
          ? { ...a, currentBalance: a.currentBalance + oldPurchase.totalAmount }
          : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'purchases', id));
        if (oldPurchase && oldPurchase.paymentMethod === 'bank_transfer' && oldPurchase.bankAccountId) {
          const acc = bankAccounts.find((a) => a.id === oldPurchase.bankAccountId);
          if (acc) {
            await updateDoc(doc(db, 'bankAccounts', acc.id), {
              currentBalance: acc.currentBalance + oldPurchase.totalAmount,
              updatedAt: serverTimestamp(),
            });
          }
          const txId = sanitizeId(`btx-pur-${oldPurchase.id}`);
          await deleteDoc(doc(db, 'bankTransactions', txId));
        }
      },
      OperationType.DELETE,
      `purchases/${id}`,
      syncId,
      user?.uid
    );

    showToast('Purchase item removed.');
  };

  const handleAddDailyClose = async (close: DailyRegisterClose) => {
    const existingClose = dailyCloses.find((c) => c.id === close.id || c.date === close.date);
    const closeId = existingClose ? existingClose.id : sanitizeId(close.id);

    const localClose: DailyRegisterClose = {
      ...close,
      id: closeId,
    };

    // 1. Optimistic React State
    const nextCloses = existingClose
      ? dailyCloses.map((c) => (c.id === closeId ? localClose : c))
      : [localClose, ...dailyCloses.filter((c) => c.id !== closeId)];
    setDailyCloses(nextCloses);

    // 2. Phone Local Storage
    saveUserLocalCollection('dailyCloses', nextCloses, user?.uid);

    // 3. Queue sync mutation
    const syncId = `sync-close-${closeId}`;
    const closePayload: Record<string, unknown> = {
      id: closeId,
      ownerId: user?.uid || 'guest',
      date: close.date.slice(0, 30),
      openingFloat: Number(close.openingFloat) || 0,
      cashSales: Number(close.cashSales) || 0,
      cardSales: Number(close.cardSales) || 0,
      bankTransferSales: Number(close.bankTransferSales) || 0,
      totalGrossSales: Number(close.totalGrossSales) || 0,
      totalTaxCollected: Number(close.totalTaxCollected) || 0,
      cashPaidOutForPurchases: Number(close.cashPaidOutForPurchases) || 0,
      actualCashCounted: Number(close.actualCashCounted) || 0,
      cashVariance: Number(close.cashVariance) || 0,
      bankDepositAmount: Number(close.bankDepositAmount) || 0,
      closedBy: (close.closedBy || 'Owner').slice(0, 150),
      status: close.status,
      notes: (close.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'dailyCloses',
      operation: 'set',
      docId: closeId,
      data: closePayload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // 4. Online Firestore write
    await safeWrite(
      async () => {
        if (existingClose) {
          await updateDoc(doc(db, 'dailyCloses', closeId), closePayload);
        } else {
          await setDoc(doc(db, 'dailyCloses', closeId), closePayload);
        }
        if (!existingClose && close.bankDepositAmount > 0 && bankAccounts[0]) {
          const targetAcc = bankAccounts[0];
          await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
            currentBalance: targetAcc.currentBalance + close.bankDepositAmount,
            updatedAt: serverTimestamp(),
          });
          const txId = sanitizeId(`btx-close-${Date.now()}`);
          await setDoc(doc(db, 'bankTransactions', txId), {
            id: txId,
            ownerId: user!.uid,
            bankAccountId: targetAcc.id,
            date: close.date.slice(0, 30),
            description: `Daily Z-Report Register Cash Deposit (${close.date})`.slice(0, 500),
            type: 'credit',
            amount: Number(close.bankDepositAmount) || 0,
            category: 'sale_deposit',
            isReconciled: true,
            notes: 'Reconciled with Z-Report physical cash count',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      },
      existingClose ? OperationType.UPDATE : OperationType.CREATE,
      `dailyCloses/${closeId}`,
      syncId,
      user?.uid
    );

    showToast(`Daily Cash Count (${close.date}) saved! Status: ${close.status.toUpperCase()}`);
  };

  const handleDeleteDailyClose = async (id: string) => {
    const nextCloses = dailyCloses.filter((c) => c.id !== id);
    setDailyCloses(nextCloses);
    saveUserLocalCollection('dailyCloses', nextCloses, user?.uid);

    const syncId = `sync-del-close-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'dailyCloses',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'dailyCloses', id));
      },
      OperationType.DELETE,
      `dailyCloses/${id}`,
      syncId,
      user?.uid
    );

    showToast('End-of-Day Cash Count removed.');
  };

  const handleAddBankTransaction = async (tx: BankTransaction) => {
    const txId = sanitizeId(tx.id);
    const bankAccountId = sanitizeId(tx.bankAccountId);
    const activeUid = user?.uid || 'guest';

    const localTx: BankTransaction = {
      ...tx,
      id: txId,
      bankAccountId,
      amount: Number(tx.amount) || 0,
      isReconciled: Boolean(tx.isReconciled),
    };

    // 1. Optimistic React State
    const nextTxs = [localTx, ...bankTransactions.filter((t) => t.id !== txId)];
    setBankTransactions(nextTxs);

    // 2. Phone Local Storage
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    // 3. Queue sync mutation
    const syncId = `sync-btx-${txId}`;
    const payload: Record<string, unknown> = {
      id: txId,
      ownerId: activeUid,
      bankAccountId,
      date: tx.date.slice(0, 30),
      description: tx.description.slice(0, 500),
      type: tx.type,
      amount: Number(tx.amount) || 0,
      category: tx.category.slice(0, 60),
      isReconciled: Boolean(tx.isReconciled),
      notes: (tx.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (tx.referenceId) {
      payload.referenceId = tx.referenceId.slice(0, 128);
    }

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'bankTransactions',
      operation: 'set',
      docId: txId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // Update target account balance locally
    const targetAcc = bankAccounts.find((a) => a.id === bankAccountId);
    if (targetAcc) {
      const nextBalance =
        tx.type === 'credit'
          ? targetAcc.currentBalance + tx.amount
          : targetAcc.currentBalance - tx.amount;
      const nextAccounts = bankAccounts.map((a) =>
        a.id === bankAccountId ? { ...a, currentBalance: nextBalance } : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    // 4. Online Firestore write
    await safeWrite(
      async () => {
        await setDoc(doc(db, 'bankTransactions', txId), payload);
        if (targetAcc) {
          const nextBalance =
            tx.type === 'credit'
              ? targetAcc.currentBalance + tx.amount
              : targetAcc.currentBalance - tx.amount;
          await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
            currentBalance: nextBalance,
            updatedAt: serverTimestamp(),
          });
        }
      },
      OperationType.CREATE,
      `bankTransactions/${txId}`,
      syncId,
      user?.uid
    );

    showToast(
      isQuotaExceeded
        ? 'Bank transaction saved locally on phone!'
        : 'Bank statement entry saved!'
    );
  };

  const handleAddBankTransactionsBatch = async (
    txs: BankTransaction[],
    targetAccountId?: string,
    newBalance?: number
  ) => {
    if (!txs || txs.length === 0) return;

    const activeUid = user?.uid || 'guest';
    const primaryTargetId = sanitizeId(
      targetAccountId || txs[0]?.bankAccountId || (bankAccounts[0]?.id || 'acc-primary')
    );

    // 1. Sanitize all transactions
    const sanitizedTxs: BankTransaction[] = txs.map((tx, idx) => {
      const txId = sanitizeId(
        tx.id || `btx-scan-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`
      );
      const bankAccountId = sanitizeId(tx.bankAccountId || primaryTargetId);
      return {
        ...tx,
        id: txId,
        bankAccountId,
        amount: Math.abs(Number(tx.amount) || 0),
        type: tx.type === 'credit' ? 'credit' : 'debit',
        category: tx.category || (tx.type === 'credit' ? 'sale_deposit' : 'vendor_payout'),
        isReconciled: Boolean(tx.isReconciled),
      };
    });

    const newTxIds = new Set(sanitizedTxs.map((t) => t.id));

    // 2. Optimistic React State: Prepend all imported transactions
    const nextTxs = [...sanitizedTxs, ...bankTransactions.filter((t) => !newTxIds.has(t.id))];
    setBankTransactions(nextTxs);

    // 3. Phone Local Storage: Save every single transaction to localStorage and IndexedDB
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    // 4. Update Target Bank Account Balance
    let updatedAccounts = [...bankAccounts];
    const targetAcc = updatedAccounts.find((a) => a.id === primaryTargetId);
    let calculatedBalance = targetAcc ? targetAcc.currentBalance : 0;
    if (typeof newBalance === 'number') {
      calculatedBalance = newBalance;
    } else {
      const netChange = sanitizedTxs.reduce(
        (sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount),
        0
      );
      calculatedBalance += netChange;
    }

    if (targetAcc) {
      updatedAccounts = updatedAccounts.map((a) =>
        a.id === primaryTargetId ? { ...a, currentBalance: calculatedBalance } : a
      );
    } else {
      const newAcc: BankAccount = {
        id: primaryTargetId,
        name: 'Primary Checking Account',
        bankName: 'Commercial Bank of Ethiopia',
        accountNumberMasked: '•••• 4821',
        type: 'checking',
        currentBalance: calculatedBalance,
        currency: settings.currency || 'ETB',
        color: '#ea580c',
      };
      updatedAccounts.push(newAcc);
    }
    setBankAccounts(updatedAccounts);
    saveUserLocalCollection('bankAccounts', updatedAccounts, user?.uid);

    // 5. Offline sync mutations for all transactions
    sanitizedTxs.forEach((tx) => {
      const syncId = `sync-btx-${tx.id}`;
      const payload: Record<string, unknown> = {
        id: tx.id,
        ownerId: activeUid,
        bankAccountId: tx.bankAccountId,
        date: tx.date.slice(0, 30),
        description: tx.description.slice(0, 500),
        type: tx.type,
        amount: tx.amount,
        category: tx.category.slice(0, 60),
        isReconciled: tx.isReconciled,
        notes: (tx.notes || '').slice(0, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tx.referenceId) {
        payload.referenceId = tx.referenceId.slice(0, 128);
      }

      enqueueSyncMutation({
        id: syncId,
        uid: activeUid,
        collection: 'bankTransactions',
        operation: 'set',
        docId: tx.id,
        data: payload,
        timestamp: Date.now(),
      });
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // 6. Online Firestore atomic batch writes
    if (user) {
      await safeWrite(
        async () => {
          // Ensure parent bank account exists in Firestore first
          const targetAccData = updatedAccounts.find((a) => a.id === primaryTargetId);
          if (targetAccData) {
            const accDocRef = doc(db, 'bankAccounts', primaryTargetId);
            await setDoc(
              accDocRef,
              {
                id: targetAccData.id,
                ownerId: user.uid,
                name: targetAccData.name.slice(0, 150),
                bankName: targetAccData.bankName.slice(0, 150),
                accountNumberMasked: targetAccData.accountNumberMasked.slice(0, 50),
                type: targetAccData.type,
                currentBalance: targetAccData.currentBalance,
                currency: (targetAccData.currency || 'ETB').slice(0, 20),
                color: (targetAccData.color || '#ea580c').slice(0, 40),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          // Write transactions in batches of 400 (under the 500 Firestore limit)
          const CHUNK_SIZE = 400;
          for (let i = 0; i < sanitizedTxs.length; i += CHUNK_SIZE) {
            const chunk = sanitizedTxs.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            for (const tx of chunk) {
              const docRef = doc(db, 'bankTransactions', tx.id);
              const txPayload: Record<string, unknown> = {
                id: tx.id,
                ownerId: user.uid,
                bankAccountId: tx.bankAccountId,
                date: tx.date.slice(0, 30),
                description: tx.description.slice(0, 500),
                type: tx.type,
                amount: tx.amount,
                category: tx.category.slice(0, 60),
                isReconciled: tx.isReconciled,
                notes: (tx.notes || '').slice(0, 1000),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              if (tx.referenceId) {
                txPayload.referenceId = tx.referenceId.slice(0, 128);
              }
              batch.set(docRef, txPayload);
            }

            await batch.commit();
          }
        },
        OperationType.CREATE,
        `bankTransactions/batch-${sanitizedTxs.length}`,
        `sync-batch-${Date.now()}`,
        user.uid
      );
    }

    const deposits = sanitizedTxs.filter((t) => t.type === 'credit').length;
    const payments = sanitizedTxs.filter((t) => t.type === 'debit').length;
    showToast(
      `Recorded all ${sanitizedTxs.length} bank transactions (${deposits} Bank Deposits, ${payments} Payments) to storage & Firestore!`
    );
  };

  const handleUpdateBankTransaction = async (updatedTx: BankTransaction) => {
    const txId = sanitizeId(updatedTx.id);
    const oldTx = bankTransactions.find((t) => t.id === txId);
    const newBankId = sanitizeId(updatedTx.bankAccountId);
    const activeUid = user?.uid || 'guest';

    const localTx: BankTransaction = {
      ...updatedTx,
      id: txId,
      bankAccountId: newBankId,
      amount: Number(updatedTx.amount) || 0,
      isReconciled: Boolean(updatedTx.isReconciled),
    };

    const nextTxs = bankTransactions.map((t) => (t.id === txId ? localTx : t));
    setBankTransactions(nextTxs);
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    const syncId = `sync-btx-${txId}`;
    const updatePayload: Record<string, unknown> = {
      bankAccountId: newBankId,
      date: updatedTx.date.slice(0, 30),
      description: updatedTx.description.slice(0, 500),
      type: updatedTx.type,
      amount: Number(updatedTx.amount) || 0,
      category: updatedTx.category.slice(0, 60),
      isReconciled: Boolean(updatedTx.isReconciled),
      notes: (updatedTx.notes || '').slice(0, 1000),
      updatedAt: serverTimestamp(),
    };
    if (updatedTx.referenceId) {
      updatePayload.referenceId = updatedTx.referenceId.slice(0, 128);
    }

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'bankTransactions',
      operation: 'update',
      docId: txId,
      data: updatePayload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (oldTx) {
      const oldSigned = oldTx.type === 'credit' ? oldTx.amount : -oldTx.amount;
      const newSigned = updatedTx.type === 'credit' ? updatedTx.amount : -updatedTx.amount;
      const nextAccounts = bankAccounts.map((a) => {
        let bal = a.currentBalance;
        if (a.id === oldTx.bankAccountId) bal -= oldSigned;
        if (a.id === newBankId) bal += newSigned;
        return { ...a, currentBalance: bal };
      });
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'bankTransactions', txId), updatePayload);
        if (oldTx) {
          const oldSigned = oldTx.type === 'credit' ? oldTx.amount : -oldTx.amount;
          const newSigned = updatedTx.type === 'credit' ? updatedTx.amount : -updatedTx.amount;

          if (oldTx.bankAccountId === newBankId) {
            const diff = newSigned - oldSigned;
            const acc = bankAccounts.find((a) => a.id === newBankId);
            if (acc && diff !== 0) {
              await updateDoc(doc(db, 'bankAccounts', acc.id), {
                currentBalance: acc.currentBalance + diff,
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            const oldAcc = bankAccounts.find((a) => a.id === oldTx.bankAccountId);
            const newAcc = bankAccounts.find((a) => a.id === newBankId);
            if (oldAcc) {
              await updateDoc(doc(db, 'bankAccounts', oldAcc.id), {
                currentBalance: oldAcc.currentBalance - oldSigned,
                updatedAt: serverTimestamp(),
              });
            }
            if (newAcc) {
              await updateDoc(doc(db, 'bankAccounts', newAcc.id), {
                currentBalance: newAcc.currentBalance + newSigned,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      },
      OperationType.UPDATE,
      `bankTransactions/${txId}`,
      syncId,
      user?.uid
    );

    showToast('Bank transaction updated!');
  };

  const handleDeleteBankTransaction = async (id: string) => {
    const oldTx = bankTransactions.find((t) => t.id === id);
    const nextTxs = bankTransactions.filter((t) => t.id !== id);
    setBankTransactions(nextTxs);
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    const syncId = `sync-del-btx-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'bankTransactions',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (oldTx) {
      const signed = oldTx.type === 'credit' ? oldTx.amount : -oldTx.amount;
      const nextAccounts = bankAccounts.map((a) =>
        a.id === oldTx.bankAccountId ? { ...a, currentBalance: a.currentBalance - signed } : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'bankTransactions', id));
        if (oldTx) {
          const acc = bankAccounts.find((a) => a.id === oldTx.bankAccountId);
          if (acc) {
            const signed = oldTx.type === 'credit' ? oldTx.amount : -oldTx.amount;
            await updateDoc(doc(db, 'bankAccounts', acc.id), {
              currentBalance: acc.currentBalance - signed,
              updatedAt: serverTimestamp(),
            });
          }
        }
      },
      OperationType.DELETE,
      `bankTransactions/${id}`,
      syncId,
      user?.uid
    );

    showToast('Bank transaction removed.');
  };

  const handleReconcileTransaction = async (txId: string, referenceId?: string) => {
    const activeUid = user?.uid || 'guest';
    const nextTxs = bankTransactions.map((t) =>
      t.id === txId
        ? {
            ...t,
            isReconciled: true,
            referenceId: referenceId || t.referenceId,
            notes: referenceId ? `Matched to ${referenceId}` : 'Verified by auditor',
          }
        : t
    );
    setBankTransactions(nextTxs);
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    const syncId = `sync-recon-tx-${txId}`;
    const updatePayload: Record<string, unknown> = {
      isReconciled: true,
      notes: referenceId ? `Matched to ${referenceId}`.slice(0, 1000) : 'Verified by auditor',
      updatedAt: serverTimestamp(),
    };
    if (referenceId) {
      updatePayload.referenceId = referenceId.slice(0, 128);
    }

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'bankTransactions',
      operation: 'update',
      docId: txId,
      data: updatePayload,
      timestamp: Date.now(),
    });

    if (referenceId) {
      const nextSales = sales.map((s) =>
        s.id === referenceId ? { ...s, isReconciledWithBank: true } : s
      );
      setSales(nextSales);
      saveUserLocalCollection('sales', nextSales, user?.uid);

      const nextPurchases = purchases.map((p) =>
        p.id === referenceId ? { ...p, isReconciledWithBank: true } : p
      );
      setPurchases(nextPurchases);
      saveUserLocalCollection('purchases', nextPurchases, user?.uid);
    }
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'bankTransactions', txId), updatePayload);
        if (referenceId) {
          const matchedSale = sales.find((s) => s.id === referenceId);
          if (matchedSale) {
            await updateDoc(doc(db, 'sales', matchedSale.id), {
              isReconciledWithBank: true,
              updatedAt: serverTimestamp(),
            });
          }
          const matchedPurchase = purchases.find((p) => p.id === referenceId);
          if (matchedPurchase) {
            await updateDoc(doc(db, 'purchases', matchedPurchase.id), {
              isReconciledWithBank: true,
              updatedAt: serverTimestamp(),
            });
          }
        }
      },
      OperationType.UPDATE,
      `bankTransactions/${txId}`,
      syncId,
      user?.uid
    );

    showToast('Transaction reconciled!');
  };

  const handleTransferFunds = async (
    fromId: string,
    toId: string,
    amount: number,
    note: string
  ) => {
    const fromAcc = bankAccounts.find((a) => a.id === fromId);
    const toAcc = bankAccounts.find((a) => a.id === toId);
    if (!fromAcc || !toAcc) return;

    const activeUid = user?.uid || 'guest';
    const todayStr = new Date().toISOString().split('T')[0];
    const debitId = sanitizeId(`btx-tr-out-${Date.now()}`);
    const creditId = sanitizeId(`btx-tr-in-${Date.now() + 1}`);

    const debitTx: BankTransaction = {
      id: debitId,
      bankAccountId: fromAcc.id,
      date: todayStr,
      description: `Transfer Out: ${note}`.slice(0, 500),
      type: 'debit',
      amount: Number(amount) || 0,
      category: 'transfer',
      isReconciled: true,
      notes: note.slice(0, 1000),
    };

    const creditTx: BankTransaction = {
      id: creditId,
      bankAccountId: toAcc.id,
      date: todayStr,
      description: `Transfer In: ${note}`.slice(0, 500),
      type: 'credit',
      amount: Number(amount) || 0,
      category: 'transfer',
      isReconciled: true,
      notes: note.slice(0, 1000),
    };

    // 1. Optimistic React State
    const nextAccounts = bankAccounts.map((a) => {
      if (a.id === fromId) return { ...a, currentBalance: a.currentBalance - amount };
      if (a.id === toId) return { ...a, currentBalance: a.currentBalance + amount };
      return a;
    });
    setBankAccounts(nextAccounts);
    saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);

    const nextTxs = [creditTx, debitTx, ...bankTransactions];
    setBankTransactions(nextTxs);
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    // 2. Queue sync mutations
    const syncDebitId = `sync-transfer-deb-${debitId}`;
    const syncCreditId = `sync-transfer-cred-${creditId}`;
    enqueueSyncMutation({
      id: syncDebitId,
      uid: activeUid,
      collection: 'bankTransactions',
      operation: 'set',
      docId: debitId,
      data: {
        ...debitTx,
        ownerId: activeUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      timestamp: Date.now(),
    });
    enqueueSyncMutation({
      id: syncCreditId,
      uid: activeUid,
      collection: 'bankTransactions',
      operation: 'set',
      docId: creditId,
      data: {
        ...creditTx,
        ownerId: activeUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      timestamp: Date.now() + 1,
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // 3. Online Firestore write
    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'bankAccounts', fromAcc.id), {
          currentBalance: fromAcc.currentBalance - amount,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'bankAccounts', toAcc.id), {
          currentBalance: toAcc.currentBalance + amount,
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'bankTransactions', debitId), {
          id: debitId,
          ownerId: activeUid,
          bankAccountId: fromAcc.id,
          date: todayStr,
          description: `Transfer Out: ${note}`.slice(0, 500),
          type: 'debit',
          amount: Number(amount) || 0,
          category: 'transfer',
          isReconciled: true,
          notes: note.slice(0, 1000),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'bankTransactions', creditId), {
          id: creditId,
          ownerId: activeUid,
          bankAccountId: toAcc.id,
          date: todayStr,
          description: `Transfer In: ${note}`.slice(0, 500),
          type: 'credit',
          amount: Number(amount) || 0,
          category: 'transfer',
          isReconciled: true,
          notes: note.slice(0, 1000),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      },
      OperationType.CREATE,
      'bankTransactions',
      syncDebitId,
      user?.uid
    );

    showToast(`Transferred ${settings.currencySymbol}${amount}!`);
  };

  const handleAddReconcilingItem = async (item: ReconcilingItem) => {
    const itemId = sanitizeId(item.id);
    const bankAccountId = sanitizeId(item.bankAccountId);
    const activeUid = user?.uid || 'guest';

    const localItem: ReconcilingItem = {
      ...item,
      id: itemId,
      bankAccountId,
      amount: Number(item.amount) || 0,
      isCleared: Boolean(item.isCleared),
    };

    const nextItems = [localItem, ...reconcilingItems.filter((i) => i.id !== itemId)];
    setReconcilingItems(nextItems);
    saveUserLocalCollection('reconcilingItems', nextItems, user?.uid);

    const syncId = `sync-recon-item-${itemId}`;
    const payload: Record<string, unknown> = {
      id: itemId,
      ownerId: activeUid,
      bankAccountId,
      date: item.date.slice(0, 30),
      type: item.type,
      referenceNumber: item.referenceNumber.slice(0, 100),
      partyOrDescription: item.partyOrDescription.slice(0, 300),
      amount: Number(item.amount) || 0,
      isCleared: Boolean(item.isCleared),
      notes: (item.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'reconcilingItems',
      operation: 'set',
      docId: itemId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await setDoc(doc(db, 'reconcilingItems', itemId), payload);
      },
      OperationType.CREATE,
      `reconcilingItems/${itemId}`,
      syncId,
      user?.uid
    );

    showToast(`Added ${item.referenceNumber} to BRS!`);
  };

  const handleUpdateReconcilingItem = async (item: ReconcilingItem) => {
    const itemId = sanitizeId(item.id);
    const bankAccountId = sanitizeId(item.bankAccountId);
    const activeUid = user?.uid || 'guest';

    const localItem: ReconcilingItem = {
      ...item,
      id: itemId,
      bankAccountId,
      amount: Number(item.amount) || 0,
      isCleared: Boolean(item.isCleared),
    };

    const nextItems = reconcilingItems.map((i) => (i.id === itemId ? localItem : i));
    setReconcilingItems(nextItems);
    saveUserLocalCollection('reconcilingItems', nextItems, user?.uid);

    const syncId = `sync-recon-item-${itemId}`;
    const payload: Record<string, unknown> = {
      bankAccountId,
      date: item.date.slice(0, 30),
      type: item.type,
      referenceNumber: item.referenceNumber.slice(0, 100),
      partyOrDescription: item.partyOrDescription.slice(0, 300),
      amount: Number(item.amount) || 0,
      isCleared: Boolean(item.isCleared),
      notes: (item.notes || '').slice(0, 1000),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'reconcilingItems',
      operation: 'update',
      docId: itemId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'reconcilingItems', itemId), payload);
      },
      OperationType.UPDATE,
      `reconcilingItems/${itemId}`,
      syncId,
      user?.uid
    );

    showToast(`Updated ${item.referenceNumber}!`);
  };

  const handleDeleteReconcilingItem = async (id: string) => {
    const nextItems = reconcilingItems.filter((i) => i.id !== id);
    setReconcilingItems(nextItems);
    saveUserLocalCollection('reconcilingItems', nextItems, user?.uid);

    const syncId = `sync-del-recon-item-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'reconcilingItems',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'reconcilingItems', id));
      },
      OperationType.DELETE,
      `reconcilingItems/${id}`,
      syncId,
      user?.uid
    );

    showToast('Reconciling item removed.');
  };

  const handlePostBookAdjustment = async (item: ReconcilingItem) => {
    const isCredit = item.type === 'unrecorded_bank_credit';
    const targetAcc = bankAccounts.find((a) => a.id === item.bankAccountId);
    const activeUid = user?.uid || 'guest';
    const txId = sanitizeId(`btx-adj-${Date.now()}`);

    // 1. Update bank balance locally
    if (targetAcc) {
      const nextBalance = isCredit
        ? targetAcc.currentBalance + item.amount
        : targetAcc.currentBalance - item.amount;
      const nextAccounts = bankAccounts.map((a) =>
        a.id === targetAcc.id ? { ...a, currentBalance: nextBalance } : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    // 2. Add bank transaction locally
    const newTx: BankTransaction = {
      id: txId,
      bankAccountId: sanitizeId(item.bankAccountId),
      date: item.date.slice(0, 30),
      description: `BRS Book Adjustment (${item.referenceNumber}): ${item.partyOrDescription}`.slice(0, 500),
      type: isCredit ? 'credit' : 'debit',
      amount: Number(item.amount) || 0,
      category: isCredit ? 'sale_deposit' : 'bank_fee',
      isReconciled: true,
      notes: `Posted from Bank Reconciliation Statement (${item.referenceNumber})`.slice(0, 1000),
    };
    const nextTxs = [newTx, ...bankTransactions];
    setBankTransactions(nextTxs);
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    // 3. Remove reconciling item locally
    const nextItems = reconcilingItems.filter((i) => i.id !== item.id);
    setReconcilingItems(nextItems);
    saveUserLocalCollection('reconcilingItems', nextItems, user?.uid);

    // 4. Queue sync mutations
    const syncTxId = `sync-btx-adj-${txId}`;
    const syncDelItemId = `sync-del-recon-${item.id}`;
    enqueueSyncMutation({
      id: syncTxId,
      uid: activeUid,
      collection: 'bankTransactions',
      operation: 'set',
      docId: txId,
      data: {
        ...newTx,
        ownerId: activeUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      timestamp: Date.now(),
    });
    enqueueSyncMutation({
      id: syncDelItemId,
      uid: activeUid,
      collection: 'reconcilingItems',
      operation: 'delete',
      docId: item.id,
      timestamp: Date.now() + 1,
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    // 5. Online Firestore write
    await safeWrite(
      async () => {
        if (targetAcc) {
          const nextBalance = isCredit
            ? targetAcc.currentBalance + item.amount
            : targetAcc.currentBalance - item.amount;
          await updateDoc(doc(db, 'bankAccounts', targetAcc.id), {
            currentBalance: nextBalance,
            updatedAt: serverTimestamp(),
          });
        }
        await setDoc(doc(db, 'bankTransactions', txId), {
          id: txId,
          ownerId: activeUid,
          bankAccountId: sanitizeId(item.bankAccountId),
          date: item.date.slice(0, 30),
          description: `BRS Book Adjustment (${item.referenceNumber}): ${item.partyOrDescription}`.slice(0, 500),
          type: isCredit ? 'credit' : 'debit',
          amount: Number(item.amount) || 0,
          category: isCredit ? 'sale_deposit' : 'bank_fee',
          isReconciled: true,
          notes: `Posted from Bank Reconciliation Statement (${item.referenceNumber})`.slice(0, 1000),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, 'reconcilingItems', item.id));
      },
      OperationType.WRITE,
      'bankTransactions',
      syncTxId,
      user?.uid
    );

    showToast(`Posted ${item.referenceNumber} to Cash Book Ledger!`);
  };

  const handleSaveBRSStatement = async (statement: BankReconciliationStatement) => {
    const statementId = sanitizeId(statement.id);
    const bankAccountId = sanitizeId(statement.bankAccountId);
    const activeUid = user?.uid || 'guest';

    const localStmt: BankReconciliationStatement = {
      ...statement,
      id: statementId,
      bankAccountId,
      balancePerBankStatement: Number(statement.balancePerBankStatement) || 0,
      unadjustedBookBalance: Number(statement.unadjustedBookBalance) || 0,
      adjustedBankBalance: Number(statement.adjustedBankBalance) || 0,
      adjustedBookBalance: Number(statement.adjustedBookBalance) || 0,
      variance: Number(statement.variance) || 0,
    };

    const nextStmts = [localStmt, ...brsStatements.filter((s) => s.id !== statementId)];
    setBrsStatements(nextStmts);
    saveUserLocalCollection('brsStatements', nextStmts, user?.uid);

    const syncId = `sync-brs-${statementId}`;
    const payload: Record<string, unknown> = {
      id: statementId,
      ownerId: activeUid,
      statementNumber: statement.statementNumber.slice(0, 100),
      bankAccountId,
      statementDate: statement.statementDate.slice(0, 30),
      periodStart: statement.periodStart.slice(0, 30),
      periodEnd: statement.periodEnd.slice(0, 30),
      balancePerBankStatement: Number(statement.balancePerBankStatement) || 0,
      unadjustedBookBalance: Number(statement.unadjustedBookBalance) || 0,
      depositsInTransitTotal: Number(statement.depositsInTransitTotal) || 0,
      outstandingChequesTotal: Number(statement.outstandingChequesTotal) || 0,
      unrecordedCreditsTotal: Number(statement.unrecordedCreditsTotal) || 0,
      bankChargesTotal: Number(statement.bankChargesTotal) || 0,
      adjustedBankBalance: Number(statement.adjustedBankBalance) || 0,
      adjustedBookBalance: Number(statement.adjustedBookBalance) || 0,
      variance: Number(statement.variance) || 0,
      status: statement.status,
      preparedBy: statement.preparedBy.slice(0, 150),
      certifiedAt: statement.certifiedAt.slice(0, 60),
      notes: (statement.notes || '').slice(0, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'brsStatements',
      operation: 'set',
      docId: statementId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await setDoc(doc(db, 'brsStatements', statementId), payload);
      },
      OperationType.CREATE,
      `brsStatements/${statementId}`,
      syncId,
      user?.uid
    );

    showToast(`Certified BRS ${statement.statementNumber} saved!`);
  };

  const handleUpdateBRSStatement = async (statement: BankReconciliationStatement) => {
    const statementId = sanitizeId(statement.id);
    const bankAccountId = sanitizeId(statement.bankAccountId);
    const activeUid = user?.uid || 'guest';

    const localStmt: BankReconciliationStatement = {
      ...statement,
      id: statementId,
      bankAccountId,
      balancePerBankStatement: Number(statement.balancePerBankStatement) || 0,
      unadjustedBookBalance: Number(statement.unadjustedBookBalance) || 0,
      adjustedBankBalance: Number(statement.adjustedBankBalance) || 0,
      adjustedBookBalance: Number(statement.adjustedBookBalance) || 0,
      variance: Number(statement.variance) || 0,
    };

    const nextStmts = brsStatements.map((s) => (s.id === statementId ? localStmt : s));
    setBrsStatements(nextStmts);
    saveUserLocalCollection('brsStatements', nextStmts, user?.uid);

    const syncId = `sync-brs-${statementId}`;
    const payload: Record<string, unknown> = {
      statementNumber: statement.statementNumber.slice(0, 100),
      bankAccountId,
      statementDate: statement.statementDate.slice(0, 30),
      periodStart: statement.periodStart.slice(0, 30),
      periodEnd: statement.periodEnd.slice(0, 30),
      balancePerBankStatement: Number(statement.balancePerBankStatement) || 0,
      unadjustedBookBalance: Number(statement.unadjustedBookBalance) || 0,
      depositsInTransitTotal: Number(statement.depositsInTransitTotal) || 0,
      outstandingChequesTotal: Number(statement.outstandingChequesTotal) || 0,
      unrecordedCreditsTotal: Number(statement.unrecordedCreditsTotal) || 0,
      bankChargesTotal: Number(statement.bankChargesTotal) || 0,
      adjustedBankBalance: Number(statement.adjustedBankBalance) || 0,
      adjustedBookBalance: Number(statement.adjustedBookBalance) || 0,
      variance: Number(statement.variance) || 0,
      status: statement.status,
      preparedBy: statement.preparedBy.slice(0, 150),
      certifiedAt: statement.certifiedAt.slice(0, 60),
      notes: (statement.notes || '').slice(0, 1000),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'brsStatements',
      operation: 'update',
      docId: statementId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'brsStatements', statementId), payload);
      },
      OperationType.UPDATE,
      `brsStatements/${statementId}`,
      syncId,
      user?.uid
    );

    showToast(`BRS Statement ${statement.statementNumber} updated!`);
  };

  const handleDeleteBRSStatement = async (id: string) => {
    const nextStmts = brsStatements.filter((s) => s.id !== id);
    setBrsStatements(nextStmts);
    saveUserLocalCollection('brsStatements', nextStmts, user?.uid);

    const syncId = `sync-del-brs-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'brsStatements',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'brsStatements', id));
      },
      OperationType.DELETE,
      `brsStatements/${id}`,
      syncId,
      user?.uid
    );

    showToast('BRS Statement removed.');
  };

  const handleAddBankAccount = async (newAcc: BankAccount) => {
    const accountId = sanitizeId(newAcc.id);
    const activeUid = user?.uid || 'guest';

    const localAcc: BankAccount = {
      ...newAcc,
      id: accountId,
      currentBalance: Number(newAcc.currentBalance) || 0,
    };

    const nextAccounts = [...bankAccounts.filter((a) => a.id !== accountId), localAcc];
    setBankAccounts(nextAccounts);
    saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);

    const syncId = `sync-bankacc-${accountId}`;
    const payload: Record<string, unknown> = {
      id: accountId,
      ownerId: activeUid,
      name: newAcc.name.slice(0, 150),
      bankName: newAcc.bankName.slice(0, 150),
      accountNumberMasked: newAcc.accountNumberMasked.slice(0, 50),
      type: newAcc.type,
      currentBalance: Number(newAcc.currentBalance) || 0,
      currency: (newAcc.currency || 'ETB').slice(0, 20),
      color: (newAcc.color || 'orange').slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'bankAccounts',
      operation: 'set',
      docId: accountId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await setDoc(doc(db, 'bankAccounts', accountId), payload);
      },
      OperationType.CREATE,
      `bankAccounts/${accountId}`,
      syncId,
      user?.uid
    );

    showToast(`Bank account "${newAcc.name}" saved!`);
  };

  const handleUpdateBankAccount = async (updatedAcc: BankAccount) => {
    const accountId = sanitizeId(updatedAcc.id);
    const activeUid = user?.uid || 'guest';

    const localAcc: BankAccount = {
      ...updatedAcc,
      id: accountId,
      currentBalance: Number(updatedAcc.currentBalance) || 0,
    };

    const nextAccounts = bankAccounts.map((a) => (a.id === accountId ? localAcc : a));
    setBankAccounts(nextAccounts);
    saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);

    const syncId = `sync-bankacc-${accountId}`;
    const payload: Record<string, unknown> = {
      name: updatedAcc.name.slice(0, 150),
      bankName: updatedAcc.bankName.slice(0, 150),
      accountNumberMasked: updatedAcc.accountNumberMasked.slice(0, 50),
      type: updatedAcc.type,
      currentBalance: Number(updatedAcc.currentBalance) || 0,
      currency: (updatedAcc.currency || 'ETB').slice(0, 20),
      color: (updatedAcc.color || 'orange').slice(0, 40),
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'bankAccounts',
      operation: 'update',
      docId: accountId,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await updateDoc(doc(db, 'bankAccounts', accountId), payload);
      },
      OperationType.UPDATE,
      `bankAccounts/${accountId}`,
      syncId,
      user?.uid
    );

    showToast(`Bank account "${updatedAcc.name}" updated!`);
  };

  const handleDeleteBankAccount = async (id: string) => {
    const nextAccounts = bankAccounts.filter((a) => a.id !== id);
    setBankAccounts(nextAccounts);
    saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);

    const nextTxs = bankTransactions.filter((t) => t.bankAccountId !== id);
    setBankTransactions(nextTxs);
    saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

    const nextItems = reconcilingItems.filter((i) => i.bankAccountId !== id);
    setReconcilingItems(nextItems);
    saveUserLocalCollection('reconcilingItems', nextItems, user?.uid);

    const syncId = `sync-del-bankacc-${id}`;
    enqueueSyncMutation({
      id: syncId,
      uid: user?.uid || 'guest',
      collection: 'bankAccounts',
      operation: 'delete',
      docId: id,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'bankAccounts', id));
        const relatedTx = bankTransactions.filter((t) => t.bankAccountId === id);
        for (const tx of relatedTx) {
          await deleteDoc(doc(db, 'bankTransactions', tx.id));
        }
        const relatedItems = reconcilingItems.filter((i) => i.bankAccountId === id);
        for (const item of relatedItems) {
          await deleteDoc(doc(db, 'reconcilingItems', item.id));
        }
      },
      OperationType.DELETE,
      `bankAccounts/${id}`,
      syncId,
      user?.uid
    );

    showToast('Bank account removed.');
  };

  const handleSaveSettings = async (nextSettings: TaxSettings) => {
    const activeUid = user?.uid || 'guest';
    setSettings(nextSettings);
    setHasSettingsDoc(true);
    saveUserLocalSettings(nextSettings, user?.uid);

    const syncId = `sync-settings-${activeUid}`;
    const payload: Record<string, unknown> = {
      businessName: nextSettings.businessName.slice(0, 200),
      taxIdNumber: nextSettings.taxIdNumber.slice(0, 100),
      currency: nextSettings.currency.slice(0, 20),
      currencySymbol: nextSettings.currencySymbol.slice(0, 20),
      defaultSalesTaxRate: Number(nextSettings.defaultSalesTaxRate) || 0,
      corporateTaxRate: Number(nextSettings.corporateTaxRate) || 0,
      fiscalYearStartMonth: Number(nextSettings.fiscalYearStartMonth) || 7,
      updatedAt: serverTimestamp(),
    };

    enqueueSyncMutation({
      id: syncId,
      uid: activeUid,
      collection: 'settings',
      operation: hasSettingsDoc ? 'update' : 'set',
      docId: activeUid,
      data: payload,
      timestamp: Date.now(),
    });
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    await safeWrite(
      async () => {
        const settingsRef = doc(db, 'settings', user!.uid);
        if (hasSettingsDoc) {
          await updateDoc(settingsRef, payload);
        } else {
          await setDoc(settingsRef, {
            ...payload,
            ownerId: user!.uid,
            createdAt: serverTimestamp(),
          });
        }
      },
      OperationType.WRITE,
      `settings/${user?.uid}`,
      syncId,
      user?.uid
    );

    showToast(
      isQuotaExceeded
        ? 'Compliance parameters saved on phone! (Will sync when cloud ready)'
        : 'Tax compliance settings saved!'
    );
  };

  const handleResetData = async () => {
    const reset = resetAllDataToDemo(user?.uid);
    setSales(reset.sales);
    setPurchases(reset.purchases);
    setBankAccounts(reset.bankAccounts);
    setBankTransactions(reset.bankTransactions);
    setDailyCloses(reset.dailyCloses);
    setReconcilingItems(reset.reconcilingItems);
    setBrsStatements(reset.brsStatements);
    setSettings(reset.settings);
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);

    if (user && !isQuotaExceeded && navigator.onLine) {
      try {
        for (const s of sales) await deleteDoc(doc(db, 'sales', s.id)).catch(() => {});
        for (const p of purchases) await deleteDoc(doc(db, 'purchases', p.id)).catch(() => {});
        for (const t of bankTransactions) await deleteDoc(doc(db, 'bankTransactions', t.id)).catch(() => {});
        for (const c of dailyCloses) await deleteDoc(doc(db, 'dailyCloses', c.id)).catch(() => {});
        for (const r of reconcilingItems) await deleteDoc(doc(db, 'reconcilingItems', r.id)).catch(() => {});
        for (const b of brsStatements) await deleteDoc(doc(db, 'brsStatements', b.id)).catch(() => {});
        for (const a of bankAccounts) await deleteDoc(doc(db, 'bankAccounts', a.id)).catch(() => {});
      } catch (err) {
        console.warn('Failed clearing online docs:', err);
      }
    }
    showToast('Financial ledger reset to initial clean state on phone.');
  };

  // CSV Export for Tax Authorities
  const handleExportCSV = () => {
    let csv = `TAXGUARD FINANCIAL AUDIT REPORT\n`;
    csv += `Business Name: ${settings.businessName}\n`;
    csv += `Tax ID / TIN: ${settings.taxIdNumber}\n`;
    csv += `Export Timestamp: ${new Date().toISOString()}\n\n`;

    csv += `--- SECTION 1: TOTAL DAILY SALES REGISTER ---\n`;
    csv += `Date,Receipt No,Customer,Cash Sales,Bank Transfer Sales,Subtotal,Tax Amount,Total Amount,Bank Reconciled\n`;
    [...sales]
      .sort((a, b) => b.date.localeCompare(a.date) || ((b.createdAt || 0) - (a.createdAt || 0)))
      .forEach((s) => {
        const cashAmt = getSaleCashAmount(s);
        const transferAmt = getSaleBankTransferAmount(s);
        csv += `${s.date},${s.receiptNumber},"${s.customerName || 'Daily Summary'}",${cashAmt.toFixed(2)},${transferAmt.toFixed(2)},${s.subtotal.toFixed(2)},${s.taxAmount.toFixed(2)},${s.totalAmount.toFixed(2)},${s.isReconciledWithBank}\n`;
      });

    csv += `\n--- SECTION 2: PURCHASED ITEMS & EXPENSE REGISTER ---\n`;
    csv += `Date,Invoice / FS No,Supplier Name,Supplier TIN,Amount Before Tax,Tax Paid,Total Amount,Deductible %\n`;
    [...purchases]
      .sort((a, b) => b.date.localeCompare(a.date) || ((b.createdAt || 0) - (a.createdAt || 0)))
      .forEach((p) => {
        csv += `${p.date},${p.invoiceNumber},"${p.vendorName}","${p.vendorTin || ''}",${p.subtotal.toFixed(2)},${p.taxAmount.toFixed(2)},${p.totalAmount.toFixed(2)},${p.deductiblePercentage}%\n`;
      });

    csv += `\n--- SECTION 3: BANK ACCOUNTS & MONITORED BALANCES ---\n`;
    csv += `Account Name,Bank,Masked Account,Type,Current Balance\n`;
    bankAccounts.forEach((b) => {
      csv += `"${b.name}","${b.bankName}",${b.accountNumberMasked},${b.type},${b.currentBalance.toFixed(2)}\n`;
    });

    const cashAudit = calculateDailyCashExamination(sales, purchases, bankTransactions, dailyCloses);
    csv += `\n--- SECTION 4: DAILY SALES, CASH PURCHASES & BANK DEPOSIT AUDIT (MoR CHAPTER 6) ---\n`;
    csv += `Date,Day,Total Daily Sales,Cash Sales,Bank Transfer Sales,Cash Purchases (Not Transfer),Bank Transfer Purchases,Daily Net Cash to Deposit,Cumulative Cash Need to Deposit,Actual Bank Deposits (Daily),Cumulative Bank Deposits,Undeposited Cash On Hand (Cumulative),Audit Status,Findings\n`;
    cashAudit.records.forEach((r) => {
      const findingsStr = r.findings.join(' | ').replace(/"/g, '""');
      csv += `${r.date},${r.dayOfWeek},${r.grossDailySales.toFixed(2)},${r.cashSales.toFixed(2)},${r.bankTransferSales.toFixed(2)},${r.cashPurchases.toFixed(2)},${r.bankTransferPurchases.toFixed(2)},${r.dailyCashToDeposit.toFixed(2)},${r.cumulativeCashToDeposit.toFixed(2)},${r.actualBankDeposits.toFixed(2)},${r.cumulativeBankDeposits.toFixed(2)},${r.undepositedCashOnHand.toFixed(2)},"${r.auditStatus}","${findingsStr}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `TaxAudit_Dossier_${settings.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Tax Audit CSV Dossier exported!');
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-stone-600">Connecting to Cloud Firestore...</p>
        </div>
      </div>
    );
  }

  if (!user && !isLocalGuestMode) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] text-stone-900 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="w-11 h-11 rounded-xl bg-orange-700/10 border border-orange-700/20 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-orange-700" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-stone-700" />
                    <span>Dark</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setIsHelpOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5 text-orange-700" />
                <span>አጠቃቀም (How to Use)</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Solomon Building Materials Shop
            </h1>
            <p className="text-xs text-stone-600 leading-relaxed">
              Record daily sales, purchase VAT invoices, and Bank Reconciliation Statements (BRS). All parameters & data are saved directly to your phone's local storage and synced to the online database when connected.
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {authError}
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={handleSignIn}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-sm font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in with Google (Online Sync)</span>
            </button>

            <button
              onClick={() => {
                setIsLocalGuestMode(true);
                try {
                  localStorage.setItem('taxguard_guest_mode', 'true');
                } catch {}
                showToast('Phone Local Storage Mode activated.');
              }}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 text-sm font-semibold transition-colors cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-orange-700" />
              <span>Continue in Phone Local Mode (Offline Ready)</span>
            </button>
          </div>

          <div className="pt-4 border-t border-stone-100 flex items-center gap-2 text-[11px] text-stone-500">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Safe offline storage on phone + Zero-Trust online database sync.</span>
          </div>
        </div>

        <HowToUseModal
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
          onNavigateTab={() => setIsHelpOpen(false)}
        />
      </div>
    );
  }

  const auditReport = calculateAuditReadiness(sales, purchases, bankAccounts, bankTransactions);
  const unreconciledBankCount = bankTransactions.filter((tx) => !tx.isReconciled).length;

  const handleReloadFromLocalStorage = () => {
    const activeUid = user?.uid || (isLocalGuestMode ? 'guest' : null);
    const local = loadUserLocalData(activeUid);
    setSales(local.sales);
    setPurchases(local.purchases);
    setBankAccounts(local.bankAccounts);
    setBankTransactions(local.bankTransactions);
    setDailyCloses(local.dailyCloses);
    setReconcilingItems(local.reconcilingItems);
    setBrsStatements(local.brsStatements);
    if (local.settings.taxIdNumber) {
      setSettings(local.settings);
    }
    setPendingSyncCount(getPendingSyncMutations(user?.uid).length);
    showToast('Local phone data refreshed!');
  };

  return (
    <AndroidShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      businessName={settings.businessName}
      onOpenSettings={() => setIsSettingsOpen(true)}
      onOpenHelp={() => setIsHelpOpen(true)}
      onQuickExport={handleExportCSV}
      onOpenAICopilot={() => setIsAICopilotOpen(true)}
      userEmail={user?.email || '📱 Phone Local Storage Active'}
      onSignOut={() => {
        if (user) {
          handleSignOut();
        } else {
          setIsLocalGuestMode(false);
          try {
            localStorage.removeItem('taxguard_guest_mode');
          } catch {}
          showToast('Closed Phone Local Session.');
        }
      }}
      unreconciledBankCount={unreconciledBankCount}
      auditIssuesCount={auditReport.issues.length}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      isQuotaExceeded={isQuotaExceeded}
      pendingSyncCount={pendingSyncCount}
      onOpenSyncModal={() => setIsSyncModalOpen(true)}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Tab Views */}
      {activeTab === 'dashboard' && (
        <OverviewDashboard
          sales={sales}
          purchases={purchases}
          bankAccounts={bankAccounts}
          bankTransactions={bankTransactions}
          dailyCloses={dailyCloses}
          settings={settings}
          setActiveTab={setActiveTab}
          onOpenAddSale={() => {
            setInitialEditingSale(null);
            setActiveTab('sales');
            setIsAddSaleOpen(true);
          }}
          onOpenAddPurchase={() => {
            setInitialEditingPurchase(null);
            setActiveTab('purchases');
            setIsAddPurchaseOpen(true);
          }}
          onOpenDailyClose={() => {
            setActiveTab('sales');
            setIsDailyCloseOpen(true);
          }}
          onEditSale={(sale) => {
            setInitialEditingSale(sale);
            setActiveTab('sales');
          }}
          onEditPurchase={(pur) => {
            setInitialEditingPurchase(pur);
            setActiveTab('purchases');
          }}
          onOpenHelp={() => setIsHelpOpen(true)}
          onQuickExport={handleExportCSV}
        />
      )}

      {activeTab === 'sales' && (
        <SalesManager
          sales={sales}
          bankAccounts={bankAccounts}
          dailyCloses={dailyCloses}
          settings={settings}
          onAddSale={handleAddSale}
          onUpdateSale={handleUpdateSale}
          onDeleteSale={handleDeleteSale}
          onAddDailyClose={handleAddDailyClose}
          onDeleteDailyClose={handleDeleteDailyClose}
          isAddSaleOpen={isAddSaleOpen}
          setIsAddSaleOpen={setIsAddSaleOpen}
          isDailyCloseOpen={isDailyCloseOpen}
          setIsDailyCloseOpen={setIsDailyCloseOpen}
          initialEditingSale={initialEditingSale}
          onClearInitialEditingSale={() => setInitialEditingSale(null)}
        />
      )}

      {activeTab === 'purchases' && (
        <PurchaseManager
          purchases={purchases}
          bankAccounts={bankAccounts}
          settings={settings}
          onAddPurchase={handleAddPurchase}
          onUpdatePurchase={handleUpdatePurchase}
          onDeletePurchase={handleDeletePurchase}
          isAddPurchaseOpen={isAddPurchaseOpen}
          setIsAddPurchaseOpen={setIsAddPurchaseOpen}
          initialEditingPurchase={initialEditingPurchase}
          onClearInitialEditingPurchase={() => setInitialEditingPurchase(null)}
        />
      )}

      {activeTab === 'bank' && (
        <BankManager
          bankAccounts={bankAccounts}
          bankTransactions={bankTransactions}
          reconcilingItems={reconcilingItems}
          brsStatements={brsStatements}
          sales={sales}
          purchases={purchases}
          settings={settings}
          onAddBankAccount={handleAddBankAccount}
          onUpdateBankAccount={handleUpdateBankAccount}
          onDeleteBankAccount={handleDeleteBankAccount}
          onAddTransaction={handleAddBankTransaction}
          onUpdateTransaction={handleUpdateBankTransaction}
          onDeleteTransaction={handleDeleteBankTransaction}
          onBatchAddTransactions={handleAddBankTransactionsBatch}
          onReconcileTransaction={handleReconcileTransaction}
          onTransferFunds={handleTransferFunds}
          onAddReconcilingItem={handleAddReconcilingItem}
          onUpdateReconcilingItem={handleUpdateReconcilingItem}
          onDeleteReconcilingItem={handleDeleteReconcilingItem}
          onPostBookAdjustment={handlePostBookAdjustment}
          onSaveBRSStatement={handleSaveBRSStatement}
          onUpdateBRSStatement={handleUpdateBRSStatement}
          onDeleteBRSStatement={handleDeleteBRSStatement}
        />
      )}

      {activeTab === 'audit' && (
        <TaxAuditEngine
          sales={sales}
          purchases={purchases}
          bankAccounts={bankAccounts}
          bankTransactions={bankTransactions}
          dailyCloses={dailyCloses}
          settings={settings}
          setActiveTab={setActiveTab}
          onExportCSV={handleExportCSV}
          onOpenAICopilot={() => setIsAICopilotOpen(true)}
          onOpenAddSale={() => {
            setInitialEditingSale(null);
            setIsAddSaleOpen(true);
          }}
          onOpenAddPurchase={() => {
            setInitialEditingPurchase(null);
            setIsAddPurchaseOpen(true);
          }}
          onOpenDailyClose={() => setIsDailyCloseOpen(true)}
        />
      )}

      {/* AI Tax & Pre-Audit Copilot Modal */}
      <TaxAICopilotModal
        isOpen={isAICopilotOpen}
        onClose={() => setIsAICopilotOpen(false)}
        sales={sales}
        purchases={purchases}
        bankAccounts={bankAccounts}
        bankTransactions={bankTransactions}
        settings={settings}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onResetData={handleResetData}
        theme={theme}
        onSetTheme={setTheme}
      />

      {/* How to Use Guide Modal */}
      <HowToUseModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* Phone Local Storage & Sync Engine Modal */}
      <LocalStorageSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        uid={user?.uid || (isLocalGuestMode ? 'guest' : null)}
        userEmail={user?.email || (isLocalGuestMode ? 'Local Phone Ledger' : null)}
        onDataRestored={handleReloadFromLocalStorage}
        onPullFromCloud={handleRefreshFromCloud}
      />

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreconciledBankCount={unreconciledBankCount}
        auditIssuesCount={auditReport.issues.length}
      />
    </AndroidShell>
  );
}
