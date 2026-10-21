import React, { useState, useEffect } from 'react';
import {
  BankAccount,
  BankReconciliationStatement,
  BankTransaction,
  ReconcilingItem,
  SaleTransaction,
  PurchaseItem,
  TaxSettings,
} from '../../types';
import {
  formatCurrency,
  formatDate,
  formatBankCategory,
  getSaleBankTransferAmount,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { BankReconciliationSheet } from './BankReconciliationSheet';
import { ScanBankStatementModal } from './ScanBankStatementModal';
import {
  Landmark,
  Plus,
  Send,
  FileSpreadsheet,
  ListFilter,
  Trash2,
  Pencil,
  Sparkles,
  Camera,
} from 'lucide-react';

interface BankManagerProps {
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  reconcilingItems: ReconcilingItem[];
  brsStatements: BankReconciliationStatement[];
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  settings: TaxSettings;
  onAddBankAccount: (account: BankAccount) => void;
  onUpdateBankAccount: (account: BankAccount) => void;
  onDeleteBankAccount: (id: string) => void;
  onAddTransaction: (tx: BankTransaction) => void;
  onUpdateTransaction: (tx: BankTransaction) => void;
  onDeleteTransaction: (id: string) => void;
  onBatchAddTransactions?: (
    transactions: BankTransaction[],
    targetAccountId?: string,
    newBalance?: number
  ) => void;
  onReconcileTransaction: (txId: string, referenceId?: string) => void;
  onTransferFunds: (fromId: string, toId: string, amount: number, note: string) => void;
  onAddReconcilingItem: (item: ReconcilingItem) => void;
  onUpdateReconcilingItem: (item: ReconcilingItem) => void;
  onDeleteReconcilingItem: (id: string) => void;
  onPostBookAdjustment: (item: ReconcilingItem) => void;
  onSaveBRSStatement: (statement: BankReconciliationStatement) => void;
  onUpdateBRSStatement: (statement: BankReconciliationStatement) => void;
  onDeleteBRSStatement: (id: string) => void;
}

export const BankManager: React.FC<BankManagerProps> = ({
  bankAccounts,
  bankTransactions,
  reconcilingItems,
  brsStatements,
  sales,
  purchases,
  settings,
  onAddBankAccount,
  onUpdateBankAccount,
  onDeleteBankAccount,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onBatchAddTransactions,
  onReconcileTransaction,
  onTransferFunds,
  onAddReconcilingItem,
  onUpdateReconcilingItem,
  onDeleteReconcilingItem,
  onPostBookAdjustment,
  onSaveBRSStatement,
  onUpdateBRSStatement,
  onDeleteBRSStatement,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [subTab, setSubTab] = useState<'brs' | 'feed'>('brs');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [filterType, setFilterType] = useState<
    'all' | 'deposits' | 'payments' | 'unreconciled' | 'reconciled'
  >('all');

  // Modals
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  // Editing States
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editingTx, setEditingTx] = useState<BankTransaction | null>(null);

  // Add / Edit Bank Account Form
  const [accName, setAccName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accNumberMasked, setAccNumberMasked] = useState('');
  const [accType, setAccType] = useState<BankAccount['type']>('checking');
  const [openingBalance, setOpeningBalance] = useState(0);

  // Add / Edit Transaction Form
  const [targetBankId, setTargetBankId] = useState(bankAccounts[0]?.id || '');
  const [txDate, setTxDate] = useState(today);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [txType, setTxType] = useState<'credit' | 'debit'>('credit');
  const [txCategory, setTxCategory] = useState<BankTransaction['category']>('sales_cash_deposit');
  const [notes, setNotes] = useState('');

  // Transfer Form
  const [transferFromId, setTransferFromId] = useState(bankAccounts[0]?.id || '');
  const [transferToId, setTransferToId] = useState(bankAccounts[1]?.id || '');
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferNote, setTransferNote] = useState('Tax Reserve Escrow Allocation');

  useEffect(() => {
    if (!targetBankId && bankAccounts[0]) {
      setTargetBankId(bankAccounts[0].id);
    }
    if (!transferFromId && bankAccounts[0]) {
      setTransferFromId(bankAccounts[0].id);
    }
    if (!transferToId && bankAccounts[1]) {
      setTransferToId(bankAccounts[1].id);
    }
  }, [bankAccounts, targetBankId, transferFromId, transferToId]);

  const openNewAccountModal = () => {
    setEditingAccount(null);
    setAccName('');
    setBankName('');
    setAccNumberMasked('');
    setAccType('checking');
    setOpeningBalance(0);
    setIsAddAccountOpen(true);
  };

  const openEditAccountModal = (acc: BankAccount) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setBankName(acc.bankName);
    setAccNumberMasked(acc.accountNumberMasked.replace(/[^0-9]/g, '').slice(-4));
    setAccType(acc.type);
    setOpeningBalance(acc.currentBalance);
    setIsAddAccountOpen(true);
  };

  const openNewTxModal = () => {
    setEditingTx(null);
    setTargetBankId(bankAccounts[0]?.id || '');
    setTxDate(today);
    setDescription('');
    setAmount(0);
    setTxType('credit');
    setTxCategory('sales_cash_deposit');
    setNotes('');
    setIsAddTxOpen(true);
  };

  const openNewDepositModal = () => {
    setEditingTx(null);
    setTargetBankId(bankAccounts[0]?.id || '');
    setTxDate(today);
    setDescription('Sales cash deposited into bank account');
    setAmount(0);
    setTxType('credit');
    setTxCategory('sales_cash_deposit');
    setNotes('');
    setIsAddTxOpen(true);
  };

  const openNewWithdrawModal = () => {
    setEditingTx(null);
    setTargetBankId(bankAccounts[0]?.id || '');
    setTxDate(today);
    setDescription('Cash withdrawal from bank account');
    setAmount(0);
    setTxType('debit');
    setTxCategory('cash_withdraw');
    setNotes('');
    setIsAddTxOpen(true);
  };

  const openEditTxModal = (tx: BankTransaction) => {
    setEditingTx(tx);
    setTargetBankId(tx.bankAccountId);
    setTxDate(tx.date);
    setDescription(tx.description);
    setAmount(tx.amount);
    setTxType(tx.type);
    setTxCategory(tx.category);
    setNotes(tx.notes || '');
    setIsAddTxOpen(true);
  };

  // Filtering
  const filteredTransactions = bankTransactions.filter((tx) => {
    if (selectedAccountId !== 'all' && tx.bankAccountId !== selectedAccountId) return false;
    if (filterType === 'deposits' && tx.type !== 'credit') return false;
    if (filterType === 'payments' && tx.type !== 'debit') return false;
    if (filterType === 'unreconciled' && tx.isReconciled) return false;
    if (filterType === 'reconciled' && !tx.isReconciled) return false;
    return true;
  });

  // Always sorted strictly by date: recent to old
  const sortedTransactions = [...filteredTransactions].sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  const totalMonitoredBalance = bankAccounts.reduce((acc, b) => acc + b.currentBalance, 0);
  const unreconciledCount = bankTransactions.filter((t) => !t.isReconciled).length;
  const depositCount = bankTransactions.filter((t) => t.type === 'credit').length;
  const paymentCount = bankTransactions.filter((t) => t.type === 'debit').length;

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim() || !bankName.trim()) return;

    const rawDigits = accNumberMasked.trim().replace(/[^0-9]/g, '');
    const maskedDigits = rawDigits
      ? `•••• ${rawDigits.slice(-4)}`
      : editingAccount?.accountNumberMasked || '•••• 0000';

    const accountRecord: BankAccount = {
      id: editingAccount ? editingAccount.id : `acc-${Date.now()}`,
      name: accName.trim(),
      bankName: bankName.trim(),
      accountNumberMasked: maskedDigits,
      type: accType,
      currentBalance: openingBalance,
      currency: editingAccount?.currency || settings.currency,
      color: editingAccount?.color || 'from-stone-700 to-stone-900',
    };

    if (editingAccount) {
      onUpdateBankAccount(accountRecord);
    } else {
      onAddBankAccount(accountRecord);
    }

    setEditingAccount(null);
    setIsAddAccountOpen(false);
    setAccName('');
    setBankName('');
    setAccNumberMasked('');
    setOpeningBalance(0);
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !targetBankId) return;

    const txRecord: BankTransaction = {
      id: editingTx ? editingTx.id : `btx-${Date.now()}`,
      bankAccountId: targetBankId,
      date: txDate,
      description: description.trim() || 'Bank Entry',
      type: txType,
      amount,
      category: txCategory,
      referenceId: editingTx?.referenceId,
      isReconciled: editingTx ? editingTx.isReconciled : false,
      notes,
    };

    if (editingTx) {
      onUpdateTransaction(txRecord);
    } else {
      onAddTransaction(txRecord);
    }

    setEditingTx(null);
    setIsAddTxOpen(false);
    setDescription('');
    setAmount(0);
    setNotes('');
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferAmount <= 0 || !transferFromId || !transferToId || transferFromId === transferToId) return;

    onTransferFunds(transferFromId, transferToId, transferAmount, transferNote);
    setIsTransferOpen(false);
    setTransferAmount(0);
  };

  // Find auto-match suggestions for unreconciled transactions
  const findMatchCandidate = (tx: BankTransaction) => {
    if (tx.isReconciled) return null;
    if (tx.type === 'credit') {
      return sales.find((s) => {
        const transferAmt = getSaleBankTransferAmount(s);
        return transferAmt > 0 && Math.abs(transferAmt - tx.amount) < 0.05;
      });
    } else {
      return purchases.find((p) => Math.abs(p.totalAmount - tx.amount) < 0.05);
    }
  };

  const handleImportScannedTransactions = (
    targetAccountId: string,
    scannedTxs: Omit<BankTransaction, 'id'>[],
    newBalance?: number
  ) => {
    const timestamp = Date.now();
    const newTxs: BankTransaction[] = scannedTxs.map((stx, idx) => ({
      ...stx,
      id: `btx-scan-${timestamp}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      bankAccountId: targetAccountId,
    }));

    if (onBatchAddTransactions) {
      onBatchAddTransactions(newTxs, targetAccountId, newBalance);
    } else {
      newTxs.forEach((newTx) => {
        onAddTransaction(newTx);
      });

      if (typeof newBalance === 'number' && targetAccountId) {
        const targetAcc = bankAccounts.find((a) => a.id === targetAccountId);
        if (targetAcc) {
          onUpdateBankAccount({
            ...targetAcc,
            currentBalance: newBalance,
          });
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-stone-200 no-print">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">
            Compare Shop Records with Bank Statement <span aria-hidden="true">·</span> Track Bank Deposits & Payments
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Bank Accounts & Balance Check
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setIsScanModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold hover:brightness-105 transition shadow-sm whitespace-nowrap min-h-[40px] cursor-pointer"
            title="Scan bank statement (.CSV file or multi-page photos/PDF) to auto-extract deposits & debits"
          >
            <Sparkles className="w-4 h-4 text-amber-200 shrink-0" />
            <span>Scan Bank Statement (.CSV or AI)</span>
          </button>

          <button
            onClick={openNewAccountModal}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5 text-stone-600 shrink-0" />
            <span>Add Bank Account</span>
          </button>

          {bankAccounts.length >= 2 && (
            <button
              onClick={() => setIsTransferOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap min-h-[40px]"
            >
              <Send className="w-3.5 h-3.5 text-stone-600 shrink-0" />
              <span>Move Money for Tax</span>
            </button>
          )}

          {bankAccounts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={openNewDepositModal}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition whitespace-nowrap min-h-[40px] shadow-sm cursor-pointer"
                title="Record money deposited into bank account (Sales Cash Deposit or Transfer)"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>+ Bank Deposit (ገቢ)</span>
              </button>

              <button
                onClick={openNewWithdrawModal}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-stone-800 text-white text-xs font-semibold hover:bg-stone-900 transition whitespace-nowrap min-h-[40px] shadow-sm cursor-pointer"
                title="Record money withdrawn from bank account (Cash Withdraw for shop)"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>− Cash Withdraw (ወጪ)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mode Switcher: Bank Balance Check vs Bank Activity List */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-stone-200/70 border border-stone-200 no-print">
        <button
          onClick={() => setSubTab('brs')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition ${
            subTab === 'brs'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-orange-700" />
          <span>Compare Bank vs Shop Records (BRS)</span>
        </button>

        <button
          onClick={() => setSubTab('feed')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition ${
            subTab === 'feed'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <ListFilter className="w-4 h-4 text-stone-600" />
          <span>Bank Deposits & Payments ({bankTransactions.length})</span>
        </button>
      </div>

      {bankAccounts.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white border border-stone-200 text-center space-y-3">
          <Landmark className="w-8 h-8 text-stone-400 mx-auto" />
          <p className="text-sm font-semibold text-stone-900">No Bank Accounts Added Yet</p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Add your business bank account (such as CBE or Awash Bank) to track your bank balance and compare it with your shop records.
          </p>
          <button
            onClick={openNewAccountModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Bank Account</span>
          </button>
        </div>
      ) : subTab === 'brs' ? (
        <BankReconciliationSheet
          bankAccounts={bankAccounts}
          reconcilingItems={reconcilingItems}
          brsStatements={brsStatements}
          settings={settings}
          onAddReconcilingItem={onAddReconcilingItem}
          onUpdateReconcilingItem={onUpdateReconcilingItem}
          onDeleteReconcilingItem={onDeleteReconcilingItem}
          onPostBookAdjustment={onPostBookAdjustment}
          onSaveBRSStatement={onSaveBRSStatement}
          onUpdateBRSStatement={onUpdateBRSStatement}
          onDeleteBRSStatement={onDeleteBRSStatement}
        />
      ) : (
        <>
          {/* Statement Quick Actions Banner */}
          <div className="p-3.5 rounded-xl bg-orange-50/80 border border-orange-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 no-print">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-700 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900">
                  Bank Statements &amp; Electronic Transaction Feed
                </p>
                <p className="text-[11px] text-stone-600">
                  {bankTransactions.length > 0
                    ? `${bankTransactions.length} transaction(s) recorded across ${bankAccounts.length} bank account(s).`
                    : 'Import bank statements via CSV or camera scans to reconcile with sales & purchases.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsScanModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-white border border-orange-300 text-orange-800 text-[11px] font-semibold hover:bg-orange-100 transition whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              Open Statement Scanner
            </button>
          </div>

          {/* Total Balance Card */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-stone-500">
                Total Money in All Bank Accounts
              </span>
              <p className="text-2xl sm:text-3xl font-bold text-stone-900 font-tabular tracking-tight mt-1">
                {formatCurrency(totalMonitoredBalance, settings.currencySymbol)}
              </p>
              <p className="text-xs text-stone-500 mt-1">
                {unreconciledCount === 0
                  ? 'All bank entries match your recorded sales and purchases'
                  : `${unreconciledCount} bank entries need to be checked`}
              </p>
            </div>

            <div className="text-left sm:text-right text-xs text-stone-500">
              <span className="font-semibold text-emerald-700 block">Bank Records Up to Date</span>
              <span>Shop Bank Accounts</span>
            </div>
          </div>

          {/* Account Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {bankAccounts.map((account) => {
              const isSelected = selectedAccountId === account.id;
              return (
                <div
                  key={account.id}
                  onClick={() => setSelectedAccountId(isSelected ? 'all' : account.id)}
                  className={`cursor-pointer p-4 rounded-2xl border transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-orange-50/50 border-orange-700'
                      : 'bg-white border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>
                        {account.type === 'tax_reserve'
                          ? 'Tax Savings Account'
                          : account.type === 'checking'
                          ? 'Main Business Account'
                          : 'Savings Account'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{account.accountNumberMasked}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditAccountModal(account);
                          }}
                          title="Edit bank account"
                          className="p-1 rounded text-stone-500 hover:text-orange-700 hover:bg-stone-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBankAccount(account.id);
                          }}
                          title="Delete bank account"
                          className="p-1 rounded text-stone-400 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-stone-900 mt-1.5 truncate">{account.name}</h4>
                    <p className="text-xs text-stone-500 truncate">{account.bankName}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-baseline justify-between">
                    <span className="text-base font-bold text-stone-900 font-tabular">
                      {formatCurrency(account.currentBalance, settings.currencySymbol)}
                    </span>
                    <span className="text-xs text-orange-700 font-semibold">
                      {isSelected ? 'Showing Only This' : 'Show Entries →'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reconciliation Filters */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-200/70 rounded-lg">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white text-stone-900 shadow-sm font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All Entries ({bankTransactions.length})
              </button>
              <button
                onClick={() => setFilterType('deposits')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  filterType === 'deposits'
                    ? 'bg-emerald-700 text-white shadow-sm font-bold'
                    : 'text-emerald-800 hover:bg-emerald-100/60'
                }`}
              >
                Bank Deposits (+) ({depositCount})
              </button>
              <button
                onClick={() => setFilterType('payments')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  filterType === 'payments'
                    ? 'bg-stone-900 text-white shadow-sm font-bold'
                    : 'text-stone-700 hover:bg-stone-300/60'
                }`}
              >
                Withdrawals &amp; Payments (−) ({paymentCount})
              </button>
              <button
                onClick={() => setFilterType('unreconciled')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  filterType === 'unreconciled'
                    ? 'bg-white text-stone-900 shadow-sm font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Needs Check ({unreconciledCount})
              </button>
              <button
                onClick={() => setFilterType('reconciled')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  filterType === 'reconciled'
                    ? 'bg-white text-stone-900 shadow-sm font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Checked &amp; Matched
              </button>
            </div>

            {selectedAccountId !== 'all' && (
              <button
                onClick={() => setSelectedAccountId('all')}
                className="text-xs text-orange-700 font-semibold hover:underline"
              >
                Show All Accounts ✕
              </button>
            )}
          </div>

          {/* Transaction Feed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium px-1">
              <span>{sortedTransactions.length} bank transactions</span>
              <span>Sorted: Most Recent First</span>
            </div>
            {sortedTransactions.length === 0 ? (
              <div className="p-10 rounded-2xl bg-white border border-stone-200 text-center space-y-3">
                <Landmark className="w-8 h-8 text-stone-400 mx-auto" />
                <p className="text-sm font-semibold text-stone-800">No Bank Entries Found</p>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Scan a paper or mobile bank statement with AI, or record a bank deposit or payment manually.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => setIsScanModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold hover:brightness-105 transition shadow-sm cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>Scan Bank Statement (AI)</span>
                  </button>
                  <button
                    onClick={openNewTxModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Manual Entry</span>
                  </button>
                </div>
              </div>
            ) : (
              sortedTransactions.map((tx) => {
                const isCredit = tx.type === 'credit';
                const matchedDoc = findMatchCandidate(tx);
                const account = bankAccounts.find((b) => b.id === tx.bankAccountId);

                return (
                  <div
                    key={tx.id}
                    className="p-4 rounded-2xl bg-white border border-stone-200 hover:border-stone-300 transition space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                          <span className="font-semibold text-stone-800">{account?.bankName || 'Bank'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(tx.date)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-stone-700 dark:text-stone-300">
                            {formatBankCategory(tx.category)}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-stone-900 mt-1">{tx.description}</h4>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-base font-bold font-tabular ${
                            isCredit ? 'text-emerald-700' : 'text-stone-900'
                          }`}
                        >
                          {isCredit ? '+' : '-'}{formatCurrency(tx.amount, settings.currencySymbol)}
                        </span>
                      </div>
                    </div>

                    {/* Audit Reconciliation Matcher & Edit/Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
                      <div className="flex-1 min-w-0">
                        {tx.isReconciled ? (
                          <span className="text-emerald-700 font-medium">
                            Checked & Matched <span aria-hidden="true">·</span> {tx.notes || 'Matches shop records'}
                          </span>
                        ) : matchedDoc ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-amber-800 font-medium">
                              Matches Receipt: {'receiptNumber' in matchedDoc ? matchedDoc.receiptNumber : matchedDoc.invoiceNumber}
                            </span>
                            <button
                              onClick={() => onReconcileTransaction(tx.id, matchedDoc.id)}
                              className="px-2.5 py-1 rounded-lg bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
                            >
                              Confirm Match
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-amber-800">
                              Not yet linked to a sale or purchase receipt
                            </span>
                            <button
                              onClick={() => onReconcileTransaction(tx.id)}
                              className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-xs transition"
                            >
                              Mark as Checked
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openEditTxModal(tx)}
                          title="Edit bank transaction"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 font-semibold transition"
                        >
                          <Pencil className="w-3.5 h-3.5 text-orange-700" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(tx.id)}
                          title="Delete bank transaction"
                          className="p-1.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Add / Edit Bank Account Modal */}
      <Modal
        isOpen={isAddAccountOpen}
        onClose={() => {
          setEditingAccount(null);
          setIsAddAccountOpen(false);
        }}
        title={editingAccount ? 'Edit Shop Bank Account' : 'Add Shop Bank Account'}
        subtitle="Enter your business bank account details and current balance"
      >
        <form onSubmit={handleSaveAccount} className="space-y-3.5">
          <div>
            <span className="text-xs text-stone-600">Account Label / Purpose *</span>
            <input
              type="text"
              required
              placeholder="e.g. Main Shop Account"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Bank Name *</span>
              <input
                type="text"
                required
                placeholder="e.g. Commercial Bank of Ethiopia (CBE)"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              />
            </div>

            <div>
              <span className="text-xs text-stone-600">Last 4 Digits of Account #</span>
              <input
                type="text"
                maxLength={4}
                placeholder="e.g. 4920"
                value={accNumberMasked}
                onChange={(e) => setAccNumberMasked(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">What is this account used for?</span>
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as BankAccount['type'])}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              >
                <option value="checking">Main Business Account (Daily Sales & Bills)</option>
                <option value="tax_reserve">Tax Savings Account (For 15% VAT)</option>
                <option value="savings">General Savings Account</option>
              </select>
            </div>

            <div>
              <span className="text-xs text-stone-600">Current Balance in Bank ({settings.currencySymbol})</span>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={openingBalance || ''}
                onChange={(e) => setOpeningBalance(parseFloat(e.target.value || '0'))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-bold text-stone-900 font-tabular"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
          >
            {editingAccount ? 'Update Bank Account' : 'Save Bank Account'}
          </button>
        </form>
      </Modal>

      {/* Add / Edit Bank Transaction Modal */}
      <Modal
        isOpen={isAddTxOpen}
        onClose={() => {
          setEditingTx(null);
          setIsAddTxOpen(false);
        }}
        title={editingTx ? 'Edit Bank Deposit or Payment' : 'Record Bank Deposit or Payment'}
        subtitle="Add money put into the bank or paid out from the bank"
      >
        <form onSubmit={handleSaveTransaction} className="space-y-3.5">
          <div>
            <span className="text-xs text-stone-600">Which Bank Account?</span>
            <select
              value={targetBankId}
              onChange={(e) => setTargetBankId(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            >
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.bankName} {acc.accountNumberMasked})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Money In or Money Out?</span>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTxType('credit');
                    if (txCategory === 'cash_withdraw') setTxCategory('sales_cash_deposit');
                  }}
                  className={`py-2 rounded-xl text-xs font-semibold transition ${
                    txType === 'credit'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-stone-50 text-stone-600 border border-stone-300'
                  }`}
                >
                  Money In (+)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxType('debit');
                    if (txCategory === 'sale_deposit' || txCategory === 'sales_cash_deposit') {
                      setTxCategory('cash_withdraw');
                    }
                  }}
                  className={`py-2 rounded-xl text-xs font-semibold transition ${
                    txType === 'debit'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-50 text-stone-600 border border-stone-300'
                  }`}
                >
                  Money Out (-)
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs text-stone-600">Date</span>
              <input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              />
            </div>
          </div>

          <div>
            <span className="text-xs text-stone-600">What is this bank entry for?</span>
            <input
              type="text"
              required
              placeholder="e.g. Sales cash deposited at CBE branch or cash withdrawal for shop"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Amount ({settings.currencySymbol})</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value || '0'))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular"
              />
            </div>

            <div>
              <span className="text-xs font-semibold text-stone-700">Reason / Category</span>
              <select
                value={txCategory}
                onChange={(e) => {
                  const val = e.target.value as BankTransaction['category'];
                  setTxCategory(val);
                  if (
                    val === 'cash_withdraw' ||
                    val === 'vendor_payout' ||
                    val === 'tax_payment' ||
                    val === 'bank_fee'
                  ) {
                    setTxType('debit');
                  } else if (
                    val === 'sales_cash_deposit' ||
                    val === 'sale_deposit' ||
                    val === 'card_settlement'
                  ) {
                    setTxType('credit');
                  }
                }}
                className="mt-1 w-full px-2.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-medium text-stone-900 focus:outline-none focus:border-orange-700"
              >
                <optgroup label="Bank Deposits (Money In · ገቢ)">
                  <option value="sales_cash_deposit">Sales Cash Deposit (የሽያጭ ጥሬ ገንዘብ ባንክ ገቢ)</option>
                  <option value="sale_deposit">Sales Transfer / Electronic Deposit (የሽያጭ ባንክ ዝውውር)</option>
                  <option value="card_settlement">Card / POS / Telebirr Settlement</option>
                  <option value="transfer">Account Transfer In</option>
                  <option value="other">Other Bank Deposit</option>
                </optgroup>
                <optgroup label="Bank Withdrawals & Payments (Money Out · ወጪ)">
                  <option value="cash_withdraw">Cash Withdraw (ጥሬ ገንዘብ ወጪ)</option>
                  <option value="vendor_payout">Paid to Supplier / Vendor</option>
                  <option value="tax_payment">Tax Paid to Government (15% VAT / Profit Tax)</option>
                  <option value="bank_fee">Bank Service Charge / Fee</option>
                  <option value="other">Other Withdrawal / Expense</option>
                </optgroup>
              </select>
            </div>
          </div>

          <div>
            <span className="text-xs text-stone-600">Bank Slip / Receipt Note (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Bank slip #881"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
          >
            {editingTx ? 'Update Bank Entry' : 'Save Bank Entry'}
          </button>
        </form>
      </Modal>

      {/* Move Money for Tax Modal */}
      <Modal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        title="Move Money to Tax Savings Account"
        subtitle="Set aside the 15% VAT collected from customers so it is ready on tax day"
      >
        <form onSubmit={handleExecuteTransfer} className="space-y-3.5">
          <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 text-xs">
            <span className="font-semibold text-stone-900 block">Helpful Shop Tip</span>
            <span className="text-xs text-stone-600">
              Moving the 15% VAT you collect into a separate account keeps you from accidentally spending tax money on daily shop bills.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">From Account</span>
              <select
                value={transferFromId}
                onChange={(e) => setTransferFromId(e.target.value)}
                className="mt-1 w-full px-2.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs text-stone-600">To Account</span>
              <select
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                className="mt-1 w-full px-2.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="text-xs text-stone-600">Amount to Move ({settings.currencySymbol})</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="e.g. 25000.00"
              value={transferAmount || ''}
              onChange={(e) => setTransferAmount(parseFloat(e.target.value || '0'))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular"
            />
          </div>

          <div>
            <span className="text-xs text-stone-600">Note</span>
            <input
              type="text"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
          >
            Save Transfer
          </button>
        </form>
      </Modal>

      {/* AI Bank Statement Scanner Modal */}
      <ScanBankStatementModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        bankAccounts={bankAccounts}
        settings={settings}
        onImportTransactions={handleImportScannedTransactions}
        onAddBankAccount={onAddBankAccount}
        onApplyBRSBalance={(balance) => {
          const targetAcc =
            bankAccounts.find((a) => a.id === selectedAccountId) || bankAccounts[0];
          if (targetAcc) {
            onUpdateBankAccount({
              ...targetAcc,
              currentBalance: balance,
            });
          }
        }}
      />
    </div>
  );
};
