import React from 'react';
import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  DailyRegisterClose,
  TaxSettings,
} from '../../types';
import {
  formatCurrency,
  calculateAuditReadiness,
  formatRelativeDate,
  getSaleCashAmount,
  getSaleBankTransferAmount,
} from '../../utils/formatters';
import { getTodayLocalDateString } from '../../utils/dateUtils';
import {
  Plus,
  ArrowUpRight,
  AlertTriangle,
  ChevronRight,
  Download,
  Pencil,
  Camera,
  FileSpreadsheet,
  RefreshCw,
  ArrowDownToLine,
} from 'lucide-react';
import { ActiveTab } from '../layout/BottomNav';

interface OverviewDashboardProps {
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  dailyCloses: DailyRegisterClose[];
  settings: TaxSettings;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenAddSale: () => void;
  onOpenAddPurchase: () => void;
  onOpenDailyClose: () => void;
  onEditSale?: (sale: SaleTransaction) => void;
  onEditPurchase?: (purchase: PurchaseItem) => void;
  onOpenHelp?: () => void;
  onQuickExport?: () => void;
  onOpenGoogleSheets?: () => void;
  onOpenPopulateGoogleSheets?: () => void;
  autoSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  lastAutoSyncTime?: string | null;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  sales,
  purchases,
  bankAccounts,
  bankTransactions,
  dailyCloses,
  settings,
  setActiveTab,
  onOpenAddSale,
  onOpenAddPurchase,
  onOpenDailyClose,
  onEditSale,
  onEditPurchase,
  onOpenHelp,
  onQuickExport,
  onOpenGoogleSheets,
  onOpenPopulateGoogleSheets,
  autoSyncStatus = 'idle',
  lastAutoSyncTime,
}) => {
  const today = getTodayLocalDateString();

  // Daily Sales calculations
  const todaySales = sales.filter((s) => s.date === today);
  const todaySalesTotal = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);
  const todayTaxCollected = todaySales.reduce((acc, s) => acc + s.taxAmount, 0);
  const todayCashSales = todaySales.reduce(
    (acc, s) => acc + getSaleCashAmount(s),
    0
  );
  const todayCardBankSales = todaySales.reduce(
    (acc, s) => acc + getSaleBankTransferAmount(s),
    0
  );

  // Purchases calculations
  const allPurchasesTotal = purchases.reduce((acc, p) => acc + p.totalAmount, 0);
  const allDeductiblePurchases = purchases.reduce(
    (acc, p) => acc + p.subtotal * (p.deductiblePercentage / 100),
    0
  );
  const allInputTaxCredits = purchases.reduce((acc, p) => acc + p.taxAmount, 0);

  // Bank Balances
  const totalBankBalance = bankAccounts.reduce((acc, b) => acc + b.currentBalance, 0);
  const taxReserveAcc = bankAccounts.find((b) => b.type === 'tax_reserve');
  const taxReserveBalance = taxReserveAcc ? taxReserveAcc.currentBalance : 0;
  const unreconciledBankTx = bankTransactions.filter((tx) => !tx.isReconciled);

  // Audit Readiness
  const auditReport = calculateAuditReadiness(sales, purchases, bankAccounts, bankTransactions);

  // Today's closing status
  const todayClose = dailyCloses.find((c) => c.date === today);

  return (
    <div className="space-y-6">
      {/* Workspace Header & Primary Actions */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-stone-200">
        <div className="min-w-0">
          <p className="text-xs text-stone-500 leading-relaxed">
            TIN: <strong className="font-mono text-stone-800">{settings.taxIdNumber}</strong> <span aria-hidden="true">·</span> Currency: {settings.currency} <span aria-hidden="true">·</span> 15% VAT
          </p>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-stone-900 tracking-tight mt-1">
            Shop Sales, Purchases &amp; Tax Summary
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {todaySales.length > 0 && onEditSale ? (
            <button
              onClick={() => onEditSale(todaySales[0])}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition whitespace-nowrap min-h-[40px]"
            >
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              <span>Edit Today&apos;s Daily Sales</span>
            </button>
          ) : (
            <button
              onClick={onOpenAddSale}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Record Daily Sales</span>
            </button>
          )}

          <button
            onClick={onOpenAddPurchase}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Purchase / Expense</span>
          </button>

          <button
            onClick={onOpenDailyClose}
            className="px-3.5 py-2.5 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap min-h-[40px]"
          >
            {todayClose ? 'Daily Cash Counted' : 'End-of-Day Cash Count'}
          </button>

          {onQuickExport && (
            <button
              onClick={onQuickExport}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-stone-300 text-stone-700 text-xs font-medium hover:bg-stone-100 transition whitespace-nowrap min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Download Report</span>
            </button>
          )}
        </div>
      </div>

      {/* 3 Core Financial Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1: Total Daily Sales */}
        <div
          onClick={() => setActiveTab('sales')}
          className="cursor-pointer rounded-2xl bg-white border border-stone-200 p-5 hover:border-stone-400 transition flex flex-col justify-between shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold text-stone-700">01. Today&apos;s Daily Sales</span>
              <ArrowUpRight className="w-4 h-4 text-stone-400" />
            </div>

            <p className="text-2xl font-bold text-stone-900 font-tabular tracking-tight mt-2">
              {formatCurrency(todaySalesTotal, settings.currencySymbol)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {todaySales.length > 0 ? (
                <>
                  <span className="text-emerald-700 font-semibold">● Recorded</span> · 15% VAT on Sales:{' '}
                  <span className="font-semibold text-emerald-700 font-tabular">
                    {formatCurrency(todayTaxCollected, settings.currencySymbol)}
                  </span>
                </>
              ) : (
                <span className="text-amber-700 font-medium">● Not recorded yet today</span>
              )}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>
              Cash: <strong className="font-tabular text-stone-900">{formatCurrency(todayCashSales, settings.currencySymbol)}</strong>
            </span>
            <span>
              Transfer: <strong className="font-tabular text-stone-900">{formatCurrency(todayCardBankSales, settings.currencySymbol)}</strong>
            </span>
          </div>
        </div>

        {/* Pillar 2: Purchased Items & Shop Expenses */}
        <div
          onClick={() => setActiveTab('purchases')}
          className="cursor-pointer rounded-2xl bg-white border border-stone-200 p-5 hover:border-stone-400 transition flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>02. Purchases & Shop Expenses</span>
              <ArrowUpRight className="w-4 h-4 text-stone-400" />
            </div>

            <p className="text-2xl font-bold text-stone-900 font-tabular tracking-tight mt-2">
              {formatCurrency(allPurchasesTotal, settings.currencySymbol)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {purchases.length} supplier receipts <span aria-hidden="true">·</span> VAT Paid on Purchases:{' '}
              <span className="font-semibold text-stone-900 font-tabular">
                {formatCurrency(allInputTaxCredits, settings.currencySymbol)}
              </span>
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>
              Reduces Tax: <strong className="font-tabular text-emerald-700">{formatCurrency(allDeductiblePurchases, settings.currencySymbol)}</strong>
            </span>
            <span className="text-orange-700 font-semibold">Open →</span>
          </div>
        </div>

        {/* Pillar 3: Bank Balances & Check */}
        <div
          onClick={() => setActiveTab('bank')}
          className="cursor-pointer rounded-2xl bg-white border border-stone-200 p-5 hover:border-stone-400 transition flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>03. Money in Bank Accounts</span>
              <ArrowUpRight className="w-4 h-4 text-stone-400" />
            </div>

            <p className="text-2xl font-bold text-stone-900 font-tabular tracking-tight mt-2">
              {formatCurrency(totalBankBalance, settings.currencySymbol)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {bankAccounts.length} bank accounts <span aria-hidden="true">·</span> Saved for Tax:{' '}
              <span className="font-semibold text-stone-900 font-tabular">
                {formatCurrency(taxReserveBalance, settings.currencySymbol)}
              </span>
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span>
              {unreconciledBankTx.length === 0
                ? 'All bank entries checked'
                : `${unreconciledBankTx.length} bank entries to check`}
            </span>
            <span className="text-orange-700 font-semibold">Check Bank →</span>
          </div>
        </div>
      </div>

      {/* Two-Column Split: Tax Check Summary & Recent Shop Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tax Readiness Check */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-stone-200 p-5 space-y-4">
          <div className="flex items-start justify-between pb-3 border-b border-stone-200">
            <div>
              <span className="text-xs text-stone-500">Tax Office Readiness Check</span>
              <h2 className="text-base font-bold text-stone-900 mt-0.5">
                {auditReport.issues.length === 0
                  ? 'All Records Are Clean & Ready'
                  : `${auditReport.issues.length} Item(s) Need Your Attention`}
              </h2>
            </div>
            <button
              onClick={() => setActiveTab('audit')}
              className="text-xs font-semibold text-orange-700 hover:underline flex items-center gap-0.5 whitespace-nowrap"
            >
              <span>See Tax Summary</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-600">Total Sales Recorded</span>
              <span className="font-mono font-semibold text-stone-900">
                {formatCurrency(sales.reduce((a, s) => a + s.totalAmount, 0), settings.currencySymbol)}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-600">Allowed Business Expenses</span>
              <span className="font-mono font-semibold text-emerald-700">
                {formatCurrency(allDeductiblePurchases, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
              <span className="text-stone-600">Bank Entries Checked</span>
              <span className="font-mono font-semibold text-stone-900">
                {auditReport.bankReconciliationRate}%
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-stone-600">Purchases with Official Receipt #</span>
              <span className="font-mono font-semibold text-stone-900">
                {auditReport.receiptAttachmentRate}%
              </span>
            </div>
          </div>

          {auditReport.issues.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="truncate">{auditReport.issues[0].title}</span>
              </div>
              <button
                onClick={() => setActiveTab(auditReport.issues[0].targetTab)}
                className="font-semibold underline shrink-0"
              >
                Fix Now
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Recent Shop Activity */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-stone-200 p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <h2 className="text-base font-bold text-stone-900">
              Recent Sales & Purchases
            </h2>
            <span className="text-xs text-stone-500 font-medium">
              Sorted: Recent to Old
            </span>
          </div>

          {sales.length === 0 && purchases.length === 0 ? (
            <div className="py-10 text-center text-xs text-stone-500 space-y-3">
              <p>
                No sales or purchases recorded yet. Click &quot;Record Daily Sales&quot; or &quot;Add Purchase / Expense&quot; above to start.
              </p>
              {onOpenHelp && (
                <button
                  onClick={onOpenHelp}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-100 border border-stone-300 text-stone-800 font-semibold hover:bg-stone-200 transition"
                >
                  <span>የመተግበሪያውን አጠቃቀም መመሪያ ያንብቡ (How to Use) →</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {[
                ...sales.map((s) => ({
                  kind: 'sale' as const,
                  sale: s,
                  date: s.date,
                  createdAt: s.createdAt || 0,
                })),
                ...purchases.map((p) => ({
                  kind: 'purchase' as const,
                  purchase: p,
                  date: p.date,
                  createdAt: p.createdAt || 0,
                })),
              ]
                .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
                .slice(0, 6)
                .map((entry) => {
                  if (entry.kind === 'sale') {
                    const sale = entry.sale;
                    const cashPart = getSaleCashAmount(sale);
                    const transferPart = getSaleBankTransferAmount(sale);
                    return (
                      <div
                        key={sale.id}
                        className="py-3 flex items-center justify-between text-xs gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-stone-500">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Daily Sale
                            </span>
                            <span className="font-mono font-semibold text-stone-900">{sale.receiptNumber}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-stone-700">{formatRelativeDate(sale.date)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Cash: {formatCurrency(cashPart, settings.currencySymbol)} / Transfer: {formatCurrency(transferPart, settings.currencySymbol)}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-stone-800 truncate mt-0.5">
                            Total Daily Sales ({sale.date})
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-700 text-sm block">
                              +{formatCurrency(sale.totalAmount, settings.currencySymbol)}
                            </span>
                            <span className="text-[11px] text-stone-500 font-mono">
                              15% VAT: {formatCurrency(sale.taxAmount, settings.currencySymbol)}
                            </span>
                          </div>
                          {onEditSale && (
                            <button
                              onClick={() => onEditSale(sale)}
                              title="Edit daily sales entry"
                              className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition"
                            >
                              <Pencil className="w-3.5 h-3.5 text-orange-700" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    const pur = entry.purchase;
                    return (
                      <div
                        key={pur.id}
                        className="py-3 flex items-center justify-between text-xs gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-stone-500">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-stone-100 text-stone-800 border border-stone-200">
                              Purchase
                            </span>
                            <span className="font-mono font-semibold text-stone-900">{pur.invoiceNumber}</span>
                            {pur.vendorTin && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono text-stone-700">TIN: {pur.vendorTin}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-stone-700">{formatRelativeDate(pur.date)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{pur.deductiblePercentage}% Allowed Expense</span>
                            {pur.receiptImage && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 text-orange-700 font-semibold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200 text-[10px]">
                                  <Camera className="w-3 h-3" />
                                  <span>Photo</span>
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-sm font-medium text-stone-800 truncate mt-0.5">
                            {pur.vendorName}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="font-mono font-bold text-stone-900 text-sm block">
                              -{formatCurrency(pur.totalAmount, settings.currencySymbol)}
                            </span>
                            <span className="text-[11px] text-stone-500 font-mono">
                              VAT Paid: {formatCurrency(pur.taxAmount, settings.currencySymbol)}
                            </span>
                          </div>
                          {onEditPurchase && (
                            <button
                              onClick={() => onEditPurchase(pur)}
                              title="Edit purchase entry"
                              className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition"
                            >
                              <Pencil className="w-3.5 h-3.5 text-orange-700" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
