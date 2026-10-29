import React, { useState, useEffect } from 'react';

// Local stubs replacing Firestore database operations
const db = {} as unknown;
const doc = (..._args: unknown[]) => ({});
const setDoc = async (..._args: unknown[]) => {};
const updateDoc = async (..._args: unknown[]) => {};
const deleteDoc = async (..._args: unknown[]) => {};
const writeBatch = (..._args: unknown[]) => ({
  set: (..._args: unknown[]) => {},
  update: (..._args: unknown[]) => {},
  delete: (..._args: unknown[]) => {},
  commit: async () => {},
});
const serverTimestamp = () => Date.now();
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  WRITE = 'write',
}
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
import { syncViaAppsScript, fetchDataFromGoogleSheets, GoogleSheetsImportData } from './services/googleSheetsService';
import { CheckCircle2, Landmark, ShieldCheck, HelpCircle, Sun, Moon, Smartphone } from 'lucide-react';

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

export default function App() {
  // Single-User Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return localStorage.getItem('taxguard_logged_in') === 'true';
    } catch {
      return true;
    }
  });
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const authUsername = localStorage.getItem('taxguard_username') || 'solomon';
  const user = { uid: authUsername, email: `${authUsername}@local`, displayName: authUsername };
  const [hasSettingsDoc, setHasSettingsDoc] = useState(true);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const validUser = localStorage.getItem('taxguard_username') || 'solomon';
    const validPass = localStorage.getItem('taxguard_password') || 'solomon123';

    if (usernameInput.trim().toLowerCase() === validUser.toLowerCase() && passwordInput === validPass) {
      setIsLoggedIn(true);
      try {
        localStorage.setItem('taxguard_logged_in', 'true');
      } catch {}
      showToast(`Welcome back, ${validUser}!`);
    } else {
      setLoginError('Invalid username or password. Default is solomon / solomon123.');
    }
  };

  const handleSignOut = () => {
    setIsLoggedIn(false);
    try {
      localStorage.setItem('taxguard_logged_in', 'false');
    } catch {}
    showToast('Signed out successfully.');
  };

  // Phone Local Storage initial hydration
  const initialLocal = loadUserLocalData(authUsername);

  // Primary financial state: initialized immediately from phone storage
  const [sales, setSales] = useState<SaleTransaction[]>(initialLocal.sales);
  const [purchases, setPurchases] = useState<PurchaseItem[]>(initialLocal.purchases);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initialLocal.bankAccounts);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(initialLocal.bankTransactions);
  const [dailyCloses, setDailyCloses] = useState<DailyRegisterClose[]>(initialLocal.dailyCloses);
  const [reconcilingItems, setReconcilingItems] = useState<ReconcilingItem[]>(initialLocal.reconcilingItems);
  const [brsStatements, setBrsStatements] = useState<BankReconciliationStatement[]>(initialLocal.brsStatements);
  const [settings, setSettings] = useState<TaxSettings>(initialLocal.settings);

  // Phone Local Storage & Sync Queue Status
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(getQuotaExceededFlag());
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getPendingSyncMutations(authUsername).length);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Navigation & Modal triggers
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'sales' || tabParam === 'purchases' || tabParam === 'bank' || tabParam === 'audit') {
        return tabParam;
      }
    } catch {}
    return 'dashboard';
  });
  const [isAddSaleOpen, setIsAddSaleOpen] = useState(false);
  const [isAddPurchaseOpen, setIsAddPurchaseOpen] = useState(false);
  const [isDailyCloseOpen, setIsDailyCloseOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAICopilotOpen, setIsAICopilotOpen] = useState(false);
  const [initialEditingSale, setInitialEditingSale] = useState<SaleTransaction | null>(null);
  const [initialEditingPurchase, setInitialEditingPurchase] = useState<PurchaseItem | null>(null);

  // Google Sheets Automatic Background Sync State
  const [autoSyncStatus, setAutoSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  >('idle');
  const [lastAutoSyncTime, setLastAutoSyncTime] = useState<string | null>(
    initialLocal.settings.lastGoogleSheetSyncAt || null
  );
  const isFirstMountRef = React.useRef(true);
  const isAutoSyncingRef = React.useRef(false);
  const autoSyncTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Initial login & conflict resolution: pull latest data from Google Sheet if available
  // Requirement 1 & 2: When logging in from a new device, do NOT push empty data. Perform read-only retrieval
  // and force device to update local storage if remote sheet contains latest data.
  useEffect(() => {
    if (!isLoggedIn || !navigator.onLine) return;

    const activeUser = localStorage.getItem('taxguard_username') || 'solomon';
    const currentLocal = loadUserLocalData(activeUser);
    const cleanUrl = currentLocal.settings.googleAppsScriptUrl?.trim() || settings.googleAppsScriptUrl?.trim();

    if (!cleanUrl) return;

    fetchDataFromGoogleSheets({ appsScriptUrl: cleanUrl, settings: currentLocal.settings })
      .then((imported) => {
        if (!imported) return;
        const remoteHasRecords = imported.sales.length > 0 || imported.purchases.length > 0;
        if (!remoteHasRecords) return;

        const localIsEmpty = currentLocal.sales.length === 0 && currentLocal.purchases.length === 0;
        const remoteHasMore =
          imported.sales.length > currentLocal.sales.length ||
          imported.purchases.length > currentLocal.purchases.length;

        if (localIsEmpty || remoteHasMore) {
          if (imported.sales.length > 0) {
            setSales(imported.sales);
            saveUserLocalCollection('sales', imported.sales, activeUser);
          }
          if (imported.purchases.length > 0) {
            setPurchases(imported.purchases);
            saveUserLocalCollection('purchases', imported.purchases, activeUser);
          }
          if (imported.bankAccounts.length > 0) {
            setBankAccounts(imported.bankAccounts);
            saveUserLocalCollection('bankAccounts', imported.bankAccounts, activeUser);
          }
          if (imported.bankTransactions.length > 0) {
            setBankTransactions(imported.bankTransactions);
            saveUserLocalCollection('bankTransactions', imported.bankTransactions, activeUser);
          }
          if (imported.dailyCloses.length > 0) {
            setDailyCloses(imported.dailyCloses);
            saveUserLocalCollection('dailyCloses', imported.dailyCloses, activeUser);
          }
          if (imported.settings && Object.keys(imported.settings).length > 0) {
            const merged = { ...currentLocal.settings, ...imported.settings };
            setSettings(merged);
            saveUserLocalSettings(merged, activeUser);
          }
          setLastAutoSyncTime(new Date().toISOString());
          showToast('Updated local storage with latest ledger data from cloud.');
        }
      })
      .catch((err) => {
        console.warn('Quiet cloud fetch error:', err);
      });
  }, [isLoggedIn]);

  // Quiet background auto-sync to Google Sheets via Apps Script Web App when financial data changes
  useEffect(() => {
    // Avoid triggering sync on initial render hydration
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    // Protection: never overwrite remote Google Sheet with empty tables from a fresh device
    if (sales.length === 0 && purchases.length === 0) {
      return;
    }

    const cleanUrl = settings.googleAppsScriptUrl?.trim();
    const isAutoSyncEnabled = settings.autoSyncToGoogleSheets !== false;

    if (!cleanUrl || !isAutoSyncEnabled) {
      return;
    }

    if (autoSyncTimeoutRef.current) {
      clearTimeout(autoSyncTimeoutRef.current);
    }

    // Debounce 3.5 seconds after user edit
    autoSyncTimeoutRef.current = setTimeout(async () => {
      if (isAutoSyncingRef.current) return;

      if (!navigator.onLine) {
        setAutoSyncStatus('offline');
        return;
      }

      isAutoSyncingRef.current = true;
      setAutoSyncStatus('syncing');

      try {
        const cashAudit = calculateDailyCashExamination(
          sales,
          purchases,
          bankTransactions,
          dailyCloses
        );

        const res = await syncViaAppsScript(cleanUrl, {
          appsScriptUrl: cleanUrl,
          existingSpreadsheetId: settings.googleSheetId,
          settings,
          sales,
          purchases,
          bankAccounts,
          bankTransactions,
          dailyCloses,
          dailyCashAudit: cashAudit,
        });

        if (res.success) {
          setAutoSyncStatus('synced');
          setLastAutoSyncTime(res.syncedAt);
          setSettings((prev) => {
            const updated: TaxSettings = {
              ...prev,
              lastGoogleSheetSyncAt: res.syncedAt,
              googleSheetId: res.spreadsheetId || prev.googleSheetId,
              googleSheetUrl: res.spreadsheetUrl || prev.googleSheetUrl,
              googleSheetName: res.spreadsheetTitle || prev.googleSheetName,
            };
            saveUserLocalSettings(updated, authUsername);
            return updated;
          });
        } else {
          setAutoSyncStatus('error');
        }
      } catch (err) {
        console.warn('Quiet background sync failed:', err);
        setAutoSyncStatus('error');
      } finally {
        isAutoSyncingRef.current = false;
      }
    }, 3500);

    return () => {
      if (autoSyncTimeoutRef.current) {
        clearTimeout(autoSyncTimeoutRef.current);
      }
    };
  }, [
    sales,
    purchases,
    bankAccounts,
    bankTransactions,
    dailyCloses,
    settings.businessName,
    settings.taxIdNumber,
    settings.currency,
    settings.defaultSalesTaxRate,
    settings.corporateTaxRate,
    settings.googleAppsScriptUrl,
    settings.autoSyncToGoogleSheets,
  ]);

  // Background auto-sync upon network reconnection
  useEffect(() => {
    const handleReconnected = () => {
      if (sales.length === 0 && purchases.length === 0) return;
      const cleanUrl = settings.googleAppsScriptUrl?.trim();
      const isAutoSyncEnabled = settings.autoSyncToGoogleSheets !== false;

      if (cleanUrl && isAutoSyncEnabled && !isAutoSyncingRef.current) {
        isAutoSyncingRef.current = true;
        setAutoSyncStatus('syncing');

        const cashAudit = calculateDailyCashExamination(
          sales,
          purchases,
          bankTransactions,
          dailyCloses
        );

        syncViaAppsScript(cleanUrl, {
          appsScriptUrl: cleanUrl,
          existingSpreadsheetId: settings.googleSheetId,
          settings,
          sales,
          purchases,
          bankAccounts,
          bankTransactions,
          dailyCloses,
          dailyCashAudit: cashAudit,
        })
          .then((res) => {
            if (res.success) {
              setAutoSyncStatus('synced');
              setLastAutoSyncTime(res.syncedAt);
              setSettings((prev) => {
                const updated: TaxSettings = {
                  ...prev,
                  lastGoogleSheetSyncAt: res.syncedAt,
                  googleSheetId: res.spreadsheetId || prev.googleSheetId,
                  googleSheetUrl: res.spreadsheetUrl || prev.googleSheetUrl,
                  googleSheetName: res.spreadsheetTitle || prev.googleSheetName,
                };
                saveUserLocalSettings(updated, authUsername);
                return updated;
              });
            }
          })
          .catch(() => {
            setAutoSyncStatus('error');
          })
          .finally(() => {
            isAutoSyncingRef.current = false;
          });
      }
    };

    window.addEventListener('online', handleReconnected);
    return () => window.removeEventListener('online', handleReconnected);
  }, [sales, purchases, bankAccounts, bankTransactions, dailyCloses, settings, authUsername]);

  // On-demand refresh: pulls latest data quietly and updates local storage
  const handleRefreshFromCloud = async () => {
    const cleanUrl = settings.googleAppsScriptUrl?.trim();
    if (!cleanUrl) {
      showToast('No cloud synchronization URL configured in settings.');
      return;
    }
    showToast('Checking for latest updates...');
    try {
      const imported = await fetchDataFromGoogleSheets({ appsScriptUrl: cleanUrl, settings });
      if (imported && (imported.sales.length > 0 || imported.purchases.length > 0)) {
        if (imported.sales.length > 0) {
          setSales(imported.sales);
          saveUserLocalCollection('sales', imported.sales, authUsername);
        }
        if (imported.purchases.length > 0) {
          setPurchases(imported.purchases);
          saveUserLocalCollection('purchases', imported.purchases, authUsername);
        }
        if (imported.bankAccounts.length > 0) {
          setBankAccounts(imported.bankAccounts);
          saveUserLocalCollection('bankAccounts', imported.bankAccounts, authUsername);
        }
        if (imported.bankTransactions.length > 0) {
          setBankTransactions(imported.bankTransactions);
          saveUserLocalCollection('bankTransactions', imported.bankTransactions, authUsername);
        }
        if (imported.dailyCloses.length > 0) {
          setDailyCloses(imported.dailyCloses);
          saveUserLocalCollection('dailyCloses', imported.dailyCloses, authUsername);
        }
        showToast('Local ledger updated with latest records.');
      } else {
        showToast('Local ledger is already up to date.');
      }
    } catch {
      showToast('Could not reach cloud backup. Check network connection.');
    }
  };


  // Action completion helper (local storage is primary, Firestore database removed)
  const safeWrite = async (
    _action?: () => Promise<void>,
    _op?: OperationType,
    _path?: string,
    syncMutationId?: string,
    uid?: string | null
  ) => {
    if (syncMutationId) {
      removeSyncMutation(syncMutationId, uid);
    }
    setPendingSyncCount(0);
    setIsQuotaExceeded(false);
    setQuotaExceededFlag(false);
  };

  // Firestore & Phone Local Storage Action Handlers
  const handleAddSale = async (newSale: SaleTransaction) => {
    const saleId = sanitizeId(newSale.id);
    const existingForDate = sales.find((s) => s.date === newSale.date && s.id !== saleId);
    if (existingForDate) {
      // Seamlessly update the existing daily sales entry for this date
      return handleUpdateSale({
        ...newSale,
        id: existingForDate.id,
      });
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

    // 3. If there is a bank transfer amount, auto-create or update matching bank transaction
    if (transferAmount > 0) {
      let currentBankAccounts = [...bankAccounts];
      let targetBankAccountId = newSale.bankAccountId ? sanitizeId(newSale.bankAccountId) : (currentBankAccounts[0]?.id || '');

      // If no bank accounts exist yet, auto-create the primary CBE account so money is never lost
      if (!targetBankAccountId && currentBankAccounts.length === 0) {
        const defaultAcc: BankAccount = {
          id: 'acc-cbe-main',
          name: 'Main Business Account',
          bankName: 'Commercial Bank of Ethiopia (CBE)',
          accountNumberMasked: '•••• 4821',
          type: 'checking',
          currentBalance: 0,
          currency: settings.currency,
          color: 'from-orange-700 to-amber-900',
        };
        currentBankAccounts = [defaultAcc];
        setBankAccounts(currentBankAccounts);
        saveUserLocalCollection('bankAccounts', currentBankAccounts, user?.uid);
        targetBankAccountId = defaultAcc.id;
      }

      if (targetBankAccountId) {
        const nextAccounts = currentBankAccounts.map((a) =>
          a.id === targetBankAccountId
            ? { ...a, currentBalance: a.currentBalance + transferAmount }
            : a
        );
        setBankAccounts(nextAccounts);
        saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);

        const txId = sanitizeId(`btx-sale-${saleId}`);
        const saleBankTx: BankTransaction = {
          id: txId,
          bankAccountId: targetBankAccountId,
          date: newSale.date,
          description: `Daily Bank Transfer Sales (${newSale.date}) — Ref ${newSale.receiptNumber}`,
          type: 'credit',
          amount: transferAmount,
          category: 'sale_deposit',
          referenceId: saleId,
          isReconciled: true,
          notes: `Auto-reconciled with Daily Sales ${newSale.receiptNumber} (Transfer portion)`.slice(0, 1000),
        };
        const nextTxs = [
          saleBankTx,
          ...bankTransactions.filter((t) => t.id !== txId && t.referenceId !== saleId),
        ];
        setBankTransactions(nextTxs);
        saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

        enqueueSyncMutation({
          id: `sync-btx-${txId}`,
          uid: user?.uid || 'guest',
          collection: 'bankTransactions',
          operation: 'set',
          docId: txId,
          data: {
            ...saleBankTx,
            ownerId: user?.uid || 'guest',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          timestamp: Date.now(),
        });
      }
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
      transferAmount > 0
        ? sanitizeId(updatedSale.bankAccountId || oldBankId || bankAccounts[0]?.id || 'acc-cbe-main')
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

    const txId = sanitizeId(`btx-sale-${saleId}`);
    if (transferAmount > 0 && newBankId) {
      const saleBankTx: BankTransaction = {
        id: txId,
        bankAccountId: newBankId,
        date: updatedSale.date,
        description: `Daily Bank Transfer Sales (${updatedSale.date}) — Ref ${updatedSale.receiptNumber}`,
        type: 'credit',
        amount: transferAmount,
        category: 'sale_deposit',
        referenceId: saleId,
        isReconciled: true,
        notes: `Auto-reconciled with Daily Sales ${updatedSale.receiptNumber} (Transfer portion)`.slice(0, 1000),
      };
      const nextTxs = [
        saleBankTx,
        ...bankTransactions.filter((t) => t.id !== txId && t.referenceId !== saleId),
      ];
      setBankTransactions(nextTxs);
      saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

      enqueueSyncMutation({
        id: `sync-btx-${txId}`,
        uid: user?.uid || 'guest',
        collection: 'bankTransactions',
        operation: 'set',
        docId: txId,
        data: {
          ...saleBankTx,
          ownerId: user?.uid || 'guest',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        timestamp: Date.now(),
      });
    } else {
      const nextTxs = bankTransactions.filter(
        (t) => t.id !== txId && t.referenceId !== saleId
      );
      if (nextTxs.length !== bankTransactions.length) {
        setBankTransactions(nextTxs);
        saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

        enqueueSyncMutation({
          id: `sync-del-btx-${txId}`,
          uid: user?.uid || 'guest',
          collection: 'bankTransactions',
          operation: 'delete',
          docId: txId,
          timestamp: Date.now(),
        });
      }
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
        const existingAutoTx = bankTransactions.find((t) => t.id === txId || t.referenceId === saleId);
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

    const txId = sanitizeId(`btx-sale-${id}`);
    const nextTxs = bankTransactions.filter((t) => t.id !== txId && t.referenceId !== id);
    if (nextTxs.length !== bankTransactions.length) {
      setBankTransactions(nextTxs);
      saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);
      enqueueSyncMutation({
        id: `sync-del-btx-${txId}`,
        uid: user?.uid || 'guest',
        collection: 'bankTransactions',
        operation: 'delete',
        docId: txId,
        timestamp: Date.now(),
      });
    }

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

    // Adjust bank account and bank transactions for cash deposit from register
    const closeDeposit = Number(close.bankDepositAmount) || 0;
    const oldDeposit = existingClose ? Number(existingClose.bankDepositAmount) || 0 : 0;
    const txId = sanitizeId(`btx-close-${closeId}`);
    const primaryAcc = bankAccounts[0];

    if (closeDeposit > 0 && primaryAcc) {
      const delta = closeDeposit - oldDeposit;
      if (delta !== 0) {
        const nextAccounts = bankAccounts.map((a) =>
          a.id === primaryAcc.id ? { ...a, currentBalance: a.currentBalance + delta } : a
        );
        setBankAccounts(nextAccounts);
        saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
      }

      const depositTx: BankTransaction = {
        id: txId,
        bankAccountId: primaryAcc.id,
        date: close.date,
        description: `Daily Z-Report Register Cash Deposit (${close.date}) — Ref ${closeId}`,
        type: 'credit',
        amount: closeDeposit,
        category: 'sales_cash_deposit',
        referenceId: closeId,
        isReconciled: true,
        notes: `Reconciled with Z-Report physical cash drawer count for ${close.date}`,
      };
      const nextTxs = [depositTx, ...bankTransactions.filter((t) => t.id !== txId && t.referenceId !== closeId)];
      setBankTransactions(nextTxs);
      saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);

      enqueueSyncMutation({
        id: `sync-btx-${txId}`,
        uid: user?.uid || 'guest',
        collection: 'bankTransactions',
        operation: 'set',
        docId: txId,
        data: {
          ...depositTx,
          ownerId: user?.uid || 'guest',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        timestamp: Date.now(),
      });
    } else if (oldDeposit > 0 && closeDeposit === 0) {
      if (primaryAcc) {
        const nextAccounts = bankAccounts.map((a) =>
          a.id === primaryAcc.id ? { ...a, currentBalance: a.currentBalance - oldDeposit } : a
        );
        setBankAccounts(nextAccounts);
        saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
      }
      const nextTxs = bankTransactions.filter((t) => t.id !== txId && t.referenceId !== closeId);
      if (nextTxs.length !== bankTransactions.length) {
        setBankTransactions(nextTxs);
        saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);
        enqueueSyncMutation({
          id: `sync-del-btx-${txId}`,
          uid: user?.uid || 'guest',
          collection: 'bankTransactions',
          operation: 'delete',
          docId: txId,
          timestamp: Date.now(),
        });
      }
    }

    // 4. Online Firestore write
    await safeWrite(
      async () => {
        if (existingClose) {
          await updateDoc(doc(db, 'dailyCloses', closeId), closePayload);
        } else {
          await setDoc(doc(db, 'dailyCloses', closeId), closePayload);
        }
        if (closeDeposit > 0 && primaryAcc) {
          const delta = closeDeposit - oldDeposit;
          if (delta !== 0) {
            await updateDoc(doc(db, 'bankAccounts', primaryAcc.id), {
              currentBalance: primaryAcc.currentBalance + delta,
              updatedAt: serverTimestamp(),
            });
          }
          await setDoc(doc(db, 'bankTransactions', txId), {
            id: txId,
            ownerId: user!.uid,
            bankAccountId: primaryAcc.id,
            date: close.date.slice(0, 30),
            description: `Daily Z-Report Register Cash Deposit (${close.date}) — Ref ${closeId}`.slice(0, 500),
            type: 'credit',
            amount: closeDeposit,
            category: 'sales_cash_deposit',
            referenceId: closeId,
            isReconciled: true,
            notes: `Reconciled with Z-Report physical cash drawer count for ${close.date}`.slice(0, 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (oldDeposit > 0 && closeDeposit === 0) {
          await deleteDoc(doc(db, 'bankTransactions', txId)).catch(() => {});
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
    const oldClose = dailyCloses.find((c) => c.id === id);
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

    const txId = sanitizeId(`btx-close-${id}`);
    const nextTxs = bankTransactions.filter((t) => t.id !== txId && t.referenceId !== id);
    if (nextTxs.length !== bankTransactions.length) {
      setBankTransactions(nextTxs);
      saveUserLocalCollection('bankTransactions', nextTxs, user?.uid);
      enqueueSyncMutation({
        id: `sync-del-btx-${txId}`,
        uid: user?.uid || 'guest',
        collection: 'bankTransactions',
        operation: 'delete',
        docId: txId,
        timestamp: Date.now(),
      });
    }

    if (oldClose && oldClose.bankDepositAmount > 0 && bankAccounts[0]) {
      const primaryAcc = bankAccounts[0];
      const nextAccounts = bankAccounts.map((a) =>
        a.id === primaryAcc.id ? { ...a, currentBalance: a.currentBalance - oldClose.bankDepositAmount } : a
      );
      setBankAccounts(nextAccounts);
      saveUserLocalCollection('bankAccounts', nextAccounts, user?.uid);
    }

    await safeWrite(
      async () => {
        await deleteDoc(doc(db, 'dailyCloses', id));
        const txId = sanitizeId(`btx-close-${id}`);
        await deleteDoc(doc(db, 'bankTransactions', txId)).catch(() => {});
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

  // Populate data from Google Sheet (First-time onboarding or restoring records)
  const handlePopulateFromGoogleSheets = (
    importedData: GoogleSheetsImportData,
    mode: 'replace' | 'merge'
  ) => {
    const activeUid = user?.uid;

    if (mode === 'replace') {
      // 1. Replace all ledger collections with records fetched from Google Sheets
      const newSales = importedData.sales;
      const newPurchases = importedData.purchases;
      const newBankAccounts =
        importedData.bankAccounts.length > 0 ? importedData.bankAccounts : bankAccounts;
      const newBankTransactions = importedData.bankTransactions;
      const newDailyCloses = importedData.dailyCloses;

      const newSettings: TaxSettings = {
        ...settings,
        ...(importedData.settings || {}),
        googleSheetId: importedData.sourceSpreadsheetId || settings.googleSheetId,
        googleSheetName: importedData.sourceSpreadsheetTitle || settings.googleSheetName,
        lastGoogleSheetSyncAt: new Date().toISOString(),
      };

      // Save all collections to phone storage immediately
      saveUserLocalCollection('sales', newSales, activeUid);
      saveUserLocalCollection('purchases', newPurchases, activeUid);
      saveUserLocalCollection('bankAccounts', newBankAccounts, activeUid);
      saveUserLocalCollection('bankTransactions', newBankTransactions, activeUid);
      saveUserLocalCollection('dailyCloses', newDailyCloses, activeUid);
      saveUserLocalSettings(newSettings, activeUid);

      // Update in-memory state
      setSales(newSales);
      setPurchases(newPurchases);
      setBankAccounts(newBankAccounts);
      setBankTransactions(newBankTransactions);
      setDailyCloses(newDailyCloses);
      setSettings(newSettings);
      setLastAutoSyncTime(newSettings.lastGoogleSheetSyncAt || null);

      showToast(
        `Populated ${newSales.length} sales, ${newPurchases.length} purchases, and ${newBankTransactions.length} bank transactions from Google Sheet!`
      );
    } else {
      // 2. Safe merge mode: add non-duplicate records
      const existingSaleKeys = new Set(
        sales.map((s) => `${s.date}__${s.receiptNumber.trim().toLowerCase()}`)
      );
      const additionalSales = importedData.sales.filter(
        (s) => !existingSaleKeys.has(`${s.date}__${s.receiptNumber.trim().toLowerCase()}`)
      );
      const mergedSales = [...sales, ...additionalSales];

      const existingPurchaseKeys = new Set(
        purchases.map((p) => `${p.date}__${p.invoiceNumber.trim().toLowerCase()}`)
      );
      const additionalPurchases = importedData.purchases.filter(
        (p) => !existingPurchaseKeys.has(`${p.date}__${p.invoiceNumber.trim().toLowerCase()}`)
      );
      const mergedPurchases = [...purchases, ...additionalPurchases];

      const existingAccountIds = new Set(bankAccounts.map((b) => b.id));
      const additionalAccounts = importedData.bankAccounts.filter(
        (b) => !existingAccountIds.has(b.id)
      );
      const mergedAccounts = [...bankAccounts, ...additionalAccounts];

      const existingTxnKeys = new Set(
        bankTransactions.map((t) => `${t.date}__${t.referenceId || t.id}__${t.amount}`)
      );
      const additionalTxns = importedData.bankTransactions.filter(
        (t) => !existingTxnKeys.has(`${t.date}__${t.referenceId || t.id}__${t.amount}`)
      );
      const mergedTxns = [...bankTransactions, ...additionalTxns];

      const existingCloseDates = new Set(dailyCloses.map((c) => c.date));
      const additionalCloses = importedData.dailyCloses.filter(
        (c) => !existingCloseDates.has(c.date)
      );
      const mergedCloses = [...dailyCloses, ...additionalCloses];

      const newSettings: TaxSettings = {
        ...settings,
        ...(importedData.settings || {}),
        googleSheetId: importedData.sourceSpreadsheetId || settings.googleSheetId,
        googleSheetName: importedData.sourceSpreadsheetTitle || settings.googleSheetName,
        lastGoogleSheetSyncAt: new Date().toISOString(),
      };

      saveUserLocalCollection('sales', mergedSales, activeUid);
      saveUserLocalCollection('purchases', mergedPurchases, activeUid);
      saveUserLocalCollection('bankAccounts', mergedAccounts, activeUid);
      saveUserLocalCollection('bankTransactions', mergedTxns, activeUid);
      saveUserLocalCollection('dailyCloses', mergedCloses, activeUid);
      saveUserLocalSettings(newSettings, activeUid);

      setSales(mergedSales);
      setPurchases(mergedPurchases);
      setBankAccounts(mergedAccounts);
      setBankTransactions(mergedTxns);
      setDailyCloses(mergedCloses);
      setSettings(newSettings);
      setLastAutoSyncTime(newSettings.lastGoogleSheetSyncAt || null);

      showToast(
        `Merged +${additionalSales.length} sales and +${additionalPurchases.length} purchases from Google Sheet!`
      );
    }
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
    const filename = `TaxAudit_Dossier_${settings.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    const downloadDirectly = () => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Tax Audit CSV Dossier exported!');
    };

    // Android & Mobile Web Share API support
    if (typeof navigator !== 'undefined' && 'canShare' in navigator && typeof File !== 'undefined') {
      try {
        const file = new File([blob], filename, { type: 'text/csv' });
        if (navigator.canShare({ files: [file] })) {
          navigator
            .share({
              files: [file],
              title: `${settings.businessName} Tax Dossier`,
              text: `TaxGuard Financial Audit Dossier for ${settings.businessName}`,
            })
            .then(() => {
              showToast('Tax Audit Dossier shared successfully!');
            })
            .catch((err) => {
              if (err.name !== 'AbortError') {
                downloadDirectly();
              }
            });
          return;
        }
      } catch {
        // Fall through to standard download
      }
    }

    downloadDirectly();
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="w-11 h-11 rounded-xl bg-orange-700/10 border border-orange-700/20 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-orange-700 dark:text-orange-400" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5 text-orange-700 dark:text-orange-400" />
                <span>አጠቃቀም (Help)</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-950/60 text-orange-900 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-700 dark:text-orange-400 shrink-0" />
              <span>Financial &amp; Tax Compliance Ledger</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Solomon Building Materials Shop
            </h1>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              Log in with your username and password to access your local ledger and tax records.
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">Username</label>
              <input
                type="text"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-orange-700"
                placeholder="solomon"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 font-mono focus:outline-none focus:border-orange-700"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-sm font-semibold transition-all cursor-pointer shadow-sm"
            >
              Sign In to Ledger
            </button>
          </form>

          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 text-center">
            Default Login: <code className="font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">solomon</code> / <code className="font-mono bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">solomon123</code>
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
    const local = loadUserLocalData(authUsername);
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
    setPendingSyncCount(getPendingSyncMutations(authUsername).length);
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
      onOpenBankDeposit={() => {
        setActiveTab('bank');
      }}
      onOpenScanReceipt={() => {
        setInitialEditingPurchase(null);
        setActiveTab('purchases');
        setIsAddPurchaseOpen(true);
      }}
      userEmail={`${authUsername} (Single User)`}
      userName={authUsername}
      onSignOut={handleSignOut}
      unreconciledBankCount={unreconciledBankCount}
      auditIssuesCount={auditReport.issues.length}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      isQuotaExceeded={isQuotaExceeded}
      pendingSyncCount={pendingSyncCount}
      onOpenSyncModal={() => setIsSyncModalOpen(true)}
      autoSyncStatus={autoSyncStatus}
      lastAutoSyncTime={lastAutoSyncTime}
      hasAppsScriptUrl={Boolean(settings.googleAppsScriptUrl)}
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
          autoSyncStatus={autoSyncStatus}
          lastAutoSyncTime={lastAutoSyncTime}
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
        uid={authUsername}
        userEmail={`${authUsername} (Single User)`}
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
