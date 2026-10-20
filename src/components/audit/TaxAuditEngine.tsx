import React, { useState, useMemo } from 'react';
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
  formatDate,
  calculateAuditReadiness,
  getSaleCashAmount,
  getSaleBankTransferAmount,
} from '../../utils/formatters';
import {
  ShieldCheck,
  AlertTriangle,
  Printer,
  Download,
  Sparkles,
  BookOpen,
  Scale,
  Calculator,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingDown,
  Building2,
  FileText,
  DollarSign,
  ChevronRight,
  Coins,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  Calendar,
  RefreshCw,
  Eye,
  Plus,
  Layers,
  Wallet,
  Landmark,
  ChevronDown,
  Info,
} from 'lucide-react';
import { ActiveTab } from '../layout/BottomNav';
import {
  calculateBankDepositAnalysis,
  calculateMarkupTest,
  calculateSourceAndApplicationOfFunds,
  evaluateMoRChecklist,
  simulateMoRPenalties,
  SECTOR_BENCHMARKS,
} from '../../utils/ethiopianTaxAuditManual';
import {
  calculateDailyCashExamination,
  exportDailyCashAuditCSV,
  DailyCashAuditRecord,
  DailyCashAuditSummary,
  ETHIOPIAN_CASH_PURCHASE_LIMIT,
} from '../../utils/dailyCashReconciliation';
import { TaxAuditManualModal } from './TaxAuditManualModal';

interface TaxAuditEngineProps {
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  dailyCloses?: DailyRegisterClose[];
  settings: TaxSettings;
  setActiveTab: (tab: ActiveTab) => void;
  onExportCSV: () => void;
  onOpenAICopilot?: () => void;
  onOpenAddSale?: () => void;
  onOpenAddPurchase?: () => void;
  onOpenDailyClose?: () => void;
}

export const TaxAuditEngine: React.FC<TaxAuditEngineProps> = ({
  sales,
  purchases,
  bankAccounts,
  bankTransactions,
  dailyCloses = [],
  settings,
  setActiveTab,
  onExportCSV,
  onOpenAICopilot,
  onOpenAddSale,
  onOpenAddPurchase,
  onOpenDailyClose,
}) => {
  // Navigation inside the Audit Engine
  const [activeEngineTab, setActiveEngineTab] = useState<
    | 'overview'
    | 'daily_cash'
    | 'mor_checklist'
    | 'indirect_methods'
    | 'penalties'
    | 'working_papers'
  >('overview');

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState('BUILDING_MATERIALS');

  // Daily Cash & Bank Deposit Examination Engine State
  const [dailyCashSearch, setDailyCashSearch] = useState('');
  const [dailyCashFilter, setDailyCashFilter] = useState<
    'all' | 'statement_period' | 'flags_only' | 'cash_purchases_only'
  >('all');
  const [dailyCashSort, setDailyCashSort] = useState<'chronological' | 'reverse'>('chronological');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Compute Daily Cash Reconciliation
  const dailyCashAudit = useMemo(() => {
    return calculateDailyCashExamination(sales, purchases, bankTransactions, dailyCloses);
  }, [sales, purchases, bankTransactions, dailyCloses]);

  // Financial aggregates
  const totalGrossRevenue = sales.reduce((acc, s) => acc + s.totalAmount, 0);
  const totalSalesTaxCollected = sales.reduce((acc, s) => acc + s.taxAmount, 0); // Output VAT
  const totalNetSales = sales.reduce((acc, s) => acc + s.subtotal, 0);

  const totalPurchasesCost = purchases.reduce((acc, p) => acc + p.totalAmount, 0);
  const totalInputTaxPaid = purchases.reduce((acc, p) => acc + p.taxAmount, 0); // Input VAT
  const totalDeductibleExpenses = purchases.reduce(
    (acc, p) => acc + p.subtotal * (p.deductiblePercentage / 100),
    0
  );

  // Net Tax Calculations
  const taxableProfit = Math.max(0, totalNetSales - totalDeductibleExpenses);
  const estimatedIncomeTax = taxableProfit * settings.corporateTaxRate;

  // Net VAT Payable to Tax Authority (MoR) = Output Tax Collected - Input Tax Paid
  const netVatPayable = Math.max(0, totalSalesTaxCollected - totalInputTaxPaid);

  // Total Tax Obligation
  const totalTaxObligation = estimatedIncomeTax + netVatPayable;

  // Bank Tax Reserve
  const taxReserveAccount = bankAccounts.find((b) => b.type === 'tax_reserve');
  const taxReserveFunds = taxReserveAccount ? taxReserveAccount.currentBalance : 0;
  const reserveCoverageRatio =
    totalTaxObligation > 0 ? (taxReserveFunds / totalTaxObligation) * 100 : 100;

  // 3-Way Reconciliation Math
  const totalBankInflows = bankTransactions
    .filter((tx) => tx.type === 'credit')
    .reduce((acc, tx) => acc + tx.amount, 0);
  const totalBankOutflows = bankTransactions
    .filter((tx) => tx.type === 'debit')
    .reduce((acc, tx) => acc + tx.amount, 0);

  // Diagnostic Audit Check
  const auditReport = calculateAuditReadiness(sales, purchases, bankAccounts, bankTransactions);

  // Ethiopian MoR Audit Manual Calculations
  const morChecklist = evaluateMoRChecklist(sales, purchases, bankAccounts, bankTransactions, settings);
  const bankDepositAnalysis = calculateBankDepositAnalysis(sales, bankTransactions);
  const markupTest = calculateMarkupTest(sales, purchases, selectedSector);
  const sourceAndApp = calculateSourceAndApplicationOfFunds(sales, purchases, bankTransactions);

  // Simulated penalties
  const missingReceiptPurchases = purchases.filter((p) => !p.invoiceNumber || !p.receiptImage);
  const simulatedDisallowedAmount = missingReceiptPurchases.reduce((sum, p) => sum + p.subtotal, 0);
  const missingReceiptSales = sales.filter((s) => !s.receiptNumber);
  const penaltySimulation = simulateMoRPenalties(
    simulatedDisallowedAmount,
    markupTest.estimatedUnderreportedRevenue,
    settings.corporateTaxRate,
    settings.defaultSalesTaxRate,
    3,
    missingReceiptSales.length
  );

  const handlePrintDossier = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header with Print, Export, and MoR Manual Guide Button */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-stone-200 no-print">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-800 rounded border border-orange-200 uppercase tracking-wider">
              MoR Tax Audit Manual Compliant
            </span>
            <p className="text-xs text-stone-500 font-mono">
              TIN: <strong className="text-stone-800">{settings.taxIdNumber}</strong>
            </p>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Tax &amp; Audit Examination Engine
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Based on Ethiopian Ministry of Revenues (MoR) / Bahir Dar University AIS Tax Audit Manual (2019)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold border border-stone-300 transition whitespace-nowrap min-h-[38px] cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-orange-700 shrink-0" />
            <span>MoR Manual Guide</span>
          </button>

          {onOpenAICopilot && (
            <button
              onClick={onOpenAICopilot}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold hover:brightness-105 transition shadow-sm whitespace-nowrap min-h-[38px] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              <span>AI Audit Copilot</span>
            </button>
          )}

          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-50 transition whitespace-nowrap min-h-[38px]"
          >
            <Download className="w-3.5 h-3.5 text-stone-600 shrink-0" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintDossier}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition whitespace-nowrap min-h-[38px]"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Print MoR Working Paper</span>
          </button>
        </div>
      </div>

      {/* Audit Engine Sub-Navigation Bar */}
      <div className="bg-white p-1 rounded-xl border border-stone-200 shadow-2xs flex items-center gap-1 overflow-x-auto scrollbar-none text-xs no-print">
        <button
          onClick={() => setActiveEngineTab('overview')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'overview'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Overview &amp; Profit</span>
        </button>

        <button
          onClick={() => setActiveEngineTab('daily_cash')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'daily_cash'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-amber-500" />
          <span>Daily Cash, Purchases &amp; Bank Deposits</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 ml-0.5">
            {dailyCashAudit.totalDaysExamined} Days
          </span>
          {dailyCashAudit.highRiskCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white ml-0.5">
              {dailyCashAudit.highRiskCount} Flagged
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveEngineTab('mor_checklist')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'mor_checklist'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>MoR Checklist (2019)</span>
        </button>

        <button
          onClick={() => setActiveEngineTab('indirect_methods')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'indirect_methods'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Indirect Audit Methods (Ch. 6)</span>
        </button>

        <button
          onClick={() => setActiveEngineTab('penalties')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'penalties'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Penalties Simulator (Proc. 983)</span>
        </button>

        <button
          onClick={() => setActiveEngineTab('working_papers')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'working_papers'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>MoR Working Papers Schedule</span>
        </button>
      </div>

      {/* AI Forensic Pre-Audit Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-orange-50 via-white to-amber-50/50 border border-orange-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-orange-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-700/20">
            <Sparkles className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-stone-900 text-sm">
                AI Pre-Audit Examiner &amp; MoR Tax Advisor
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-800 rounded-full border border-orange-200">
                MoR 2019 Grounded
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
              Examines your books using the Ethiopian Ministry of Revenues 2019 Tax Audit Manual procedures, Proclamations 983/2016 and 979/2016, and indirect audit formulas.
            </p>
          </div>
        </div>
        {onOpenAICopilot && (
          <button
            onClick={onOpenAICopilot}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold transition shrink-0 shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span>Run AI Audit Review</span>
          </button>
        )}
      </div>

      {/* ===================== TAB 1: OVERVIEW & PROFIT ===================== */}
      {activeEngineTab === 'overview' && (
        <div className="space-y-6">
          {/* Audit Readiness Diagnostic Card */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-stone-100 border border-stone-200 text-orange-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>

                <div>
                  <span className="text-xs text-stone-500">
                    MoR Audit Readiness Score <span aria-hidden="true">&middot;</span> {auditReport.grade}
                  </span>
                  <h3 className="text-lg font-bold text-stone-900">
                    {auditReport.score}% Compliance with MoR Audit Manual
                  </h3>
                </div>
              </div>

              <div className="text-right text-xs">
                <span className="text-stone-500 block">Category Status</span>
                <span className="font-bold text-emerald-700">Category &apos;A/B&apos; Books Active</span>
              </div>
            </div>

            {/* 3 Metric Columns */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-stone-100">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-xs text-stone-500 block">Bank 3-Way Reconciled</span>
                <span className="text-base font-bold text-stone-900 font-tabular mt-0.5 block">
                  {auditReport.bankReconciliationRate}%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-xs text-stone-500 block">Purchases with Invoice/Receipt #</span>
                <span className="text-base font-bold text-stone-900 font-tabular mt-0.5 block">
                  {auditReport.receiptAttachmentRate}%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-xs text-stone-500 block">Tax Reserve Funded</span>
                <span className="text-base font-bold text-stone-900 font-tabular mt-0.5 block">
                  {Math.min(100, Math.round(reserveCoverageRatio))}%
                </span>
              </div>
            </div>

            {/* Diagnostic Issues List */}
            {auditReport.issues.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-stone-200">
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  Audit Red Flags to Resolve Before MoR Inspection:
                </span>

                {auditReport.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start justify-between text-xs gap-3"
                  >
                    <div>
                      <h4 className="font-bold text-amber-950">{issue.title}</h4>
                      <p className="text-xs text-amber-900 mt-0.5">{issue.description}</p>
                      <span className="inline-block mt-1 text-xs font-semibold text-red-700">
                        MoR Risk: {issue.impact}
                      </span>
                    </div>

                    <button
                      onClick={() => setActiveTab(issue.targetTab)}
                      className="px-3 py-1.5 rounded-lg bg-amber-800 text-white font-semibold text-xs hover:bg-amber-900 shrink-0 cursor-pointer"
                    >
                      Fix Now
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Simple Tax & Profit Calculation Summary */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Business Income Tax &amp; 15% VAT Calculation
                </h3>
                <p className="text-xs text-stone-500">
                  According to Schedule &apos;C&apos; Proclamation 979/2016 and VAT Proclamation 285/2002
                </p>
              </div>
              <span className="text-xs text-stone-500 font-mono">
                TIN: {settings.taxIdNumber}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-stone-700">
                <span>1. Total Gross Sales (Before VAT):</span>
                <span className="font-tabular font-bold text-stone-900">
                  {formatCurrency(totalNetSales, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-700">
                <span>2. Minus (&minus;) Deductible Purchases &amp; Allowable Expenses (Art. 22):</span>
                <span className="font-tabular font-bold text-emerald-700">
                  -{formatCurrency(totalDeductibleExpenses, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-900 pt-2 border-t border-stone-100 font-semibold">
                <span>3. Taxable Business Profit:</span>
                <span className="font-tabular">
                  {formatCurrency(taxableProfit, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-600 pl-3">
                <span>&bull; Estimated 30% Business Profit Tax (Schedule &apos;C&apos;):</span>
                <span className="font-tabular font-medium text-stone-900">
                  {formatCurrency(estimatedIncomeTax, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-900 pt-2 border-t border-stone-100 font-semibold">
                <span>4. 15% Output VAT Collected on Sales (VAT-01):</span>
                <span className="font-tabular">
                  +{formatCurrency(totalSalesTaxCollected, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-600 pl-3">
                <span>&bull; Minus (&minus;) 15% Allowed Input VAT Paid on Invoices (Art. 21):</span>
                <span className="font-tabular font-medium text-emerald-700">
                  -{formatCurrency(totalInputTaxPaid, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-800 pl-3 font-semibold">
                <span>&bull; Net Monthly VAT Payable to Ministry of Revenues:</span>
                <span className="font-tabular text-orange-700">
                  {formatCurrency(netVatPayable, settings.currencySymbol)}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs mt-3">
                <div>
                  <span className="font-bold text-stone-900 block text-sm">Total Statutory Tax Obligation</span>
                  <span className="text-xs text-stone-500">
                    Profit Tax ({Math.round(settings.corporateTaxRate * 100)}%) + Net 15% VAT
                  </span>
                </div>
                <span className="text-lg font-bold text-stone-900 font-tabular">
                  {formatCurrency(totalTaxObligation, settings.currencySymbol)}
                </span>
              </div>
            </div>
          </div>

          {/* 3-Way Check Summary */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="text-base font-bold text-stone-900">
                MoR 3-Way Reconciliation Triangulation
              </h3>
              <span className="text-xs font-semibold text-emerald-700">
                Audit Defense Cross-Check
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Pillar 1: Sales Book */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <span className="font-bold text-stone-900 block">01. Sales Book (ESRM/FRC)</span>
                <div className="space-y-1 text-stone-600">
                  <div className="flex justify-between">
                    <span>Total Sales:</span>
                    <span className="font-bold text-stone-900 font-tabular">
                      {formatCurrency(totalGrossRevenue, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>15% Output VAT:</span>
                    <span className="font-tabular">{formatCurrency(totalSalesTaxCollected, settings.currencySymbol)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Recorded Entries:</span>
                    <span>{sales.length} transactions</span>
                  </div>
                </div>
              </div>

              {/* Pillar 2: Purchase Book */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <span className="font-bold text-stone-900 block">02. Purchases &amp; COGS</span>
                <div className="space-y-1 text-stone-600">
                  <div className="flex justify-between">
                    <span>Total Purchases:</span>
                    <span className="font-bold text-stone-900 font-tabular">
                      {formatCurrency(totalPurchasesCost, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Allowable Deductions:</span>
                    <span className="font-tabular">{formatCurrency(totalDeductibleExpenses, settings.currencySymbol)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax Invoices:</span>
                    <span>{purchases.length} invoices</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Bank Accounts */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <span className="font-bold text-stone-900 block">03. Commercial Bank Accounts</span>
                <div className="space-y-1 text-stone-600">
                  <div className="flex justify-between">
                    <span>Total Deposits (Inflows):</span>
                    <span className="font-bold text-stone-900 font-tabular">
                      {formatCurrency(totalBankInflows, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Withdrawals:</span>
                    <span className="font-tabular">{formatCurrency(totalBankOutflows, settings.currencySymbol)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Balances:</span>
                    <span className="font-tabular text-emerald-700 font-bold">
                      {formatCurrency(bankAccounts.reduce((a, b) => a + b.currentBalance, 0), settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Cash Sales, Cash Purchases & Bank Deposit Audit Summary Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-orange-50/50 border border-amber-200/90 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Coins className="w-5 h-5 text-amber-100" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded uppercase tracking-wider">
                      MoR Chapter 6 &middot; Cash Audit
                    </span>
                    <span className="text-[11px] text-stone-500 font-mono">
                      {dailyCashAudit.totalDaysExamined} Days Reconciled
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-stone-900 mt-0.5">
                    Daily Sales, Cash Purchases &amp; Bank Deposit Audit
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setActiveEngineTab('daily_cash')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <span>Open Full Daily Schedule</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Tax auditors examine whether physical cash received from daily sales was either spent on legitimate business purchases with official invoices or promptly deposited into your commercial bank account.
            </p>

            {/* 4 Summary Stat Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* 1. Total Daily Sales */}
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between text-stone-500">
                  <span>1. Total Daily Sales:</span>
                  <span className="font-mono text-[11px]">{dailyCashAudit.totalSalesCount} entries</span>
                </div>
                <div className="text-base font-bold text-stone-900 font-tabular">
                  {formatCurrency(dailyCashAudit.grandGrossSales, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 space-y-0.5 pt-1 border-t border-stone-100">
                  <div className="flex justify-between">
                    <span>Cash Sales:</span>
                    <span className="font-semibold text-emerald-700">
                      {formatCurrency(dailyCashAudit.grandCashSales, settings.currencySymbol)} ({dailyCashAudit.cashSalesPercentage}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-500">
                    <span>Bank Transfers:</span>
                    <span>{formatCurrency(dailyCashAudit.grandTransferSales, settings.currencySymbol)}</span>
                  </div>
                </div>
              </div>

              {/* 2. Cash Purchases (Not Transfer) */}
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between text-stone-500">
                  <span>2. Cash Purchases (Not Transfer):</span>
                  <span className="font-mono text-[11px]">{dailyCashAudit.totalCashPurchasesCount} cash inv</span>
                </div>
                <div className="text-base font-bold text-amber-800 font-tabular">
                  {formatCurrency(dailyCashAudit.grandCashPurchases, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 space-y-0.5 pt-1 border-t border-stone-100">
                  <div className="flex justify-between">
                    <span>Paid in Physical Cash:</span>
                    <span className="font-semibold text-stone-900">
                      {dailyCashAudit.cashPurchasesPercentage}% of costs
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-500">
                    <span>Bank Transfer Costs:</span>
                    <span>{formatCurrency(dailyCashAudit.grandTransferPurchases, settings.currencySymbol)}</span>
                  </div>
                </div>
              </div>

              {/* 3. Net Cash to be Deposited into Bank */}
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between text-stone-500">
                  <span>3. Net Cash to Deposit to Bank:</span>
                  <span className="text-[10px] text-stone-400 font-mono">Cash Sales - Cash Costs</span>
                </div>
                <div className="text-base font-bold text-orange-700 font-tabular">
                  {formatCurrency(dailyCashAudit.netCashRequiredToBeDeposited, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 space-y-0.5 pt-1 border-t border-stone-100">
                  <div className="flex justify-between">
                    <span>Calculated Need:</span>
                    <span className="font-mono text-stone-800 font-medium">
                      {formatCurrency(dailyCashAudit.grandCashSales)} &minus; {formatCurrency(dailyCashAudit.grandCashPurchases)}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-500">
                    <span>Required Banking:</span>
                    <span>100% of Net Cash</span>
                  </div>
                </div>
              </div>

              {/* 4. Bank Deposits & Undeposited Cash */}
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between text-stone-500">
                  <span>4. Actual Bank Deposits Recorded:</span>
                  <span className="font-semibold text-stone-800 font-tabular">
                    {dailyCashAudit.depositComplianceRate}%
                  </span>
                </div>
                <div className="text-base font-bold text-emerald-800 font-tabular">
                  {formatCurrency(dailyCashAudit.totalActualBankDeposits, settings.currencySymbol)}
                </div>
                <div className="text-[11px] space-y-0.5 pt-1 border-t border-stone-100">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Undeposited Cash On Hand:</span>
                    <span
                      className={`font-bold font-tabular ${
                        Math.abs(dailyCashAudit.netUndepositedCashBalance) < 5000
                          ? 'text-emerald-700'
                          : dailyCashAudit.netUndepositedCashBalance > 0
                          ? 'text-amber-800'
                          : 'text-indigo-700'
                      }`}
                    >
                      {formatCurrency(dailyCashAudit.netUndepositedCashBalance, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-500">
                    <span>In-Vault / Register:</span>
                    <span>{dailyCashAudit.netUndepositedCashBalance >= 0 ? 'Pending Bank Deposit' : 'Excess Deposits'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Verdict Banner */}
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-start gap-2.5 text-xs">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-stone-700">
                <strong className="text-stone-900">MoR Examination Status: </strong>
                <span>{dailyCashAudit.auditorGuidance}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: DAILY CASH, PURCHASES & BANK DEPOSITS ===================== */}
      {activeEngineTab === 'daily_cash' && (
        <div className="space-y-6">
          {/* Header Banner with Actions */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-white to-orange-50 border border-amber-200/90 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Coins className="w-6 h-6 text-amber-100" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded uppercase tracking-wider">
                      MoR Chapter 6 &middot; Cash Register &amp; Banking Audit
                    </span>
                    <span className="text-xs text-stone-500 font-mono">
                      Proclamations 983/2016 &amp; 979/2016 Article 22
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-stone-900 tracking-tight mt-1">
                    Daily Sales, Cash Purchases &amp; Bank Deposit Examination Schedule
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                    Tracks total daily sales, purchases paid with cash (excluding bank transfers), net cash required to be deposited in the bank, and cumulative undeposited cash on hand up to each date.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const csv = exportDailyCashAuditCSV(
                      dailyCashAudit,
                      settings.businessName,
                      settings.taxIdNumber,
                      settings.currencySymbol
                    );
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute(
                      'download',
                      `MoR_Daily_Cash_Audit_Schedule_${settings.businessName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
                    );
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-50 transition whitespace-nowrap min-h-[38px] cursor-pointer"
                  title="Export Day-by-Day Cash & Banking Audit Schedule as CSV"
                >
                  <Download className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                  <span>Export Cash CSV</span>
                </button>

                {onOpenAddSale && (
                  <button
                    onClick={onOpenAddSale}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-50 transition whitespace-nowrap min-h-[38px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Add Daily Sale</span>
                  </button>
                )}

                {onOpenAddPurchase && (
                  <button
                    onClick={onOpenAddPurchase}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-50 transition whitespace-nowrap min-h-[38px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Add Cash Purchase</span>
                  </button>
                )}

                {onOpenDailyClose && (
                  <button
                    onClick={onOpenDailyClose}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold transition whitespace-nowrap min-h-[38px] cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Record Day Close (Z-Report)</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4 Primary Top Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-3 border-t border-amber-200/70">
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">1. Total Daily Sales Recorded</span>
                <div className="text-lg font-bold text-stone-900 font-tabular">
                  {formatCurrency(dailyCashAudit.grandGrossSales, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-100 flex justify-between">
                  <span>Cash: <strong className="text-emerald-700">{formatCurrency(dailyCashAudit.grandCashSales)}</strong></span>
                  <span className="text-stone-500">Transfer: {formatCurrency(dailyCashAudit.grandTransferSales)}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">2. Cash Purchases (Not Transfer)</span>
                <div className="text-lg font-bold text-amber-800 font-tabular">
                  {formatCurrency(dailyCashAudit.grandCashPurchases, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-100 flex justify-between">
                  <span>{dailyCashAudit.totalCashPurchasesCount} cash invoices</span>
                  <span>{dailyCashAudit.cashPurchasesPercentage}% of total purchases</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">3. Net Cash to Deposit Up to Date</span>
                <div className="text-lg font-bold text-orange-700 font-tabular">
                  {formatCurrency(dailyCashAudit.netCashRequiredToBeDeposited, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-100 flex justify-between">
                  <span>Formula:</span>
                  <span className="font-mono text-stone-800">Cash Sales &minus; Cash Purchases</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">4. Actual Bank Deposits &amp; Cash on Hand</span>
                <div className="text-lg font-bold text-emerald-800 font-tabular">
                  {formatCurrency(dailyCashAudit.totalActualBankDeposits, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-100 flex justify-between">
                  <span>Undeposited Cash:</span>
                  <span
                    className={`font-bold font-tabular ${
                      dailyCashAudit.netUndepositedCashBalance > 5000
                        ? 'text-amber-800'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatCurrency(dailyCashAudit.netUndepositedCashBalance, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statutory MoR Chapter 6 Guidance Box */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-2">
            <div className="flex items-start gap-2.5">
              <Scale className="w-4 h-4 text-orange-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-stone-900">
                  MoR Chapter 6 Tax Examination Principle: Cash Sales vs Bank Deposit Triangulation
                </h4>
                <p className="text-stone-700 mt-1 leading-relaxed">
                  Under the Ethiopian Tax Audit Manual (Chapter 6 &middot; Indirect Audit Methods) and Proclamation 983/2016, tax examiners analyze the relationship between daily cash sales and bank deposits. Physical cash collected from sales must either:
                </p>
                <ul className="list-disc list-inside mt-1.5 space-y-1 text-stone-600 pl-1">
                  <li>
                    Be paid out for legitimate business purchases/expenses supported by supplier tax invoices with Supplier TINs (Cash Purchases); or
                  </li>
                  <li>
                    Be deposited into the taxpayer&apos;s registered commercial bank account (such as CBE, Awash, Dashen).
                  </li>
                  <li>
                    <strong className="text-stone-800">Statutory Cash Limit Rule:</strong> In accordance with Ethiopian cash transaction regulations, only single cash purchases exceeding <strong className="text-stone-900 font-mono">ETB {ETHIOPIAN_CASH_PURCHASE_LIMIT.toLocaleString()}</strong> are flagged. Single cash purchases up to ETB 50,000 are permitted; payments exceeding ETB 50,000 must be executed via bank transfer or cheque to safeguard input VAT deductibility.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3 no-print">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search by date or day */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={dailyCashSearch}
                  onChange={(e) => setDailyCashSearch(e.target.value)}
                  placeholder="Filter by date (e.g. 2026-08, 15/10, Oct, Mon)..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white transition"
                />
              </div>

              {/* Sort Toggle */}
              <button
                onClick={() =>
                  setDailyCashSort((prev) => (prev === 'chronological' ? 'reverse' : 'chronological'))
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold border border-stone-300 transition whitespace-nowrap cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-stone-600" />
                <span>
                  {dailyCashSort === 'chronological'
                    ? 'Chronological (Oldest First &middot; Recommended)'
                    : 'Reverse (Newest First)'}
                </span>
              </button>
            </div>

            {/* Presets Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-stone-500 font-medium mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter:
              </span>

              <button
                onClick={() => setDailyCashFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  dailyCashFilter === 'all'
                    ? 'bg-amber-800 text-white shadow-xs font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                All Days ({dailyCashAudit.totalDaysExamined})
              </button>

              <button
                onClick={() => setDailyCashFilter('statement_period')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  dailyCashFilter === 'statement_period'
                    ? 'bg-amber-800 text-white shadow-xs font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                CBE Statement Period (08/07 &ndash; 15/10/2026)
              </button>

              <button
                onClick={() => setDailyCashFilter('cash_purchases_only')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  dailyCashFilter === 'cash_purchases_only'
                    ? 'bg-amber-800 text-white shadow-xs font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Days with Cash Purchases ({dailyCashAudit.records.filter((r) => r.cashPurchases > 0).length})
              </button>

              <button
                onClick={() => setDailyCashFilter('flags_only')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  dailyCashFilter === 'flags_only'
                    ? 'bg-rose-700 text-white shadow-xs font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Discrepancies / Flags Only ({dailyCashAudit.daysWithDiscrepancy})
              </button>
            </div>
          </div>

          {/* Day-by-Day Comprehensive Audit Schedule Table */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-stone-900">
                  Day-by-Day Cash &amp; Bank Deposit Examination Log
                </h4>
                <p className="text-xs text-stone-500">
                  Showing {
                    dailyCashAudit.records.filter((rec) => {
                      if (dailyCashSearch.trim()) {
                        const q = dailyCashSearch.toLowerCase().trim();
                        if (!rec.date.toLowerCase().includes(q) && !rec.dayOfWeek.toLowerCase().includes(q)) return false;
                      }
                      if (dailyCashFilter === 'statement_period') return rec.date >= '2026-07-01' && rec.date <= '2026-10-31';
                      if (dailyCashFilter === 'flags_only') return rec.auditStatus !== 'compliant';
                      if (dailyCashFilter === 'cash_purchases_only') return rec.cashPurchases > 0;
                      return true;
                    }).length
                  } of {dailyCashAudit.totalDaysExamined} days examined
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-stone-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Compliant
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Undeposited Cash
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Cash &gt; 50k ETB Flag
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100/80 border-b border-stone-200 text-stone-700 font-bold">
                    <th className="py-3 px-3.5 whitespace-nowrap">Date &amp; Day</th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">
                      Daily Sales<br />
                      <span className="font-normal text-[10px] text-stone-500">(Gross / Cash / Transfer)</span>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">
                      Purchases with Cash<br />
                      <span className="font-normal text-[10px] text-stone-500">(Strictly Cash &middot; Not Transfer)</span>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right bg-amber-50/50">
                      Daily Net Cash to Deposit<br />
                      <span className="font-normal text-[10px] text-stone-500">(Cash Sales &minus; Cash Costs)</span>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right bg-amber-50/80">
                      Cumulative Cash to Deposit<br />
                      <span className="font-normal text-[10px] text-stone-500">(Up to that Date)</span>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right">
                      Actual Bank Deposits<br />
                      <span className="font-normal text-[10px] text-stone-500">(Daily / Cumulative)</span>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap text-right bg-stone-50">
                      Undeposited Cash On Hand<br />
                      <span className="font-normal text-[10px] text-stone-500">(Cumulative Cash &minus; Bank)</span>
                    </th>
                    <th className="py-3 px-3.5 whitespace-nowrap">MoR Audit Status</th>
                    <th className="py-3 px-3.5 text-center whitespace-nowrap">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {dailyCashAudit.records
                    .filter((rec) => {
                      if (dailyCashSearch.trim()) {
                        const q = dailyCashSearch.toLowerCase().trim();
                        if (!rec.date.toLowerCase().includes(q) && !rec.dayOfWeek.toLowerCase().includes(q)) return false;
                      }
                      if (dailyCashFilter === 'statement_period') return rec.date >= '2026-07-01' && rec.date <= '2026-10-31';
                      if (dailyCashFilter === 'flags_only') return rec.auditStatus !== 'compliant';
                      if (dailyCashFilter === 'cash_purchases_only') return rec.cashPurchases > 0;
                      return true;
                    })
                    .sort((a, b) => {
                      if (dailyCashSort === 'chronological') return a.date.localeCompare(b.date);
                      return b.date.localeCompare(a.date);
                    })
                    .map((rec) => {
                      const isExpanded = expandedDate === rec.date;
                      const hasDiscrepancy = rec.auditStatus !== 'compliant';

                      return (
                        <React.Fragment key={rec.date}>
                          <tr
                            className={`transition hover:bg-stone-50/80 ${
                              hasDiscrepancy ? 'bg-amber-50/20' : ''
                            } ${isExpanded ? 'bg-amber-50/40' : ''}`}
                          >
                            {/* Date */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-bold text-stone-900">{formatDate(rec.date)}</div>
                              <span className="text-[11px] text-stone-500 font-mono">
                                {rec.dayOfWeek} &middot; {rec.date}
                              </span>
                            </td>

                            {/* Total Daily Sales */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <div className="font-bold text-stone-900 font-tabular">
                                {formatCurrency(rec.grossDailySales, settings.currencySymbol)}
                              </div>
                              <div className="text-[10px] space-x-1 font-mono">
                                <span className="text-emerald-700 font-semibold">
                                  Cash: {formatCurrency(rec.cashSales)}
                                </span>
                                {rec.bankTransferSales > 0 && (
                                  <span className="text-stone-500">
                                    &middot; Trf: {formatCurrency(rec.bankTransferSales)}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Purchases with Cash (Not Transfer) */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              {rec.cashPurchases > 0 ? (
                                <>
                                  <div className="font-bold text-amber-900 font-tabular">
                                    {formatCurrency(rec.cashPurchases, settings.currencySymbol)}
                                  </div>
                                  <div className="text-[10px] text-stone-500 font-mono">
                                    {rec.cashPurchasesCount} cash invoice(s)
                                    {rec.largeCashPurchasesCount > 0 && (
                                      <span className="text-rose-700 font-bold ml-1">
                                        &bull; {rec.largeCashPurchasesCount} &gt; 50k ETB
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <span className="text-stone-400 font-tabular">&mdash;</span>
                              )}
                              {rec.bankTransferPurchases > 0 && (
                                <div className="text-[10px] text-stone-400">
                                  (Trf: {formatCurrency(rec.bankTransferPurchases)})
                                </div>
                              )}
                            </td>

                            {/* Daily Net Cash to Deposit */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap bg-amber-50/40">
                              <div
                                className={`font-bold font-tabular ${
                                  rec.dailyCashToDeposit >= 0 ? 'text-stone-900' : 'text-rose-700'
                                }`}
                              >
                                {formatCurrency(rec.dailyCashToDeposit, settings.currencySymbol)}
                              </div>
                              <span className="text-[10px] text-stone-500">
                                {rec.dailyCashToDeposit >= 0 ? 'To Bank' : 'Negative Cash Day'}
                              </span>
                            </td>

                            {/* Cumulative Cash Need to Deposit */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap bg-amber-50/70">
                              <div className="font-bold text-orange-900 font-tabular">
                                {formatCurrency(rec.cumulativeCashToDeposit, settings.currencySymbol)}
                              </div>
                              <span className="text-[10px] text-stone-500">Running Net Cash</span>
                            </td>

                            {/* Actual Bank Deposits */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <div className="font-bold text-emerald-800 font-tabular">
                                {rec.actualBankDeposits > 0 ? (
                                  formatCurrency(rec.actualBankDeposits, settings.currencySymbol)
                                ) : (
                                  <span className="text-stone-400 font-normal">&mdash;</span>
                                )}
                              </div>
                              <div className="text-[10px] text-stone-500 font-mono">
                                Cumul: {formatCurrency(rec.cumulativeBankDeposits)}
                              </div>
                            </td>

                            {/* Undeposited Cash On Hand */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-50">
                              <div
                                className={`font-bold font-tabular ${
                                  Math.abs(rec.undepositedCashOnHand) < 5000
                                    ? 'text-emerald-700'
                                    : rec.undepositedCashOnHand > 0
                                    ? 'text-amber-800'
                                    : 'text-indigo-700'
                                }`}
                              >
                                {formatCurrency(rec.undepositedCashOnHand, settings.currencySymbol)}
                              </div>
                              <span className="text-[10px] text-stone-500 block">
                                {rec.undepositedCashOnHand > 0
                                  ? 'In Vault / Drawer'
                                  : rec.undepositedCashOnHand < 0
                                  ? 'Excess Deposit'
                                  : 'Balanced'}
                              </span>
                            </td>

                            {/* MoR Audit Status */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {rec.auditStatus === 'compliant' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Reconciled
                                </span>
                              ) : rec.auditStatus === 'undeposited_excess' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                                  <AlertTriangle className="w-3 h-3 text-amber-700" />
                                  Undeposited Cash
                                </span>
                              ) : rec.auditStatus === 'cash_limit_warning' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 uppercase">
                                  <AlertTriangle className="w-3 h-3 text-rose-700" />
                                  Cash &gt; 50k ETB
                                </span>
                              ) : rec.auditStatus === 'negative_daily_cash' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">
                                  <Info className="w-3 h-3 text-purple-700" />
                                  Negative Cash
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 uppercase">
                                  <Info className="w-3 h-3 text-indigo-700" />
                                  Excess Deposit
                                </span>
                              )}

                              {rec.dailyClose && (
                                <span className="block text-[10px] text-stone-500 font-mono mt-0.5">
                                  Z-Report: {rec.dailyClose.status}
                                </span>
                              )}
                            </td>

                            {/* Expand Details */}
                            <td className="py-3 px-3.5 text-center whitespace-nowrap">
                              <button
                                onClick={() => setExpandedDate(isExpanded ? null : rec.date)}
                                className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
                                  isExpanded
                                    ? 'bg-amber-100 border-amber-300 text-amber-900'
                                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                                }`}
                                title="Expand day transactions breakdown"
                              >
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Day Inspector Row */}
                          {isExpanded && (
                            <tr className="bg-stone-50/90 border-b border-stone-200">
                              <td colSpan={9} className="p-4 space-y-4">
                                <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-2">
                                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                                    <span className="font-bold text-stone-900 text-xs">
                                      Audit Examination Breakdown &middot; {formatDate(rec.date)} ({rec.dayOfWeek})
                                    </span>
                                    <span className="text-[11px] font-mono text-stone-500">
                                      Daily Deposit Gap: {formatCurrency(rec.dailyDepositGap, settings.currencySymbol)}
                                    </span>
                                  </div>

                                  {/* Findings List */}
                                  {rec.findings.length > 0 && (
                                    <div className="space-y-1">
                                      {rec.findings.map((f, fIdx) => (
                                        <div
                                          key={fIdx}
                                          className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-start gap-1.5"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                          <span>{f}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* 3 Column Day Grid: Sales, Purchases, Bank */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
                                    {/* Column 1: Sales Tickets on this date */}
                                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                                      <span className="font-bold text-stone-900 block border-b border-stone-200 pb-1">
                                        Sales on this Date ({sales.filter((s) => s.date === rec.date).length})
                                      </span>
                                      {sales.filter((s) => s.date === rec.date).length === 0 ? (
                                        <p className="text-stone-400 text-[11px]">No sales recorded on this date.</p>
                                      ) : (
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                          {sales
                                            .filter((s) => s.date === rec.date)
                                            .map((s) => {
                                              const cashAmt = getSaleCashAmount(s);
                                              const trfAmt = getSaleBankTransferAmount(s);
                                              return (
                                                <div
                                                  key={s.id}
                                                  className="p-1.5 rounded bg-white border border-stone-200 text-[11px]"
                                                >
                                                  <div className="flex justify-between font-semibold">
                                                    <span>{s.receiptNumber || 'Ticket'}</span>
                                                    <span>{formatCurrency(s.totalAmount, settings.currencySymbol)}</span>
                                                  </div>
                                                  <div className="flex justify-between text-stone-500 text-[10px]">
                                                    <span>{s.customerName || 'Walk-in'}</span>
                                                    <span>
                                                      {cashAmt > 0 && `Cash: ${formatCurrency(cashAmt)} `}
                                                      {trfAmt > 0 && `Trf: ${formatCurrency(trfAmt)}`}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                        </div>
                                      )}
                                    </div>

                                    {/* Column 2: Purchases on this date */}
                                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                                      <span className="font-bold text-stone-900 block border-b border-stone-200 pb-1">
                                        Purchases on this Date ({purchases.filter((p) => p.date === rec.date).length})
                                      </span>
                                      {purchases.filter((p) => p.date === rec.date).length === 0 ? (
                                        <p className="text-stone-400 text-[11px]">No purchases recorded on this date.</p>
                                      ) : (
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                          {purchases
                                            .filter((p) => p.date === rec.date)
                                            .map((p) => (
                                              <div
                                                key={p.id}
                                                className={`p-1.5 rounded border text-[11px] ${
                                                  p.paymentMethod === 'cash'
                                                    ? 'bg-amber-50/60 border-amber-200'
                                                    : 'bg-white border-stone-200'
                                                }`}
                                              >
                                                <div className="flex justify-between font-semibold">
                                                  <span>{p.invoiceNumber || 'No Inv #'}</span>
                                                  <span
                                                    className={
                                                      p.paymentMethod === 'cash'
                                                        ? 'text-amber-900 font-bold'
                                                        : 'text-stone-700'
                                                    }
                                                  >
                                                    {formatCurrency(p.totalAmount, settings.currencySymbol)}
                                                  </span>
                                                </div>
                                                <div className="flex justify-between text-stone-500 text-[10px]">
                                                  <span>{p.vendorName}</span>
                                                  <span className="font-semibold uppercase">
                                                    {p.paymentMethod === 'cash' ? '💵 Cash Paid' : '🏦 Bank Transfer'}
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Column 3: Bank Statement Deposits on this date */}
                                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                                      <span className="font-bold text-stone-900 block border-b border-stone-200 pb-1">
                                        Bank Credits / Deposits ({bankTransactions.filter((tx) => tx.date === rec.date && tx.type === 'credit').length})
                                      </span>
                                      {bankTransactions.filter((tx) => tx.date === rec.date && tx.type === 'credit').length === 0 ? (
                                        <p className="text-stone-400 text-[11px]">No bank deposits recorded on this date.</p>
                                      ) : (
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                          {bankTransactions
                                            .filter((tx) => tx.date === rec.date && tx.type === 'credit')
                                            .map((tx) => (
                                              <div
                                                key={tx.id}
                                                className="p-1.5 rounded bg-emerald-50/60 border border-emerald-200 text-[11px]"
                                              >
                                                <div className="flex justify-between font-semibold text-emerald-950">
                                                  <span className="truncate max-w-[120px]">{tx.description}</span>
                                                  <span className="font-bold">+{formatCurrency(tx.amount, settings.currencySymbol)}</span>
                                                </div>
                                                <div className="flex justify-between text-stone-500 text-[10px]">
                                                  <span>Ref: {tx.referenceId || 'CBE'}</span>
                                                  <span>{tx.category}</span>
                                                </div>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: MoR AUDIT CHECKLIST (2019) ===================== */}
      {activeEngineTab === 'mor_checklist' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <h3 className="font-bold text-stone-900 text-sm">
                MoR Statutory Audit Program Checklist (2019 Revision)
              </h3>
              <p className="text-stone-600 mt-0.5">
                Evaluates your books against Proclamations 983/2016, 979/2016, VAT 285/2002, and Regulation 410/2017.
              </p>
            </div>
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-semibold text-stone-800 hover:bg-stone-100 shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-orange-700" />
              <span>Read Full Legal Articles</span>
            </button>
          </div>

          <div className="space-y-3">
            {morChecklist.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  item.status === 'passed'
                    ? 'bg-white border-stone-200'
                    : item.status === 'warning'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-red-50/50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {item.status === 'passed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : item.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-orange-800 block">
                        {item.legalRef}
                      </span>
                      <h4 className="font-bold text-stone-900 text-sm">{item.title}</h4>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      item.status === 'passed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {item.status === 'passed' ? 'Compliant' : item.status === 'warning' ? 'Audit Warning' : 'Action Required'}
                  </span>
                </div>

                <p className="text-stone-700 pl-6.5 leading-relaxed">{item.description}</p>

                <div className="pl-6.5 pt-1.5 border-t border-stone-100 text-stone-600 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                  <span>
                    <strong>MoR Standard:</strong> {item.auditStandard}
                  </span>
                  <span className="font-medium text-stone-900">{item.details}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== TAB 3: INDIRECT AUDIT METHODS (CH. 6) ===================== */}
      {activeEngineTab === 'indirect_methods' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
            <h3 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-orange-700" />
              Chapter 6: MoR Indirect Audit Methods Simulator
            </h3>
            <p className="text-stone-700 text-xs mt-1 leading-relaxed">
              When Ministry of Revenues auditors suspect unrecorded sales or incomplete records, they apply indirect investigation methodologies. Use this simulator to anticipate auditor adjustments before an audit occurs.
            </p>
          </div>

          {/* Method 1: Bank Deposit Analysis */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                  MoR Manual Section 6.2
                </span>
                <h4 className="text-base font-bold text-stone-900">
                  Method 1: Bank Deposit Analysis
                </h4>
              </div>
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold ${
                  bankDepositAnalysis.riskStatus === 'low_risk'
                    ? 'bg-emerald-100 text-emerald-800'
                    : bankDepositAnalysis.riskStatus === 'moderate_risk'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {bankDepositAnalysis.riskStatus === 'low_risk' ? 'Low Audit Risk' : 'Discrepancy Flagged'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Total Bank Credits:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(bankDepositAnalysis.totalBankDeposits, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Non-Income Deposits:</span>
                <span className="font-bold text-stone-600 font-tabular text-sm mt-0.5 block">
                  -{formatCurrency(bankDepositAnalysis.identifiedNonIncomeDeposits, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Reported Book Sales:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(bankDepositAnalysis.reportedBookSales, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Auditor Gap (Excess):</span>
                <span
                  className={`font-bold font-tabular text-sm mt-0.5 block ${
                    bankDepositAnalysis.unexplainedVariance > 1000
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(bankDepositAnalysis.unexplainedVariance, settings.currencySymbol)}
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-600 p-3 rounded-xl bg-stone-50 border border-stone-200 leading-relaxed">
              <strong>Auditor Assessment:</strong> {bankDepositAnalysis.auditorNotes}
            </p>
          </div>

          {/* Method 2: Markup & Gross Profit Margin Test */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-200 gap-2">
              <div>
                <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                  MoR Manual Section 6.3
                </span>
                <h4 className="text-base font-bold text-stone-900">
                  Method 2: Gross Profit Margin &amp; Markup Test
                </h4>
              </div>

              {/* Sector Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500">Sector Benchmark:</span>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800"
                >
                  {SECTOR_BENCHMARKS.map((sec) => (
                    <option key={sec.code} value={sec.code}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Actual Net Sales:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(markupTest.totalNetSales, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Actual Cost of Goods:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(markupTest.costOfPurchases, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Your Gross Margin:</span>
                <span className="font-bold text-orange-700 font-tabular text-sm mt-0.5 block">
                  {(markupTest.actualGrossMarginPercent * 100).toFixed(1)}% (Markup: {(markupTest.actualMarkupPercent * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Sector Benchmark Range:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {(markupTest.benchmark.typicalGrossMarginMin * 100).toFixed(0)}% &ndash; {(markupTest.benchmark.typicalGrossMarginMax * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-600 p-3 rounded-xl bg-stone-50 border border-stone-200 leading-relaxed">
              <strong>Auditor Finding:</strong> {markupTest.auditorFinding}
            </p>
          </div>

          {/* Method 3: Source and Application of Funds */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                  MoR Manual Section 6.4
                </span>
                <h4 className="text-base font-bold text-stone-900">
                  Method 3: Source &amp; Application of Funds (Cash Flow Test)
                </h4>
              </div>
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold ${
                  !sourceAndApp.cashDeficitFlag
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {!sourceAndApp.cashDeficitFlag ? 'Adequate Funds' : 'Excess Outflow Anomaly'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Total Sourced Cash / Inflows:</span>
                <span className="font-bold text-emerald-700 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(sourceAndApp.totalKnownInflows, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Total Applied Cash / Outflows:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(sourceAndApp.totalKnownOutflows, settings.currencySymbol)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block">Net Sourced Balance:</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(sourceAndApp.netCashFlow, settings.currencySymbol)}
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-600 p-3 rounded-xl bg-stone-50 border border-stone-200 leading-relaxed">
              <strong>Auditor Rule:</strong> {sourceAndApp.auditorNotes}
            </p>
          </div>
        </div>
      )}

      {/* ===================== TAB 4: PENALTIES SIMULATOR (PROC. 983) ===================== */}
      {activeEngineTab === 'penalties' && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-red-50 border border-red-200">
            <h3 className="font-bold text-red-950 text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-700" />
              Proclamation No. 983/2016 Penalty &amp; Interest Exposure Simulator
            </h3>
            <p className="text-red-900 text-xs mt-1 leading-relaxed">
              If an MoR auditor disallows missing receipts or adjusts sales using indirect markup, statutory penalties under Proclamation 983/2016 will be added to the principal tax:
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <h4 className="font-bold text-stone-900 text-sm pb-2 border-b border-stone-200">
              Potential Audit Assessment Breakdown
            </h4>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-stone-700">
                <span>Principal Understated Tax (Profit Tax + VAT):</span>
                <span className="font-tabular font-bold text-stone-900">
                  {formatCurrency(penaltySimulation.understatedTaxAmount, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-700">
                <span>
                  Understatement Penalty (Art. 109 - {Math.round(penaltySimulation.understatementPenaltyRate * 100)}%):
                </span>
                <span className="font-tabular font-bold text-red-700">
                  +{formatCurrency(penaltySimulation.understatementPenaltyAmount, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-700">
                <span>Failure to Maintain Records Penalty (Art. 110 - 20%):</span>
                <span className="font-tabular font-bold text-red-700">
                  +{formatCurrency(penaltySimulation.bookkeepingPenaltyAmount, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-700">
                <span>Non-Issuance of Fiscal Receipts (Art. 113):</span>
                <span className="font-tabular font-bold text-red-700">
                  +{formatCurrency(penaltySimulation.esrmReceiptViolationPenalty, settings.currencySymbol)}
                </span>
              </div>

              <div className="flex justify-between text-stone-700">
                <span>Late Payment Interest (Art. 44 - NBE Lending Rate + 2% p.a.):</span>
                <span className="font-tabular font-bold text-red-700">
                  +{formatCurrency(penaltySimulation.estimatedLateInterestAmount, settings.currencySymbol)}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs mt-3">
                <div>
                  <span className="font-bold text-red-950 block text-sm">
                    Total Potential MoR Assessment Exposure
                  </span>
                  <span className="text-xs text-red-800">
                    Principal Tax + Penalties + Interest
                  </span>
                </div>
                <span className="text-lg font-bold text-red-900 font-tabular">
                  {formatCurrency(penaltySimulation.totalPotentialAssessment, settings.currencySymbol)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-200">
              <h5 className="font-bold text-stone-900 text-xs mb-1.5">Applicable Legal Citations:</h5>
              <div className="space-y-1">
                {penaltySimulation.legalArticles.map((art, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-stone-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-700 shrink-0" />
                    <span>{art}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 5: WORKING PAPERS SCHEDULE ===================== */}
      {activeEngineTab === 'working_papers' && (
        <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
          <div className="flex items-start justify-between pb-3 border-b border-stone-200">
            <div>
              <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                Official Working Paper Standard
              </span>
              <h3 className="text-base font-bold text-stone-900">
                Ministry of Revenues Audit Working Paper Schedule
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Formatted according to MoR Audit Manual Schedule standards for presentation to tax inspectors
              </p>
            </div>
            <button
              onClick={handlePrintDossier}
              className="px-3.5 py-2 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Working Paper</span>
            </button>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100 border-b border-stone-300 text-left text-stone-700">
                <th className="py-2.5 px-3 font-bold">Schedule</th>
                <th className="py-2.5 px-3 font-bold">Legal Authority</th>
                <th className="py-2.5 px-3 font-bold">Count</th>
                <th className="py-2.5 px-3 font-bold text-right">Taxable Subtotal</th>
                <th className="py-2.5 px-3 font-bold text-right">VAT / Duty (15%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900">Schedule A: Sales Book</td>
                <td className="py-2 px-3 text-stone-600">Proc. 285/2002 Art. 7</td>
                <td className="py-2 px-3">{sales.length} Sales</td>
                <td className="py-2 px-3 text-right font-bold">{formatCurrency(totalNetSales, settings.currencySymbol)}</td>
                <td className="py-2 px-3 text-right text-emerald-700">{formatCurrency(totalSalesTaxCollected, settings.currencySymbol)}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900">Schedule B: Purchases &amp; COGS</td>
                <td className="py-2 px-3 text-stone-600">Proc. 979/2016 Art. 21</td>
                <td className="py-2 px-3">{purchases.length} Invoices</td>
                <td className="py-2 px-3 text-right font-bold">{formatCurrency(totalDeductibleExpenses, settings.currencySymbol)}</td>
                <td className="py-2 px-3 text-right text-stone-800">{formatCurrency(totalInputTaxPaid, settings.currencySymbol)}</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-900">Schedule C: 3-Way Bank Accounts</td>
                <td className="py-2 px-3 text-stone-600">MoR Manual Ch. 6</td>
                <td className="py-2 px-3">{bankTransactions.length} Txs</td>
                <td className="py-2 px-3 text-right font-bold">{formatCurrency(totalBankInflows, settings.currencySymbol)}</td>
                <td className="py-2 px-3 text-right text-stone-500">Reconciled</td>
              </tr>
              <tr className="bg-stone-50 font-bold">
                <td className="py-2.5 px-3 text-stone-900">Net Tax Due to MoR</td>
                <td className="py-2.5 px-3 text-stone-600">VAT + 30% Profit Tax</td>
                <td className="py-2.5 px-3" colSpan={2}>
                  Profit: {formatCurrency(taxableProfit, settings.currencySymbol)}
                </td>
                <td className="py-2.5 px-3 text-right text-orange-800 font-black">
                  {formatCurrency(totalTaxObligation, settings.currencySymbol)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-stone-600 text-xs">
            <h5 className="font-bold text-stone-900 mb-1">Auditor Working Paper Declaration:</h5>
            <p className="leading-relaxed">
              This working paper summary has been compiled in accordance with the Ethiopian Ministry of Revenues Tax Audit Manual guidelines. All revenue records correspond to sequentially numbered sales tickets, and all deductible purchase invoices comply with Article 21 of the VAT Proclamation and Articles 22–27 of the Federal Income Tax Proclamation.
            </p>
          </div>
        </div>
      )}

      {/* Printable MoR Working Paper Dossier (Only visible in Print) */}
      <div className="p-5 rounded-2xl bg-white text-stone-900 border border-stone-300 shadow-xl space-y-4 print-only hidden">
        <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-stone-900">
              Federal Democratic Republic of Ethiopia
            </h1>
            <h2 className="text-sm font-bold text-stone-700">
              Ministry of Revenues (MoR) &middot; Tax Audit Working Paper Dossier
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Reference: MoR Tax Audit Manual (2019 Revision) &middot; Proclamation 983/2016 &amp; 979/2016
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">{settings.businessName}</p>
            <p className="font-mono text-stone-600">TIN: {settings.taxIdNumber}</p>
            <p className="text-[10px] text-stone-500">Date Printed: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Print Summary Table */}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-stone-100 border-b border-stone-300 text-left">
              <th className="py-2 px-3 font-bold">Schedule</th>
              <th className="py-2 px-3 font-bold">Entries</th>
              <th className="py-2 px-3 font-bold text-right">Taxable Amount</th>
              <th className="py-2 px-3 font-bold text-right">15% VAT / Tax</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            <tr>
              <td className="py-2 px-3 font-semibold">Schedule A: Sales Book (Output VAT)</td>
              <td className="py-2 px-3">{sales.length} Entries</td>
              <td className="py-2 px-3 text-right font-bold">{formatCurrency(totalNetSales, settings.currencySymbol)}</td>
              <td className="py-2 px-3 text-right text-emerald-700">{formatCurrency(totalSalesTaxCollected, settings.currencySymbol)}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold">Schedule B: Purchases &amp; Allowable Deductions</td>
              <td className="py-2 px-3">{purchases.length} Invoices</td>
              <td className="py-2 px-3 text-right font-bold">{formatCurrency(totalDeductibleExpenses, settings.currencySymbol)}</td>
              <td className="py-2 px-3 text-right text-stone-800">{formatCurrency(totalInputTaxPaid, settings.currencySymbol)}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold">Schedule C: Taxable Profit &amp; Total Due</td>
              <td className="py-2 px-3">Sales minus Deductible Costs</td>
              <td className="py-2 px-3 text-right font-black">{formatCurrency(taxableProfit, settings.currencySymbol)}</td>
              <td className="py-2 px-3 text-right font-black">Due: {formatCurrency(totalTaxObligation, settings.currencySymbol)}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-semibold">Schedule D: Daily Cash Sales, Cash Purchases &amp; Bank Deposit Audit (Ch. 6)</td>
              <td className="py-2 px-3">{dailyCashAudit.totalDaysExamined} Days Reconciled</td>
              <td className="py-2 px-3 text-right font-bold">
                Need to Bank: {formatCurrency(dailyCashAudit.netCashRequiredToBeDeposited, settings.currencySymbol)}
              </td>
              <td className="py-2 px-3 text-right font-bold text-emerald-800">
                Banked: {formatCurrency(dailyCashAudit.totalActualBankDeposits, settings.currencySymbol)} (Vault: {formatCurrency(dailyCashAudit.netUndepositedCashBalance, settings.currencySymbol)})
              </td>
            </tr>
          </tbody>
        </table>

        {/* Sign-off Box */}
        <div className="pt-6 border-t border-stone-300 grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="font-bold text-stone-800">Taxpayer / Accountant Attestation:</p>
            <p className="text-[11px] text-stone-600 mt-1">
              I certify under penalty of perjury that this tax report and accompanying working papers accurately reflect true sales, genuine supplier tax invoices, and bank statements in compliance with Ethiopian tax laws.
            </p>
            <div className="mt-8 pt-1 border-t border-stone-400 w-48 text-[10px] text-stone-500">
              Taxpayer Signature / Date
            </div>
          </div>

          <div>
            <p className="font-bold text-stone-800">MoR Tax Auditor Verification:</p>
            <div className="mt-2 h-20 w-48 rounded border-2 border-dashed border-stone-300 flex items-center justify-center text-[10px] text-stone-400 font-mono">
              [MoR Branch Stamp &amp; Signature]
            </div>
          </div>
        </div>
      </div>

      {/* MoR Tax Audit Manual Guide Modal */}
      <TaxAuditManualModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onLaunchSimulators={() => setActiveEngineTab('indirect_methods')}
      />
    </div>
  );
};
