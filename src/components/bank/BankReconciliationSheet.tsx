import React, { useState, useEffect } from 'react';
import {
  BankAccount,
  BankReconciliationStatement,
  ReconcilingItem,
  ReconcilingItemType,
  TaxSettings,
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Printer,
  Download,
  FileCheck,
  Trash2,
  Pencil,
} from 'lucide-react';

interface BankReconciliationSheetProps {
  bankAccounts: BankAccount[];
  reconcilingItems: ReconcilingItem[];
  brsStatements: BankReconciliationStatement[];
  settings: TaxSettings;
  onAddReconcilingItem: (item: ReconcilingItem) => void;
  onUpdateReconcilingItem: (item: ReconcilingItem) => void;
  onDeleteReconcilingItem: (id: string) => void;
  onPostBookAdjustment: (item: ReconcilingItem) => void;
  onSaveBRSStatement: (statement: BankReconciliationStatement) => void;
  onUpdateBRSStatement: (statement: BankReconciliationStatement) => void;
  onDeleteBRSStatement: (id: string) => void;
}

const RECONCILING_TYPE_LABELS: Record<
  ReconcilingItemType,
  { label: string; section: 'bank_add' | 'bank_less' | 'book_add' | 'book_less'; hint: string }
> = {
  deposit_in_transit: {
    label: 'Money Sent to Bank — Not Yet Shown on Bank Statement',
    section: 'bank_add',
    hint: 'Cash or cheque you deposited and recorded in the shop, but the bank statement has not shown it yet',
  },
  outstanding_cheque: {
    label: 'Cheque Given to Supplier — Not Yet Cashed at Bank',
    section: 'bank_less',
    hint: 'A cheque you wrote to a supplier that the supplier has not yet cashed from your bank account',
  },
  bank_error_adjustment: {
    label: 'Bank Mistake Correction',
    section: 'bank_add',
    hint: 'Correction for any mistake made by the bank on the statement',
  },
  unrecorded_bank_credit: {
    label: 'Direct Bank Deposit / Interest — Not Yet in Shop Book',
    section: 'book_add',
    hint: 'Money a customer sent directly to your bank (or bank interest) that you have not written in your shop book yet',
  },
  bank_service_charge: {
    label: 'Bank Service Fee / Transfer Charge',
    section: 'book_less',
    hint: 'Monthly bank fee, transfer charge, or commission taken by the bank on the statement',
  },
  nsf_dishonored_cheque: {
    label: 'Bounced Customer Cheque (No Money in Customer Account)',
    section: 'book_less',
    hint: 'A cheque from a customer that the bank returned unpaid',
  },
};

export const BankReconciliationSheet: React.FC<BankReconciliationSheetProps> = ({
  bankAccounts,
  reconcilingItems,
  brsStatements,
  settings,
  onAddReconcilingItem,
  onUpdateReconcilingItem,
  onDeleteReconcilingItem,
  onPostBookAdjustment,
  onSaveBRSStatement,
  onUpdateBRSStatement,
  onDeleteBRSStatement,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [selectedBankId, setSelectedBankId] = useState<string>(bankAccounts[0]?.id || 'acc-1');
  const [statementDate, setStatementDate] = useState<string>(today);
  const [preparedBy] = useState<string>('Solomon (General Manager)');

  const selectedAccount =
    bankAccounts.find((b) => b.id === selectedBankId) || bankAccounts[0];

  // Filter active (uncleared) reconciling items for the selected bank account
  const accountItems = reconcilingItems.filter(
    (item) => item.bankAccountId === selectedAccount?.id && !item.isCleared
  );

  // Categorize reconciling items (sorted by date recent to old)
  const depositsInTransit = accountItems
    .filter((i) => i.type === 'deposit_in_transit' || i.type === 'bank_error_adjustment')
    .sort((a, b) => b.date.localeCompare(a.date));
  const outstandingCheques = accountItems
    .filter((i) => i.type === 'outstanding_cheque')
    .sort((a, b) => b.date.localeCompare(a.date));
  const unrecordedCredits = accountItems
    .filter((i) => i.type === 'unrecorded_bank_credit')
    .sort((a, b) => b.date.localeCompare(a.date));
  const bankChargesAndNSF = accountItems
    .filter((i) => i.type === 'bank_service_charge' || i.type === 'nsf_dishonored_cheque')
    .sort((a, b) => b.date.localeCompare(a.date));

  // Totals
  const depositsInTransitTotal = depositsInTransit.reduce((sum, i) => sum + i.amount, 0);
  const outstandingChequesTotal = outstandingCheques.reduce((sum, i) => sum + i.amount, 0);
  const unrecordedCreditsTotal = unrecordedCredits.reduce((sum, i) => sum + i.amount, 0);
  const bankChargesTotal = bankChargesAndNSF.reduce((sum, i) => sum + i.amount, 0);

  // Unadjusted Book Balance comes directly from the account's current book balance
  const unadjustedBookBalance = selectedAccount ? selectedAccount.currentBalance : 0;

  // Adjusted Book Balance = Unadjusted Book Balance + Unrecorded Credits - Bank Charges
  const adjustedBookBalance =
    unadjustedBookBalance + unrecordedCreditsTotal - bankChargesTotal;

  // Expected Bank Statement Balance that yields 0 variance:
  const expectedBankStatementBalance =
    adjustedBookBalance - depositsInTransitTotal + outstandingChequesTotal;

  const [bankStatementBalanceInput, setBankStatementBalanceInput] = useState<number>(
    expectedBankStatementBalance
  );

  // Keep default statement balance synced when switching accounts
  useEffect(() => {
    setBankStatementBalanceInput(
      unadjustedBookBalance +
        unrecordedCreditsTotal -
        bankChargesTotal -
        depositsInTransitTotal +
        outstandingChequesTotal
    );
  }, [
    selectedBankId,
    unadjustedBookBalance,
    unrecordedCreditsTotal,
    bankChargesTotal,
    depositsInTransitTotal,
    outstandingChequesTotal,
  ]);

  // Adjusted Bank Balance = Balance per Bank Statement + Deposits in Transit - Outstanding Cheques
  const adjustedBankBalance =
    bankStatementBalanceInput + depositsInTransitTotal - outstandingChequesTotal;

  // Variance between Adjusted Bank Balance and Adjusted Book Balance
  const variance = adjustedBankBalance - adjustedBookBalance;
  const isReconciled = Math.abs(variance) < 0.05;

  // Modal state for adding / editing a reconciling item
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ReconcilingItem | null>(null);
  const [newItemType, setNewItemType] = useState<ReconcilingItemType>('deposit_in_transit');
  const [newItemDate, setNewItemDate] = useState(today);
  const [newItemRef, setNewItemRef] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState<number>(0);
  const [newItemNotes, setNewItemNotes] = useState('');

  // Modal state for editing a saved BRS statement
  const [editingStmt, setEditingStmt] = useState<BankReconciliationStatement | null>(null);
  const [editStmtNumber, setEditStmtNumber] = useState('');
  const [editStmtDate, setEditStmtDate] = useState(today);
  const [editStmtBankBalance, setEditStmtBankBalance] = useState<number>(0);
  const [editStmtPreparedBy, setEditStmtPreparedBy] = useState('');
  const [editStmtNotes, setEditStmtNotes] = useState('');

  const openQuickAdd = (type: ReconcilingItemType) => {
    setEditingItem(null);
    setNewItemType(type);
    const prefix =
      type === 'deposit_in_transit'
        ? 'DEP-'
        : type === 'outstanding_cheque'
        ? 'CHQ-'
        : type === 'unrecorded_bank_credit'
        ? 'CR-'
        : 'FEE-';
    setNewItemRef(`${prefix}${Math.floor(1000 + Math.random() * 9000)}`);
    setNewItemDate(today);
    setNewItemDesc('');
    setNewItemAmount(0);
    setNewItemNotes('');
    setIsAddModalOpen(true);
  };

  const openEditItemModal = (item: ReconcilingItem) => {
    setEditingItem(item);
    setNewItemType(item.type);
    setNewItemRef(item.referenceNumber);
    setNewItemDate(item.date);
    setNewItemDesc(item.partyOrDescription);
    setNewItemAmount(item.amount);
    setNewItemNotes(item.notes || '');
    setIsAddModalOpen(true);
  };

  const handleAddItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemAmount <= 0 || !selectedAccount) return;

    const item: ReconcilingItem = {
      id: editingItem ? editingItem.id : `rec-${Date.now()}`,
      bankAccountId: editingItem ? editingItem.bankAccountId : selectedAccount.id,
      date: newItemDate,
      type: newItemType,
      referenceNumber: newItemRef.trim() || `REF-${Date.now().toString().slice(-4)}`,
      partyOrDescription: newItemDesc.trim() || RECONCILING_TYPE_LABELS[newItemType].label,
      amount: newItemAmount,
      isCleared: editingItem ? editingItem.isCleared : false,
      notes: newItemNotes.trim() || undefined,
    };

    if (editingItem) {
      onUpdateReconcilingItem(item);
    } else {
      onAddReconcilingItem(item);
    }
    setEditingItem(null);
    setIsAddModalOpen(false);
  };

  const openEditStatementModal = (stmt: BankReconciliationStatement) => {
    setEditingStmt(stmt);
    setEditStmtNumber(stmt.statementNumber);
    setEditStmtDate(stmt.statementDate);
    setEditStmtBankBalance(stmt.balancePerBankStatement);
    setEditStmtPreparedBy(stmt.preparedBy);
    setEditStmtNotes(stmt.notes || '');
  };

  const handleUpdateStatementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStmt) return;

    const nextAdjustedBankBalance =
      editStmtBankBalance + editingStmt.depositsInTransitTotal - editingStmt.outstandingChequesTotal;
    const nextVariance = nextAdjustedBankBalance - editingStmt.adjustedBookBalance;
    const nextIsReconciled = Math.abs(nextVariance) < 0.05;

    const updatedStmt: BankReconciliationStatement = {
      ...editingStmt,
      statementNumber: editStmtNumber.trim() || editingStmt.statementNumber,
      statementDate: editStmtDate,
      periodStart: `${editStmtDate.slice(0, 8)}01`,
      periodEnd: editStmtDate,
      balancePerBankStatement: editStmtBankBalance,
      adjustedBankBalance: nextAdjustedBankBalance,
      variance: nextVariance,
      status: nextIsReconciled ? 'reconciled' : 'discrepancy',
      preparedBy: editStmtPreparedBy.trim() || editingStmt.preparedBy,
      notes: editStmtNotes.trim() || undefined,
    };

    onUpdateBRSStatement(updatedStmt);
    setEditingStmt(null);
  };

  const handleCertifyStatement = () => {
    if (!selectedAccount) return;
    const bankCode = selectedAccount.bankName.includes('CBE')
      ? 'CBE'
      : selectedAccount.bankName.includes('Awash')
      ? 'AWASH'
      : 'BANK';

    const newStatement: BankReconciliationStatement = {
      id: `brs-${Date.now()}`,
      statementNumber: `BRS-${statementDate.slice(0, 7)}-${bankCode}-${Math.floor(10 + Math.random() * 89)}`,
      bankAccountId: selectedAccount.id,
      statementDate,
      periodStart: `${statementDate.slice(0, 8)}01`,
      periodEnd: statementDate,
      balancePerBankStatement: bankStatementBalanceInput,
      unadjustedBookBalance,
      depositsInTransitTotal,
      outstandingChequesTotal,
      unrecordedCreditsTotal,
      bankChargesTotal,
      adjustedBankBalance,
      adjustedBookBalance,
      variance,
      status: isReconciled ? 'reconciled' : 'discrepancy',
      preparedBy,
      certifiedAt: new Date().toISOString().split('T')[0],
      notes: isReconciled
        ? 'Certified zero-variance Bank Reconciliation Statement for tax audit.'
        : `Flagged variance of ${formatCurrency(variance, settings.currencySymbol)} pending investigation.`,
    };

    onSaveBRSStatement(newStatement);
  };

  const handleExportBRSCSV = () => {
    if (!selectedAccount) return;
    let csv = `OFFICIAL BANK RECONCILIATION STATEMENT (BRS)\n`;
    csv += `Business Entity,"${settings.businessName}"\n`;
    csv += `Tax ID (TIN),${settings.taxIdNumber}\n`;
    csv += `Bank Account,"${selectedAccount.name} (${selectedAccount.bankName} ${selectedAccount.accountNumberMasked})"\n`;
    csv += `Statement Date,${statementDate}\n`;
    csv += `Prepared By,"${preparedBy}"\n\n`;

    csv += `PART I: BALANCE PER BANK STATEMENT,${settings.currency}\n`;
    csv += `Ending Balance per Official Bank Statement,${bankStatementBalanceInput.toFixed(2)}\n`;
    csv += `ADD: DEPOSITS IN TRANSIT (UNCREDITED DEPOSITS)\n`;
    depositsInTransit.forEach((d) => {
      csv += `  ${d.date} - ${d.referenceNumber} (${d.partyOrDescription}),${d.amount.toFixed(2)}\n`;
    });
    csv += `Total Deposits in Transit,${depositsInTransitTotal.toFixed(2)}\n`;

    csv += `LESS: OUTSTANDING CHEQUES (UNPRESENTED CHEQUES)\n`;
    outstandingCheques.forEach((c) => {
      csv += `  ${c.date} - ${c.referenceNumber} (${c.partyOrDescription}),-${c.amount.toFixed(2)}\n`;
    });
    csv += `Total Outstanding Cheques,-${outstandingChequesTotal.toFixed(2)}\n`;
    csv += `ADJUSTED BANK BALANCE (TRUE CASH),${adjustedBankBalance.toFixed(2)}\n\n`;

    csv += `PART II: BALANCE PER COMPANY BOOKS (CASH BOOK LEDGER),${settings.currency}\n`;
    csv += `Unadjusted Balance per Company Books,${unadjustedBookBalance.toFixed(2)}\n`;
    csv += `ADD: UNRECORDED BANK CREDITS (DIRECT COLLECTIONS / INTEREST)\n`;
    unrecordedCredits.forEach((cr) => {
      csv += `  ${cr.date} - ${cr.referenceNumber} (${cr.partyOrDescription}),${cr.amount.toFixed(2)}\n`;
    });
    csv += `Total Unrecorded Bank Credits,${unrecordedCreditsTotal.toFixed(2)}\n`;

    csv += `LESS: UNRECORDED BANK SERVICE CHARGES & NSF ITEMS\n`;
    bankChargesAndNSF.forEach((ch) => {
      csv += `  ${ch.date} - ${ch.referenceNumber} (${ch.partyOrDescription}),-${ch.amount.toFixed(2)}\n`;
    });
    csv += `Total Unrecorded Bank Charges,-${bankChargesTotal.toFixed(2)}\n`;
    csv += `ADJUSTED BOOK BALANCE (TRUE CASH),${adjustedBookBalance.toFixed(2)}\n\n`;

    csv += `RECONCILIATION VARIANCE,${variance.toFixed(2)}\n`;
    csv += `AUDIT STATUS,${isReconciled ? 'RECONCILED (ZERO VARIANCE)' : 'UNRECONCILED VARIANCE'}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Bank_Reconciliation_Statement_${selectedAccount.bankName.replace(/\s+/g, '_')}_${statementDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <span className="text-xs text-stone-500">
            Step-by-Step Bank vs Shop Balance Check
          </span>
          <h3 className="text-base font-bold text-stone-900">
            Bank Balance Check Sheet (BRS)
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openQuickAdd('deposit_in_transit')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition"
          >
            <Plus className="w-3.5 h-3.5 text-orange-700" />
            <span>Add Missing / Pending Item</span>
          </button>

          <button
            onClick={handleExportBRSCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition"
          >
            <Download className="w-3.5 h-3.5 text-stone-600" />
            <span>Download</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Account & Date Selector */}
      <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-600 font-medium block mb-1">
              1. Choose Bank Account
            </label>
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-semibold text-stone-900 focus:outline-none focus:border-orange-700"
            >
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.bankName} — {acc.accountNumberMasked} ({formatCurrency(acc.currentBalance, settings.currencySymbol)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-600 font-medium block mb-1">
                2. Bank Statement Date
              </label>
              <input
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-stone-600 font-medium block mb-1">
                3. Ending Balance on Bank Paper
              </label>
              <input
                type="number"
                step="0.01"
                value={bankStatementBalanceInput}
                onChange={(e) => setBankStatementBalanceInput(parseFloat(e.target.value || '0'))}
                className="w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-bold text-stone-900 font-tabular focus:outline-none focus:border-orange-700"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reconciliation Status Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-center justify-between ${
          isReconciled
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-3">
          {isReconciled ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
          )}
          <div>
            <span className="text-xs font-bold block">
              {isReconciled
                ? 'Balances Match! Bank Statement Matches Your Shop Records'
                : 'Balances Do Not Match Yet'}
            </span>
            <span className="text-xs opacity-90">
              {isReconciled
                ? `Confirmed Bank Balance: ${formatCurrency(adjustedBankBalance, settings.currencySymbol)}`
                : `Difference of ${formatCurrency(variance, settings.currencySymbol)} between Bank and Shop Book`}
            </span>
          </div>
        </div>

        {!isReconciled ? (
          <button
            onClick={() => setBankStatementBalanceInput(expectedBankStatementBalance)}
            className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold text-xs hover:bg-amber-800 transition shrink-0 no-print"
          >
            Match Balance
          </button>
        ) : (
          <span className="text-xs font-bold font-tabular text-emerald-800">
            Difference: {formatCurrency(0, settings.currencySymbol)}
          </span>
        )}
      </div>

      {/* Formal Statement Sheet */}
      <div className="rounded-2xl bg-white border border-stone-200 overflow-hidden shadow-sm">
        {/* Formal Statement Header */}
        <div className="p-5 bg-stone-50 border-b border-stone-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold uppercase tracking-tight text-stone-900">
                {settings.businessName}
              </h2>
              <p className="text-xs font-semibold text-orange-700 mt-0.5">
                BANK BALANCE CHECK (RECONCILIATION STATEMENT)
              </p>
              <p className="text-xs text-stone-600 mt-1">
                Bank: <strong className="text-stone-900">{selectedAccount?.bankName}</strong> ({selectedAccount?.name} {selectedAccount?.accountNumberMasked})
              </p>
            </div>

            <div className="text-right text-xs text-stone-600">
              <p className="font-mono font-bold text-stone-900">
                TIN: {settings.taxIdNumber}
              </p>
              <p className="mt-0.5">Date: <strong>{formatDate(statementDate)}</strong></p>
              <p>Currency: <strong>{settings.currency}</strong></p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6 text-xs">
          {/* PART 1: BALANCE PER BANK STATEMENT */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <span className="font-bold uppercase tracking-wider text-stone-800">
                Part 1 — Starting from Your Bank Statement Paper
              </span>
              <span className="text-xs text-stone-500">Bank Side</span>
            </div>

            {/* Ending Balance per Bank Statement */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-900">
              <span>Ending Balance Shown on Bank Statement ({formatDate(statementDate)})</span>
              <span className="font-tabular text-sm">
                {formatCurrency(bankStatementBalanceInput, settings.currencySymbol)}
              </span>
            </div>

            {/* ADD: Deposits in Transit */}
            <div className="pl-2 space-y-2">
              <div className="flex items-center justify-between text-emerald-800 font-semibold">
                <span>Plus (+): Money You Sent to Bank (Not Yet Shown on Statement)</span>
                <button
                  onClick={() => openQuickAdd('deposit_in_transit')}
                  className="text-xs underline hover:text-emerald-900 no-print"
                >
                  + Add Pending Deposit
                </button>
              </div>

              {depositsInTransit.length === 0 ? (
                <p className="text-xs text-stone-500 italic pl-2">
                  None — All deposits you made are already shown on the bank statement.
                </p>
              ) : (
                depositsInTransit.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50/70 border border-stone-200/80 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-stone-900 mr-2">
                        {item.referenceNumber}
                      </span>
                      <span className="text-stone-700">
                        {item.partyOrDescription}
                      </span>
                      <span className="text-stone-500 ml-1.5">({formatDate(item.date)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-tabular font-semibold text-emerald-700">
                        +{formatCurrency(item.amount, settings.currencySymbol)}
                      </span>
                      <button
                        onClick={() => openEditItemModal(item)}
                        title="Edit item"
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold no-print"
                      >
                        <Pencil className="w-3 h-3 text-orange-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteReconcilingItem(item.id)}
                        title="Remove"
                        className="text-stone-400 hover:text-red-700 no-print"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="flex justify-between text-xs text-stone-600 pt-1 pr-2">
                <span>Total Pending Deposits:</span>
                <span className="font-tabular font-semibold text-emerald-700">
                  +{formatCurrency(depositsInTransitTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>

            {/* LESS: Outstanding Cheques */}
            <div className="pl-2 space-y-2 pt-1">
              <div className="flex items-center justify-between text-red-800 font-semibold">
                <span>Minus (−): Cheques Given to Suppliers (Not Yet Cashed at Bank)</span>
                <button
                  onClick={() => openQuickAdd('outstanding_cheque')}
                  className="text-xs underline hover:text-red-900 no-print"
                >
                  + Add Uncashed Cheque
                </button>
              </div>

              {outstandingCheques.length === 0 ? (
                <p className="text-xs text-stone-500 italic pl-2">
                  None — All cheques given to suppliers have already been cashed.
                </p>
              ) : (
                outstandingCheques.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50/70 border border-stone-200/80 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-stone-900 mr-2">
                        {item.referenceNumber}
                      </span>
                      <span className="text-stone-700">
                        {item.partyOrDescription}
                      </span>
                      <span className="text-stone-500 ml-1.5">({formatDate(item.date)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-tabular font-semibold text-red-700">
                        -{formatCurrency(item.amount, settings.currencySymbol)}
                      </span>
                      <button
                        onClick={() => openEditItemModal(item)}
                        title="Edit item"
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold no-print"
                      >
                        <Pencil className="w-3 h-3 text-orange-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteReconcilingItem(item.id)}
                        title="Remove"
                        className="text-stone-400 hover:text-red-700 no-print"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="flex justify-between text-xs text-stone-600 pt-1 pr-2">
                <span>Total Uncashed Cheques:</span>
                <span className="font-tabular font-semibold text-red-700">
                  -{formatCurrency(outstandingChequesTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>

            {/* Adjusted Bank Balance Line */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-100 border border-stone-300 font-bold text-stone-900">
              <span>TRUE BANK BALANCE (After Pending Items)</span>
              <span className="font-tabular text-sm text-stone-900">
                {formatCurrency(adjustedBankBalance, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* PART 2: BALANCE PER COMPANY BOOKS */}
          <div className="space-y-3 pt-4 border-t border-stone-200">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <span className="font-bold uppercase tracking-wider text-stone-800">
                Part 2 — Starting from Your Shop App Records
              </span>
              <span className="text-xs text-stone-500">Shop Book Side</span>
            </div>

            {/* Unadjusted Book Balance */}
            <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-900">
              <span>Balance Currently Recorded in This App</span>
              <span className="font-tabular text-sm">
                {formatCurrency(unadjustedBookBalance, settings.currencySymbol)}
              </span>
            </div>

            {/* ADD: Unrecorded Bank Credits */}
            <div className="pl-2 space-y-2">
              <div className="flex items-center justify-between text-emerald-800 font-semibold">
                <span>Plus (+): Direct Bank Deposits or Interest Not Yet Entered in App</span>
                <button
                  onClick={() => openQuickAdd('unrecorded_bank_credit')}
                  className="text-xs underline hover:text-emerald-900 no-print"
                >
                  + Add Direct Bank Deposit
                </button>
              </div>

              {unrecordedCredits.length === 0 ? (
                <p className="text-xs text-stone-500 italic pl-2">
                  None — All money received in the bank is already recorded in the app.
                </p>
              ) : (
                unrecordedCredits.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50/70 border border-stone-200/80 text-xs"
                  >
                    <div className="pr-2">
                      <span className="font-mono font-bold text-stone-900 mr-2">
                        {item.referenceNumber}
                      </span>
                      <span className="text-stone-700">
                        {item.partyOrDescription}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-tabular font-semibold text-emerald-700">
                        +{formatCurrency(item.amount, settings.currencySymbol)}
                      </span>
                      <button
                        onClick={() => onPostBookAdjustment(item)}
                        title="Save permanently to shop bank records"
                        className="px-2.5 py-1 rounded bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition no-print"
                      >
                        Save to App
                      </button>
                      <button
                        onClick={() => openEditItemModal(item)}
                        title="Edit item"
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold no-print"
                      >
                        <Pencil className="w-3 h-3 text-orange-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteReconcilingItem(item.id)}
                        className="text-stone-400 hover:text-red-700 no-print"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="flex justify-between text-xs text-stone-600 pt-1 pr-2">
                <span>Total Unrecorded Bank Deposits:</span>
                <span className="font-tabular font-semibold text-emerald-700">
                  +{formatCurrency(unrecordedCreditsTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>

            {/* LESS: Unrecorded Bank Charges & NSF */}
            <div className="pl-2 space-y-2 pt-1">
              <div className="flex items-center justify-between text-red-800 font-semibold">
                <span>Minus (−): Bank Fees, Service Charges & Bounced Cheques</span>
                <button
                  onClick={() => openQuickAdd('bank_service_charge')}
                  className="text-xs underline hover:text-red-900 no-print"
                >
                  + Add Bank Fee
                </button>
              </div>

              {bankChargesAndNSF.length === 0 ? (
                <p className="text-xs text-stone-500 italic pl-2">
                  None — All bank fees and service charges are already recorded.
                </p>
              ) : (
                bankChargesAndNSF.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50/70 border border-stone-200/80 text-xs"
                  >
                    <div className="pr-2">
                      <span className="font-mono font-bold text-stone-900 mr-2">
                        {item.referenceNumber}
                      </span>
                      <span className="text-stone-700">
                        {item.partyOrDescription}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-tabular font-semibold text-red-700">
                        -{formatCurrency(item.amount, settings.currencySymbol)}
                      </span>
                      <button
                        onClick={() => onPostBookAdjustment(item)}
                        title="Save fee permanently to shop bank records"
                        className="px-2.5 py-1 rounded bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition no-print"
                      >
                        Save to App
                      </button>
                      <button
                        onClick={() => openEditItemModal(item)}
                        title="Edit item"
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold no-print"
                      >
                        <Pencil className="w-3 h-3 text-orange-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteReconcilingItem(item.id)}
                        className="text-stone-400 hover:text-red-700 no-print"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="flex justify-between text-xs text-stone-600 pt-1 pr-2">
                <span>Total Bank Fees & Bounced Cheques:</span>
                <span className="font-tabular font-semibold text-red-700">
                  -{formatCurrency(bankChargesTotal, settings.currencySymbol)}
                </span>
              </div>
            </div>

            {/* Adjusted Book Balance Line */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-100 border border-stone-300 font-bold text-stone-900">
              <span>TRUE SHOP BOOK BALANCE (After Bank Fees & Direct Deposits)</span>
              <span className="font-tabular text-sm text-stone-900">
                {formatCurrency(adjustedBookBalance, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Certify & Sign-off Footer */}
          <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-stone-600">
              <span>Checked By: </span>
              <strong className="text-stone-900">{preparedBy}</strong>
              <span className="block text-xs text-stone-500 mt-0.5">
                Ready for Ethiopian Ministry of Revenues Tax Check
              </span>
            </div>

            <button
              onClick={handleCertifyStatement}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition no-print"
            >
              <FileCheck className="w-4 h-4" />
              <span>Save Completed Balance Check</span>
            </button>
          </div>
        </div>
      </div>

      {/* Certified BRS Archive List */}
      {brsStatements.length > 0 && (
        <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-3 no-print">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">
              Saved Bank Balance Checks ({brsStatements.length})
            </h4>
            <span className="text-xs text-stone-500 font-medium">Sorted: Recent to Old</span>
          </div>

          <div className="divide-y divide-stone-100">
            {[...brsStatements]
              .sort((a, b) => b.statementDate.localeCompare(a.statementDate))
              .map((stmt) => {
              const acc = bankAccounts.find((b) => b.id === stmt.bankAccountId);
              return (
                <div
                  key={stmt.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-stone-900">
                        {stmt.statementNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-stone-700">{acc?.bankName || 'Bank Account'}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Date: {formatDate(stmt.statementDate)} <span aria-hidden="true">·</span> Checked by {stmt.preparedBy}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-right">
                      <span className="font-bold text-stone-900 font-tabular block">
                        {formatCurrency(stmt.adjustedBankBalance, settings.currencySymbol)}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          stmt.status === 'reconciled' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {stmt.status === 'reconciled' ? 'Balanced' : 'Has Difference'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditStatementModal(stmt)}
                        title="Edit saved balance check"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 font-semibold transition"
                      >
                        <Pencil className="w-3.5 h-3.5 text-orange-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteBRSStatement(stmt.id)}
                        title="Delete saved balance check"
                        className="p-1.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Reconciling Item Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setEditingItem(null);
          setIsAddModalOpen(false);
        }}
        title={editingItem ? 'Edit Missing or Pending Bank Item' : 'Add Missing or Pending Bank Item'}
        subtitle="Record a deposit, cheque, or bank fee that explains the difference"
      >
        <form onSubmit={handleAddItemSubmit} className="space-y-3.5">
          <div>
            <span className="text-xs text-stone-600">What kind of item is this?</span>
            <select
              value={newItemType}
              onChange={(e) => setNewItemType(e.target.value as ReconcilingItemType)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            >
              {Object.entries(RECONCILING_TYPE_LABELS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">
              {RECONCILING_TYPE_LABELS[newItemType].hint}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Cheque or Slip Number *</span>
              <input
                type="text"
                required
                value={newItemRef}
                onChange={(e) => setNewItemRef(e.target.value)}
                placeholder="e.g. CHQ-004820"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono font-bold text-stone-900"
              />
            </div>

            <div>
              <span className="text-xs text-stone-600">Date *</span>
              <input
                type="date"
                required
                value={newItemDate}
                onChange={(e) => setNewItemDate(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              />
            </div>
          </div>

          <div>
            <span className="text-xs text-stone-600">Who Paid / Short Description *</span>
            <input
              type="text"
              required
              value={newItemDesc}
              onChange={(e) => setNewItemDesc(e.target.value)}
              placeholder="e.g. Mugher Cement Factory or Evening Deposit"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <div>
            <span className="text-xs text-stone-600">Amount ({settings.currencySymbol}) *</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={newItemAmount || ''}
              onChange={(e) => setNewItemAmount(parseFloat(e.target.value || '0'))}
              placeholder="0.00"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular"
            />
          </div>

          <div>
            <span className="text-xs text-stone-600">Note (Optional)</span>
            <input
              type="text"
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              placeholder="e.g. Verified on statement"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
          >
            {editingItem ? 'Update Item' : 'Add Item to Balance Check'}
          </button>
        </form>
      </Modal>

      {/* Edit Saved BRS Statement Modal */}
      <Modal
        isOpen={!!editingStmt}
        onClose={() => setEditingStmt(null)}
        title="Edit Saved Bank Balance Check"
        subtitle="Update statement number, date, ending bank balance, or notes"
      >
        <form onSubmit={handleUpdateStatementSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Statement Ref # *</span>
              <input
                type="text"
                required
                value={editStmtNumber}
                onChange={(e) => setEditStmtNumber(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono font-bold text-stone-900"
              />
            </div>

            <div>
              <span className="text-xs text-stone-600">Statement Date *</span>
              <input
                type="date"
                required
                value={editStmtDate}
                onChange={(e) => setEditStmtDate(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              />
            </div>
          </div>

          <div>
            <span className="text-xs text-stone-600">
              Ending Balance Shown on Bank Statement ({settings.currencySymbol}) *
            </span>
            <input
              type="number"
              step="0.01"
              required
              value={editStmtBankBalance}
              onChange={(e) => setEditStmtBankBalance(parseFloat(e.target.value || '0'))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular"
            />
          </div>

          <div>
            <span className="text-xs text-stone-600">Checked By *</span>
            <input
              type="text"
              required
              value={editStmtPreparedBy}
              onChange={(e) => setEditStmtPreparedBy(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <div>
            <span className="text-xs text-stone-600">Notes (Optional)</span>
            <input
              type="text"
              value={editStmtNotes}
              onChange={(e) => setEditStmtNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
          >
            Update Saved Balance Check
          </button>
        </form>
      </Modal>
    </div>
  );
};
