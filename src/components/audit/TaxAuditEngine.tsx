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
  HeartHandshake,
  Lightbulb,
  Check,
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
import {
  auditBankReasonAndCategory,
  exportBankAuditFindingsCSV,
  BankAuditFinding,
  AuditClassification,
} from '../../utils/bankAuditEngine';
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
    | 'bank_reason_category'
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
  const [isCashFormulaOpen, setIsCashFormulaOpen] = useState(false);
  const [isFriendlyAdviceOpen, setIsFriendlyAdviceOpen] = useState(true);

  // Bank Reason & Category Forensic Audit State
  const [bankAuditSearch, setBankAuditSearch] = useState('');
  const [bankAuditRiskFilter, setBankAuditRiskFilter] = useState<
    'all' | 'high' | 'medium' | 'compliant'
  >('all');
  const [bankAuditFlowFilter, setBankAuditFlowFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [bankAuditClassificationFilter, setBankAuditClassificationFilter] = useState<
    'all' | AuditClassification
  >('all');

  // Compute Daily Cash Reconciliation
  const dailyCashAudit = useMemo(() => {
    return calculateDailyCashExamination(sales, purchases, bankTransactions, dailyCloses);
  }, [sales, purchases, bankTransactions, dailyCloses]);

  // Compute Bank Reason & Category Forensic Audit
  const bankReasonAudit = useMemo(() => {
    return auditBankReasonAndCategory(
      bankTransactions,
      sales,
      purchases,
      settings.corporateTaxRate,
      settings.defaultSalesTaxRate
    );
  }, [bankTransactions, sales, purchases, settings.corporateTaxRate, settings.defaultSalesTaxRate]);

  // Filtered Bank Audit Findings
  const filteredBankFindings = useMemo(() => {
    return bankReasonAudit.findings.filter((finding) => {
      if (bankAuditRiskFilter !== 'all' && finding.riskLevel !== bankAuditRiskFilter) {
        return false;
      }
      if (bankAuditFlowFilter !== 'all' && finding.type !== bankAuditFlowFilter) {
        return false;
      }
      if (
        bankAuditClassificationFilter !== 'all' &&
        finding.auditClassification !== bankAuditClassificationFilter
      ) {
        return false;
      }
      if (bankAuditSearch.trim()) {
        const query = bankAuditSearch.toLowerCase();
        const inReason = (finding.reason || '').toLowerCase().includes(query);
        const inDesc = (finding.description || '').toLowerCase().includes(query);
        const inTitle = (finding.findingTitle || '').toLowerCase().includes(query);
        const inArticle = (finding.proclamationArticle || '').toLowerCase().includes(query);
        const inCategory = (finding.category || '').toLowerCase().includes(query);
        if (!inReason && !inDesc && !inTitle && !inArticle && !inCategory) {
          return false;
        }
      }
      return true;
    });
  }, [
    bankReasonAudit.findings,
    bankAuditRiskFilter,
    bankAuditFlowFilter,
    bankAuditClassificationFilter,
    bankAuditSearch,
  ]);

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
          onClick={() => setActiveEngineTab('bank_reason_category')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
            activeEngineTab === 'bank_reason_category'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Landmark className="w-3.5 h-3.5 text-blue-500" />
          <span>Bank Reason &amp; Category Audit</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 ml-0.5">
            {bankReasonAudit.findings.length} Txns
          </span>
          {bankReasonAudit.highRiskCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white ml-0.5">
              {bankReasonAudit.highRiskCount} Risk
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

          {/* Bank Reason & Category Forensic Audit Card */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-stone-900">
                      Bank Reason &amp; Category Examination
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                      Proc. 979 Art. 17 &amp; 27
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    Audit of bank deposit reasons (memos) and expense categories under MoR Indirect Audit directives
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveEngineTab('bank_reason_category')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <span>Open Forensic View</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block text-[11px]">Total Bank Deposits</span>
                <span className="font-bold text-stone-900 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(bankReasonAudit.totalBankCredits, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-stone-400">Total inflows audited</span>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block text-[11px]">Verified Non-Income</span>
                <span className="font-bold text-emerald-700 font-tabular text-sm mt-0.5 block">
                  {formatCurrency(bankReasonAudit.verifiedNonTaxableInflows, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-emerald-600">Loans, Equity &amp; Transfers</span>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block text-[11px]">Unexplained Deposits</span>
                <span
                  className={`font-bold font-tabular text-sm mt-0.5 block ${
                    bankReasonAudit.unexplainedDepositsAmount > 0 ? 'text-rose-700' : 'text-stone-900'
                  }`}
                >
                  {formatCurrency(bankReasonAudit.unexplainedDepositsAmount, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-rose-600">
                  {bankReasonAudit.unexplainedDepositsCount} txns (Taxable risk)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                <span className="text-stone-500 block text-[11px]">Art. 27 Disallowed Drawings</span>
                <span
                  className={`font-bold font-tabular text-sm mt-0.5 block ${
                    bankReasonAudit.disallowedPersonalDrawingsAmount > 0
                      ? 'text-amber-700'
                      : 'text-stone-900'
                  }`}
                >
                  {formatCurrency(
                    bankReasonAudit.disallowedPersonalDrawingsAmount,
                    settings.currencySymbol
                  )}
                </span>
                <span className="text-[10px] text-amber-700">
                  {bankReasonAudit.disallowedPersonalDrawingsCount} personal items
                </span>
              </div>
            </div>

            {bankReasonAudit.totalTaxRiskExposure > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span className="text-rose-900">
                    <strong>MoR Presumption Exposure:</strong> Unexplained deposits &amp; Art. 27 drawings create an estimated{' '}
                    <strong>{formatCurrency(bankReasonAudit.totalTaxRiskExposure, settings.currencySymbol)}</strong> tax &amp; penalty risk if left unlinked.
                  </span>
                </div>
                <button
                  onClick={() => setActiveEngineTab('bank_reason_category')}
                  className="px-2.5 py-1 rounded bg-rose-700 text-white font-semibold text-[11px] hover:bg-rose-800 shrink-0 cursor-pointer self-start sm:self-auto"
                >
                  Review Flagged Items
                </button>
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

              {/* 4. Bank Deposits & Cash in Safe */}
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between text-stone-500">
                  <span>4. Actual Bank Deposits Recorded:</span>
                  <span className="font-semibold text-stone-800 font-tabular text-[11px]">
                    {dailyCashAudit.depositComplianceRate}% Banked
                  </span>
                </div>
                <div className="text-base font-bold text-emerald-800 font-tabular">
                  {formatCurrency(dailyCashAudit.totalActualBankDeposits, settings.currencySymbol)}
                </div>
                <div className="text-[11px] space-y-1 pt-1.5 border-t border-stone-100">
                  <div className="flex justify-between items-center">
                    <span className="text-stone-600 font-medium">Cash in Safe/Drawer:</span>
                    <span
                      className={`font-bold font-tabular ${
                        Math.abs(dailyCashAudit.netUndepositedCashBalance) <= 5000
                          ? 'text-emerald-700'
                          : dailyCashAudit.netUndepositedCashBalance > 5000
                          ? 'text-amber-800'
                          : 'text-indigo-700'
                      }`}
                    >
                      {formatCurrency(dailyCashAudit.netUndepositedCashBalance, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-stone-500">Safe Status:</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold ${
                        dailyCashAudit.netUndepositedCashBalance > 5000
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : dailyCashAudit.netUndepositedCashBalance < -5000
                          ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      }`}
                    >
                      {dailyCashAudit.netUndepositedCashBalance > 5000
                        ? 'Cash in Safe (To Bank)'
                        : dailyCashAudit.netUndepositedCashBalance < -5000
                        ? 'Bank Deposits Exceed Cash'
                        : 'Reconciled Normal Float'}
                    </span>
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

            {/* Advice as a Friend Spotlight Callout */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50 border border-emerald-200/90 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-950">Advice as a Friend: What To Do Right Now</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200/80 text-emerald-800 uppercase tracking-wide">
                      Accountant Tip
                    </span>
                  </div>
                  <p className="text-emerald-900 text-xs mt-0.5 font-medium leading-relaxed">
                    {dailyCashAudit.friendlyAdvice.summaryMessage}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveEngineTab('daily_cash')}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer shadow-2xs"
              >
                <span>Read Friendly Advice</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
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
                <span className="text-stone-500 font-medium">3. Net Cash from Operations (To Deposit)</span>
                <div className="text-lg font-bold text-orange-700 font-tabular">
                  {formatCurrency(dailyCashAudit.netCashRequiredToBeDeposited, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-100 flex justify-between">
                  <span>Formula:</span>
                  <span className="font-mono text-stone-800">Cash Sales &minus; Cash Purchases</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium">4. Actual Banked &amp; Cash in Safe</span>
                <div className="text-lg font-bold text-emerald-800 font-tabular">
                  {formatCurrency(dailyCashAudit.totalActualBankDeposits, settings.currencySymbol)}
                </div>
                <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-100 flex justify-between">
                  <span>Cash in Safe/Drawer:</span>
                  <span
                    className={`font-bold font-tabular ${
                      Math.abs(dailyCashAudit.netUndepositedCashBalance) <= 5000
                        ? 'text-emerald-700'
                        : dailyCashAudit.netUndepositedCashBalance > 5000
                        ? 'text-amber-800'
                        : 'text-indigo-700'
                    }`}
                  >
                    {formatCurrency(dailyCashAudit.netUndepositedCashBalance, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Advice as a Friend: What You Should Do Right Now */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white border border-emerald-200/90 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/70">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <HeartHandshake className="w-5 h-5 text-emerald-100" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-900 rounded uppercase tracking-wider">
                      Practical Guidance &middot; Advice as a Friend
                    </span>
                    <span className="text-[11px] text-stone-500 font-medium">
                      Friendly Accountant Consultation
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-stone-900 mt-0.5">
                    {dailyCashAudit.friendlyAdvice.headline}
                  </h3>
                  <p className="text-xs text-stone-600">
                    {dailyCashAudit.friendlyAdvice.subheadline}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => setIsFriendlyAdviceOpen(!isFriendlyAdviceOpen)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{isFriendlyAdviceOpen ? 'Collapse Advice' : 'Expand Advice (4 Tips)'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-emerald-700 transition-transform ${
                      isFriendlyAdviceOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Top Priority Highlight Callout */}
            <div className="p-3.5 rounded-xl bg-white border border-emerald-200 flex items-start gap-2.5 text-xs text-stone-700 shadow-2xs">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-950 font-bold">Accountant&apos;s Immediate Priority: </strong>
                <span className="text-stone-800">{dailyCashAudit.friendlyAdvice.summaryMessage}</span>
              </div>
            </div>

            {/* Advice Grid Cards */}
            {isFriendlyAdviceOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {dailyCashAudit.friendlyAdvice.items.map((item) => {
                  const isHighUrgency = item.urgency === 'high';
                  const isGoodNews = item.urgency === 'good_news';

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition ${
                        isHighUrgency
                          ? 'bg-rose-50/40 border-rose-200'
                          : isGoodNews
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-white border-stone-200'
                      }`}
                    >
                      <div className="space-y-2.5">
                        {/* Card Header & Urgency Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                isHighUrgency
                                  ? 'bg-rose-100 text-rose-800'
                                  : isGoodNews
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.category === 'cash_in_safe' && <Wallet className="w-4 h-4" />}
                              {item.category === 'bank_surplus' && <Landmark className="w-4 h-4" />}
                              {item.category === 'cash_limit' && <Scale className="w-4 h-4" />}
                              {item.category === 'general' &&
                                (item.icon === 'receipt' ? (
                                  <FileText className="w-4 h-4" />
                                ) : (
                                  <ShieldCheck className="w-4 h-4" />
                                ))}
                            </span>
                            <h4 className="font-bold text-xs sm:text-sm text-stone-900 leading-snug">
                              {item.title}
                            </h4>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 uppercase tracking-wide ${
                              isHighUrgency
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : isGoodNews
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {isHighUrgency
                              ? 'High Priority'
                              : isGoodNews
                              ? 'Clean & Safe'
                              : 'Recommended Habit'}
                          </span>
                        </div>

                        {/* Conversational Advice Text */}
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {item.advice}
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-stone-100">
                        {/* Why it Matters Context */}
                        <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-[11px] text-stone-600 flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                          <span>
                            <strong>Why this matters: </strong>
                            {item.whyItMatters}
                          </span>
                        </div>

                        {/* Action Button */}
                        {item.actionButton && (
                          <div className="pt-1 flex justify-end">
                            <button
                              onClick={() => {
                                if (item.actionButton?.actionType === 'record_close') {
                                  onOpenDailyClose?.();
                                } else if (item.actionButton?.targetTab) {
                                  setActiveTab(item.actionButton.targetTab);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                                isHighUrgency
                                  ? 'bg-rose-700 hover:bg-rose-800 text-white'
                                  : 'bg-stone-800 hover:bg-stone-900 text-white'
                              }`}
                            >
                              <span>{item.actionButton.label}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detailed Undeposited Cash on Hand Calculation Method & Audit Guide */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                  Σ
                </div>
                <div>
                  <h4 className="font-bold text-stone-900 text-xs sm:text-sm">
                    Calculation Method: Undeposited Cash On Hand (Physical Safe Triangulation)
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    How physical cash remaining in the store safe is calculated and audited under MoR Chapter 6
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCashFormulaOpen(!isCashFormulaOpen)}
                className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
              >
                <span>{isCashFormulaOpen ? 'Hide Explanation Guide' : 'Explain How This is Calculated'}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isCashFormulaOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {/* Step-by-Step Formula Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-semibold block uppercase">1. Cash Sales</span>
                <span className="font-bold text-emerald-900 font-tabular text-sm mt-0.5 block">
                  +{formatCurrency(dailyCashAudit.grandCashSales, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-emerald-700">Cash received from sales</span>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-[10px] text-amber-800 font-semibold block uppercase">2. Cash Purchases</span>
                <span className="font-bold text-amber-900 font-tabular text-sm mt-0.5 block">
                  -{formatCurrency(dailyCashAudit.grandCashPurchases, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-amber-700">Cash spent on goods/petty cash</span>
              </div>

              <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200">
                <span className="text-[10px] text-orange-800 font-semibold block uppercase">3. Net Cash to Bank</span>
                <span className="font-bold text-orange-900 font-tabular text-sm mt-0.5 block">
                  ={formatCurrency(dailyCashAudit.netCashRequiredToBeDeposited, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-orange-700">Net cash generated to deposit</span>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-[10px] text-blue-800 font-semibold block uppercase">4. Bank Deposits</span>
                <span className="font-bold text-blue-900 font-tabular text-sm mt-0.5 block">
                  -{formatCurrency(dailyCashAudit.totalActualBankDeposits, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-blue-700">Sales deposits into bank</span>
              </div>

              <div className="p-2.5 rounded-xl bg-stone-900 text-white shadow-xs">
                <span className="text-[10px] text-amber-300 font-semibold block uppercase">5. Cash in Safe/Drawer</span>
                <span className="font-bold text-amber-300 font-tabular text-sm mt-0.5 block">
                  ={formatCurrency(dailyCashAudit.netUndepositedCashBalance, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-stone-300">
                  {dailyCashAudit.netUndepositedCashBalance >= 0 ? 'Physical cash in safe' : 'Bank deposit surplus'}
                </span>
              </div>
            </div>

            {/* Expandable Interpretation Guide */}
            {isCashFormulaOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-stone-100 text-[11px] leading-relaxed">
                <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    <span>Positive Balance (&gt; 0 ETB): Cash in Safe</span>
                  </div>
                  <p className="text-amber-800">
                    Represents physical paper money collected from sales that has not yet been taken to the bank. During an MoR tax inspection, examiners verify the cash register drawer and office safe. If this physical cash is not in the safe, auditors assess it as personal drawings or undeclared distribution.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span>Balanced Float (&plusmn;5,000 ETB): Reconciled</span>
                  </div>
                  <p className="text-emerald-800">
                    Cash collected matches bank deposits closely. The retained balance represents normal daily retail working change (drawer float) required to operate transactions. Fully compliant with tax audit guidelines.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                    <span>Negative Balance (&lt; 0 ETB): Deposit Surplus</span>
                  </div>
                  <p className="text-indigo-800">
                    Bank deposits exceed registered cash sales. Under MoR Chapter 6 Indirect Audits, examiners investigate whether: (a) customers paid directly via bank transfer, (b) owner personal savings/loans were banked, or (c) cash sales were under-reported on cash register slips.
                  </p>
                </div>
              </div>
            )}
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
                    <th className="py-3 px-3.5 whitespace-nowrap text-right bg-stone-50 border-l border-stone-200">
                      Cash in Safe / Drawer<br />
                      <span className="font-normal text-[10px] text-stone-500">
                        (Undeposited Cash on Hand)
                      </span>
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

                            {/* Cash in Safe / Drawer (Undeposited Cash On Hand) */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-50/80 border-l border-stone-200">
                              <div
                                className={`font-bold font-tabular text-xs ${
                                  Math.abs(rec.undepositedCashOnHand) <= 5000
                                    ? 'text-emerald-700'
                                    : rec.undepositedCashOnHand > 5000
                                    ? 'text-amber-800'
                                    : 'text-indigo-700'
                                }`}
                              >
                                {formatCurrency(rec.undepositedCashOnHand, settings.currencySymbol)}
                              </div>
                              <div className="mt-0.5">
                                {rec.cashOnHandStatus === 'in_safe_pending_deposit' ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                    In Safe (To Bank)
                                  </span>
                                ) : rec.cashOnHandStatus === 'excess_bank_deposit' ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    Deposit Surplus
                                  </span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Reconciled Float
                                  </span>
                                )}
                              </div>
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

                                  {/* Friend's Daily Tip */}
                                  {rec.friendlyTip && (
                                    <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-950 shadow-2xs">
                                      <HeartHandshake className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                                      <div>
                                        <strong className="font-bold text-emerald-900">Advice as a Friend for {rec.dayOfWeek}: </strong>
                                        <span className="text-emerald-800">{rec.friendlyTip}</span>
                                      </div>
                                    </div>
                                  )}

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

                                  {/* Step-by-Step Cash On Hand Calculation Box */}
                                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-bold text-amber-950">
                                      <span>Safe Vault &amp; Bank Reconciliation Math &middot; {formatDate(rec.date)}</span>
                                      <span className="font-mono text-[11px] text-amber-900 font-semibold">
                                        {rec.cashOnHandStatus === 'in_safe_pending_deposit'
                                          ? '🟡 In Safe (Pending Bank Deposit)'
                                          : rec.cashOnHandStatus === 'excess_bank_deposit'
                                          ? '🔵 Bank Deposit Surplus'
                                          : '🟢 Reconciled Normal Float'}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px] bg-white p-2.5 rounded-lg border border-amber-100 font-mono">
                                      <div>
                                        <span className="text-stone-400 block text-[9px] uppercase">Cash Sales Today</span>
                                        <span className="text-emerald-700 font-bold font-tabular">+{formatCurrency(rec.cashSales)}</span>
                                      </div>
                                      <div>
                                        <span className="text-stone-400 block text-[9px] uppercase">Cash Purchases</span>
                                        <span className="text-amber-800 font-bold font-tabular">-{formatCurrency(rec.cashPurchases)}</span>
                                      </div>
                                      <div>
                                        <span className="text-stone-400 block text-[9px] uppercase">Net Cash Today</span>
                                        <span className="text-stone-800 font-bold font-tabular">={formatCurrency(rec.dailyCashToDeposit)}</span>
                                      </div>
                                      <div>
                                        <span className="text-stone-400 block text-[9px] uppercase">Prior Net Total</span>
                                        <span className="text-stone-600 font-medium font-tabular">+{formatCurrency(rec.priorCumulativeCashToDeposit)}</span>
                                      </div>
                                      <div>
                                        <span className="text-stone-400 block text-[9px] uppercase">Cumulative Banked</span>
                                        <span className="text-blue-700 font-bold font-tabular">-{formatCurrency(rec.cumulativeBankDeposits)}</span>
                                      </div>
                                      <div className="border-l border-amber-200 pl-2">
                                        <span className="text-stone-400 block text-[9px] uppercase">Cash in Safe Today</span>
                                        <span className={`font-bold font-tabular ${rec.undepositedCashOnHand >= 0 ? 'text-amber-900' : 'text-indigo-800'}`}>
                                          ={formatCurrency(rec.undepositedCashOnHand)}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-[11px] text-stone-600 leading-normal">
                                      <strong>MoR Chapter 6 Principle:</strong> {rec.cashOnHandExplanation}
                                    </p>
                                  </div>

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

      {/* ===================== TAB: BANK REASON & CATEGORY AUDIT ===================== */}
      {activeEngineTab === 'bank_reason_category' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded border border-blue-200 uppercase tracking-wider">
                    MoR Chapter 6 Bank Deposit Method
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-200 uppercase tracking-wider">
                    Proc. No. 979/2016 Art. 17 &amp; 27
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                  Bank Reason &amp; Category Forensic Examination
                </h2>
                <p className="text-xs text-stone-600 max-w-3xl leading-relaxed">
                  Scrutinizes bank transaction payment reasons, narratives, and categories under Ministry of Revenues (MoR) Indirect Audit Directives. Reconciles business sales deposits, isolates verified non-taxable receipts (equity injections, loans, inter-bank transfers), and disallows personal drawings disguised as business expenses.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => exportBankAuditFindingsCSV(bankReasonAudit.findings)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer whitespace-nowrap"
                  title="Export complete bank audit findings with legal citations to CSV"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Export Bank Audit CSV</span>
                </button>

                <button
                  onClick={handlePrintDossier}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold border border-stone-300 transition cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Print Paper</span>
                </button>
              </div>
            </div>

            {/* 5 KPI Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {/* Inflows Audited */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-stone-500 block text-[11px] font-medium">Total Bank Deposits</span>
                <span className="text-base font-bold text-stone-900 font-tabular block">
                  {formatCurrency(bankReasonAudit.totalBankCredits, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-stone-500 block">
                  {bankTransactions.filter((t) => t.type === 'credit').length} credit transactions
                </span>
              </div>

              {/* Verified Non-Income */}
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                <span className="text-emerald-800 block text-[11px] font-medium">Verified Non-Taxable</span>
                <span className="text-base font-bold text-emerald-700 font-tabular block">
                  {formatCurrency(bankReasonAudit.verifiedNonTaxableInflows, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-emerald-700 block">
                  Equity, Loans &amp; Transfers isolated
                </span>
              </div>

              {/* Unexplained Deposits */}
              <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
                <span className="text-rose-800 block text-[11px] font-medium">Unexplained Deposits</span>
                <span
                  className={`text-base font-bold font-tabular block ${
                    bankReasonAudit.unexplainedDepositsAmount > 0 ? 'text-rose-700' : 'text-stone-900'
                  }`}
                >
                  {formatCurrency(bankReasonAudit.unexplainedDepositsAmount, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-rose-700 block">
                  {bankReasonAudit.unexplainedDepositsCount} txns (MoR Deemed Sales)
                </span>
              </div>

              {/* Disallowed Personal Drawings */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                <span className="text-amber-800 block text-[11px] font-medium">Art. 27 Personal Drawings</span>
                <span
                  className={`text-base font-bold font-tabular block ${
                    bankReasonAudit.disallowedPersonalDrawingsAmount > 0
                      ? 'text-amber-700'
                      : 'text-stone-900'
                  }`}
                >
                  {formatCurrency(
                    bankReasonAudit.disallowedPersonalDrawingsAmount,
                    settings.currencySymbol
                  )}
                </span>
                <span className="text-[10px] text-amber-700 block">
                  {bankReasonAudit.disallowedPersonalDrawingsCount} private items disallowed
                </span>
              </div>

              {/* Total Potential Exposure */}
              <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-1 col-span-2 lg:col-span-1">
                <span className="text-purple-800 block text-[11px] font-medium">Potential MoR Exposure</span>
                <span
                  className={`text-base font-bold font-tabular block ${
                    bankReasonAudit.totalTaxRiskExposure > 0 ? 'text-purple-900' : 'text-stone-900'
                  }`}
                >
                  {formatCurrency(bankReasonAudit.totalTaxRiskExposure, settings.currencySymbol)}
                </span>
                <span className="text-[10px] text-purple-700 block">
                  15% VAT + CIT + 20% penalty
                </span>
              </div>
            </div>

            {/* Legal Articles Reference Banner */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-stone-900 flex items-center gap-1.5 text-[11px]">
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  Proc. No. 979/2016 Art. 17
                </span>
                <p className="text-[11px] text-stone-600 leading-normal">
                  All bank deposits without verified non-income contracts/memos are presumed taxable turnover subject to 15% VAT &amp; 30% Profit Tax.
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="font-bold text-stone-900 flex items-center gap-1.5 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Proc. No. 979/2016 Art. 27(1)(a)
                </span>
                <p className="text-[11px] text-stone-600 leading-normal">
                  Personal, domestic, or living expenses drawn from business bank accounts are strictly non-deductible and added back to taxable profits.
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="font-bold text-stone-900 flex items-center gap-1.5 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  MoR Indirect Audit Directive Ch. 6
                </span>
                <p className="text-[11px] text-stone-600 leading-normal">
                  Shareholder loan infusions and inter-bank transfers are subtracted from total bank deposits only when supported by board minutes or debit advices.
                </p>
              </div>
            </div>
          </div>

          {/* Forensic Filter & Search Toolbar */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bankAuditSearch}
                  onChange={(e) => setBankAuditSearch(e.target.value)}
                  placeholder="Search reason memo, narrative, description, category, or legal citation..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-stone-50/50"
                />
                {bankAuditSearch && (
                  <button
                    onClick={() => setBankAuditSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Reset Filters */}
              {(bankAuditRiskFilter !== 'all' ||
                bankAuditFlowFilter !== 'all' ||
                bankAuditClassificationFilter !== 'all' ||
                bankAuditSearch) && (
                <button
                  onClick={() => {
                    setBankAuditSearch('');
                    setBankAuditRiskFilter('all');
                    setBankAuditFlowFilter('all');
                    setBankAuditClassificationFilter('all');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs transition cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100 text-xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mr-1">
                Risk Level:
              </span>

              <button
                onClick={() => setBankAuditRiskFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditRiskFilter === 'all'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                All ({bankReasonAudit.findings.length})
              </button>

              <button
                onClick={() => setBankAuditRiskFilter('high')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditRiskFilter === 'high'
                    ? 'bg-rose-700 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>High Risk ({bankReasonAudit.highRiskCount})</span>
              </button>

              <button
                onClick={() => setBankAuditRiskFilter('medium')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditRiskFilter === 'medium'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                <span>Medium ({bankReasonAudit.mediumRiskCount})</span>
              </button>

              <button
                onClick={() => setBankAuditRiskFilter('compliant')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditRiskFilter === 'compliant'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Compliant ({bankReasonAudit.lowRiskCount})</span>
              </button>

              <div className="h-4 w-px bg-stone-300 mx-1 hidden sm:block" />

              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mr-1">
                Flow:
              </span>

              <button
                onClick={() => setBankAuditFlowFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditFlowFilter === 'all'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                All Flows
              </button>

              <button
                onClick={() => setBankAuditFlowFilter('credit')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditFlowFilter === 'credit'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                <span>Deposits / Inflows</span>
              </button>

              <button
                onClick={() => setBankAuditFlowFilter('debit')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  bankAuditFlowFilter === 'debit'
                    ? 'bg-rose-700 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <ArrowUpRight className="w-3 h-3 text-rose-600" />
                <span>Payments / Debits</span>
              </button>

              <div className="h-4 w-px bg-stone-300 mx-1 hidden sm:block" />

              <select
                value={bankAuditClassificationFilter}
                onChange={(e) =>
                  setBankAuditClassificationFilter(e.target.value as 'all' | AuditClassification)
                }
                className="px-2.5 py-1 rounded-lg border border-stone-300 text-xs font-semibold bg-white text-stone-800"
              >
                <option value="all">All Classifications</option>
                <option value="taxable_receipt">Taxable Commercial Receipts</option>
                <option value="non_taxable_inflow">Non-Taxable Capital / Loan</option>
                <option value="inter_account_transfer">Inter-Account Transfers</option>
                <option value="allowable_deduction">Allowable Business Purchases</option>
                <option value="disallowed_personal_drawing">Art. 27 Personal Drawings</option>
                <option value="suspicious_unexplained">Unexplained Deposits</option>
                <option value="tax_remittance">MoR Tax Remittances</option>
                <option value="bank_service_charge">Bank Service Fees</option>
              </select>
            </div>
          </div>

          {/* Forensic Findings Table */}
          <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-stone-900 text-sm">
                  Forensic Findings Ledger ({filteredBankFindings.length} of {bankReasonAudit.findings.length} transactions)
                </h3>
              </div>
              <span className="text-[11px] text-stone-500 font-mono">
                VAT Rate: {(settings.defaultSalesTaxRate * 100).toFixed(0)}% &middot; CIT: {(settings.corporateTaxRate * 100).toFixed(0)}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/80 text-stone-600 uppercase text-[10px] tracking-wider font-semibold">
                    <th className="py-2.5 px-3 whitespace-nowrap">Date &amp; Flow</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Amount (ETB)</th>
                    <th className="py-2.5 px-3">Bank Narrative &amp; Reason / Memo</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Audit Classification</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Risk Level</th>
                    <th className="py-2.5 px-3">MoR Legal Basis</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Tax Exposure</th>
                    <th className="py-2.5 px-3">Auditor Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredBankFindings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-stone-500">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                        <span className="font-medium block text-stone-800">
                          No transactions found matching current filters.
                        </span>
                        <span className="text-[11px] text-stone-500">
                          Try resetting the search or filter options above.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    filteredBankFindings.map((finding) => {
                      const isCredit = finding.type === 'credit';
                      return (
                        <tr
                          key={finding.id}
                          className={`hover:bg-stone-50/80 transition ${
                            finding.riskLevel === 'high'
                              ? 'bg-rose-50/20'
                              : finding.riskLevel === 'medium'
                              ? 'bg-amber-50/20'
                              : ''
                          }`}
                        >
                          {/* Date & Flow */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono text-stone-800 block text-[11px]">
                              {finding.date}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mt-0.5 ${
                                isCredit
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isCredit ? (
                                <>
                                  <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                                  Credit
                                </>
                              ) : (
                                <>
                                  <ArrowUpRight className="w-3 h-3 text-rose-600" />
                                  Debit
                                </>
                              )}
                            </span>
                          </td>

                          {/* Amount */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span
                              className={`font-tabular font-bold text-xs ${
                                isCredit ? 'text-emerald-700' : 'text-stone-900'
                              }`}
                            >
                              {isCredit ? '+' : '-'}
                              {formatCurrency(finding.amount, settings.currencySymbol)}
                            </span>
                          </td>

                          {/* Bank Narrative & Reason / Memo */}
                          <td className="py-3 px-3 max-w-xs">
                            <div className="font-medium text-stone-900 leading-snug">
                              {finding.description}
                            </div>
                            {finding.reason && finding.reason !== finding.description && (
                              <div className="text-[11px] text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100 mt-1 inline-block">
                                <span className="font-semibold text-blue-900">Reason: </span>
                                {finding.reason}
                              </div>
                            )}
                            {(!finding.reason || finding.reason === '') && (
                              <span className="text-[10px] text-rose-600 italic block mt-0.5">
                                No memo / reason provided
                              </span>
                            )}
                          </td>

                          {/* Category Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                              {finding.category}
                            </span>
                          </td>

                          {/* Audit Classification */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {finding.auditClassification === 'taxable_receipt' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                Taxable Sales
                              </span>
                            ) : finding.auditClassification === 'non_taxable_inflow' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Capital / Loan
                              </span>
                            ) : finding.auditClassification === 'inter_account_transfer' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-800">
                                Internal Transfer
                              </span>
                            ) : finding.auditClassification === 'disallowed_personal_drawing' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                Disallowed (Art. 27)
                              </span>
                            ) : finding.auditClassification === 'suspicious_unexplained' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                                Unexplained Deposit
                              </span>
                            ) : finding.auditClassification === 'tax_remittance' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                                MoR Remittance
                              </span>
                            ) : finding.auditClassification === 'bank_service_charge' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700">
                                Bank Fee
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700">
                                Allowable Expense
                              </span>
                            )}
                          </td>

                          {/* Risk Level */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {finding.riskLevel === 'high' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 uppercase">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                High Risk
                              </span>
                            ) : finding.riskLevel === 'medium' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                                <HelpCircle className="w-3 h-3 text-amber-600" />
                                Warning
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Compliant
                              </span>
                            )}
                          </td>

                          {/* MoR Legal Basis */}
                          <td className="py-3 px-3 max-w-xs">
                            <span className="font-semibold text-stone-900 block text-[11px]">
                              {finding.findingTitle}
                            </span>
                            <span className="text-[10px] text-stone-600 block mt-0.5">
                              {finding.proclamationArticle}
                            </span>
                          </td>

                          {/* Tax Exposure */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {finding.potentialTaxExposure > 0 ? (
                              <span className="font-tabular font-bold text-xs text-rose-700">
                                {formatCurrency(
                                  finding.potentialTaxExposure,
                                  settings.currencySymbol
                                )}
                              </span>
                            ) : (
                              <span className="font-tabular text-stone-400 text-xs">
                                0.00
                              </span>
                            )}
                          </td>

                          {/* Recommended Action */}
                          <td className="py-3 px-3 max-w-xs">
                            <span className="text-[11px] text-stone-700 leading-tight block">
                              {finding.recommendedAction}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
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

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-stone-100 text-xs">
              <span className="text-stone-500">
                MoR auditors require forensic reason and category verification to justify non-taxable exclusions.
              </span>
              <button
                onClick={() => setActiveEngineTab('bank_reason_category')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 font-semibold cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Landmark className="w-3.5 h-3.5 text-blue-600" />
                <span>Forensic Reason &amp; Category Audit ({bankReasonAudit.findings.length} Txns)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
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
