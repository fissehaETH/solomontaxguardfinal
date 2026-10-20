import React, { useState } from 'react';
import {
  BookOpen,
  Scale,
  ShieldAlert,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronRight,
  Calculator,
  Building2,
  HelpCircle,
} from 'lucide-react';

interface TaxAuditManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSimulators?: () => void;
}

export const TaxAuditManualModal: React.FC<TaxAuditManualModalProps> = ({
  isOpen,
  onClose,
  onLaunchSimulators,
}) => {
  const [activeSection, setActiveSection] = useState<
    'overview' | 'audit_types' | 'deductions' | 'indirect_methods' | 'penalties' | 'appeals'
  >('overview');

  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-stone-900 text-white flex items-start justify-between gap-3 border-b border-stone-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center shrink-0 shadow-md">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-500/20 text-orange-300 rounded border border-orange-500/30 uppercase tracking-wider">
                  MoR / Bahir Dar University AIS Reference
                </span>
                <span className="text-xs text-stone-400">Ref: 2019-0704 Final</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                Ethiopian Tax Audit Manual Guide &amp; Legal Framework
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Ministry of Revenues (MoR) / ERCA Auditing Procedures, Proclamations 983/2016 &amp; 979/2016
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="bg-stone-100 px-4 py-2 border-b border-stone-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <button
            onClick={() => setActiveSection('overview')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
              activeSection === 'overview'
                ? 'bg-white text-orange-900 shadow-xs border border-stone-300'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            1. Overview &amp; Proclamations
          </button>
          <button
            onClick={() => setActiveSection('audit_types')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
              activeSection === 'audit_types'
                ? 'bg-white text-orange-900 shadow-xs border border-stone-300'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            2. MoR Audit Types
          </button>
          <button
            onClick={() => setActiveSection('deductions')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
              activeSection === 'deductions'
                ? 'bg-white text-orange-900 shadow-xs border border-stone-300'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            3. Deductible Expenses (Art. 22-27)
          </button>
          <button
            onClick={() => setActiveSection('indirect_methods')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
              activeSection === 'indirect_methods'
                ? 'bg-white text-orange-900 shadow-xs border border-stone-300'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            4. Indirect Audit Methods (Ch. 6)
          </button>
          <button
            onClick={() => setActiveSection('penalties')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
              activeSection === 'penalties'
                ? 'bg-white text-orange-900 shadow-xs border border-stone-300'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            5. Penalties (Proc. 983/2016)
          </button>
          <button
            onClick={() => setActiveSection('appeals')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition cursor-pointer ${
              activeSection === 'appeals'
                ? 'bg-white text-orange-900 shadow-xs border border-stone-300'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            6. Objection &amp; Appeal Rights
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-stone-800 text-xs sm:text-sm leading-relaxed">
          {/* SECTION 1: OVERVIEW & PROCLAMATIONS */}
          {activeSection === 'overview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
                <div className="flex items-start gap-3">
                  <Scale className="w-5 h-5 text-orange-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">
                      About the MoR Tax Audit Manual (2019 / Bahir Dar University AIS Reference)
                    </h3>
                    <p className="text-stone-700 text-xs mt-1">
                      This operational manual guides Ministry of Revenues (MoR) and ERCA tax auditors across Ethiopia in examining corporate and individual business books, discovering tax avoidance, ensuring fair revenue collection, and verifying compliance with statutory proclamations.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
                    Proclamation No. 983/2016
                  </span>
                  <h4 className="font-bold text-stone-900 text-xs">Tax Administration Proclamation</h4>
                  <p className="text-xs text-stone-600">
                    Defines administrative powers of the Ministry, taxpayer record retention duties (Article 17: minimum 6 years), audit summons, electronic cash register rules, and statutory penalties (Articles 108–113).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
                    Proclamation No. 979/2016
                  </span>
                  <h4 className="font-bold text-stone-900 text-xs">Federal Income Tax Proclamation</h4>
                  <p className="text-xs text-stone-600">
                    Regulates Schedule &apos;C&apos; business income tax (30% corporate rate), deductible vs disallowed business expenses (Articles 22–27), depreciation pooling, and 2% withholding agent requirements (Article 92).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
                    Proclamation No. 285/2002 &amp; Amendments
                  </span>
                  <h4 className="font-bold text-stone-900 text-xs">Value Added Tax (VAT) Proclamation</h4>
                  <p className="text-xs text-stone-600">
                    Enforces 15% standard VAT on taxable supplies. Article 21 strictly governs Input VAT credit: disallows credits lacking official VAT invoices or older than the 6-month claim window.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
                    Directive No. 1063/2025 / Reg. 410/2017
                  </span>
                  <h4 className="font-bold text-stone-900 text-xs">Assessment Directive &amp; Council Regulations</h4>
                  <p className="text-xs text-stone-600">
                    Standardizes modern tax assessment methodologies, computerized risk scoring (CBRS), desk review thresholds, and exit conference proceedings.
                  </p>
                </div>
              </div>

              {/* Taxpayer Categorization */}
              <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900 text-xs flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-orange-700" />
                  Taxpayer Categorization Criteria (Council of Ministers Regulation)
                </h4>
                <div className="space-y-1.5 text-xs text-stone-700">
                  <div className="p-2 rounded-lg bg-stone-50 border border-stone-200 flex justify-between items-center">
                    <div>
                      <strong className="text-stone-900">Category &apos;A&apos; Taxpayers:</strong> Annual turnover of ETB 1,000,000 or more (or PLC / Share Company regardless of turnover).
                    </div>
                    <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 text-[10px] font-bold shrink-0">
                      Full Double-Entry Books
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-stone-50 border border-stone-200 flex justify-between items-center">
                    <div>
                      <strong className="text-stone-900">Category &apos;B&apos; Taxpayers:</strong> Annual turnover between ETB 500,000 and ETB 1,000,000.
                    </div>
                    <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-800 text-[10px] font-bold shrink-0">
                      Sales &amp; Purchase Ledgers
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-stone-50 border border-stone-200 flex justify-between items-center">
                    <div>
                      <strong className="text-stone-900">Category &apos;C&apos; Taxpayers:</strong> Annual turnover below ETB 500,000. Presumptive/standard assessment.
                    </div>
                    <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-800 text-[10px] font-bold shrink-0">
                      Standard Daily Turnover
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: AUDIT TYPES */}
          {activeSection === 'audit_types' && (
            <div className="space-y-3">
              <p className="text-xs text-stone-600">
                Under Chapter 3 of the MoR Tax Audit Manual, tax audits are systematically divided into six recognized categories depending on risk, scope, and objective:
              </p>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-stone-900 text-xs">1. Comprehensive Audit (Full Scope)</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-900">
                      High Scrutiny
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1">
                    Examines all taxes (Business Income Tax, VAT, Withholding, Excise, Payroll/Schedule A) across 3 to 5 open statutory fiscal years. Involves in-depth examination of all books, bank statements, asset ledgers, and third-party confirmations.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-stone-900 text-xs">2. Issue-Oriented / Single-Issue Audit</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-800">
                      Targeted Focus
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1">
                    Confined to one or two specific areas triggered by anomalies, such as high repair expense deductions, unverified foreign travel, inventory write-offs, or sudden drops in gross margin.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-stone-900 text-xs">3. Desk Audit / Desk Review</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-800">
                      Office-Based
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1">
                    Conducted inside Ministry offices without field visits by matching taxpayer declared returns against computerized data (e.g., ASYCUDA Customs import declarations, third-party withholding filings, and bank credit feeds).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-stone-900 text-xs">4. VAT Refund Audit</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                      Mandatory Pre-Payment
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1">
                    Mandatory audit before MoR disburses cash refunds for excess input tax claims. Requires 100% verification of supplier VAT registration, physical invoice inspection, and confirmation that suppliers remitted output VAT.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-stone-900 text-xs">5. Spot-Check &amp; Advisory Audit</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-800">
                      On-Site Unannounced
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1">
                    Surprise physical inspections at the business premises to verify if Electronic Sales Register Machines (ESRM/FRC) are plugged in, cash drawers match registered daily totals, and sales receipts are handed to buyers.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-stone-900 text-xs">6. Fraud Investigation Audit</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-900">
                      Criminal / Evasion
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1">
                    Triggered by whistleblower intelligence, double books, unrecorded secret bank accounts, or artificial &quot;air invoices&quot;. Handled in collaboration with federal police and prosecutors with severe criminal penalties.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: DEDUCTIBLE VS NON-DEDUCTIBLE EXPENSES */}
          {activeSection === 'deductions' && (
            <div className="space-y-3">
              <p className="text-xs text-stone-600">
                Articles 22 through 27 of Income Tax Proclamation No. 979/2016 and Regulation 410/2017 define what business expenses may reduce taxable profit during an audit:
              </p>

              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 border-b border-stone-200 text-stone-700">
                    <tr>
                      <th className="p-2.5 font-bold">Expense Category</th>
                      <th className="p-2.5 font-bold">Deductibility Status</th>
                      <th className="p-2.5 font-bold">Legal Rule &amp; MoR Audit Constraint</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    <tr className="bg-emerald-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Cost of Goods Sold (Inventory)</td>
                      <td className="p-2.5 text-emerald-700 font-bold">100% Fully Deductible</td>
                      <td className="p-2.5 text-stone-600">Must have valid supplier tax invoice with TIN and delivery note.</td>
                    </tr>
                    <tr className="bg-emerald-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Shop Rent &amp; Commercial Utilities</td>
                      <td className="p-2.5 text-emerald-700 font-bold">100% Fully Deductible</td>
                      <td className="p-2.5 text-stone-600">Requires registered lease contract and official withholding tax receipts.</td>
                    </tr>
                    <tr className="bg-amber-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Entertainment &amp; Refreshments</td>
                      <td className="p-2.5 text-amber-800 font-bold">Strictly Restricted / 0%</td>
                      <td className="p-2.5 text-stone-600">
                        Proclamation 979/2016 Art. 25: Entertainment expenses are disallowable. Representation expenses capped at 10% of employee salary.
                      </td>
                    </tr>
                    <tr className="bg-amber-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Interest Expense &amp; Bank Loans</td>
                      <td className="p-2.5 text-amber-800 font-bold">Limited Ceiling</td>
                      <td className="p-2.5 text-stone-600">
                        Art. 24: Interest exceeding National Bank of Ethiopia (NBE) rate + 2% is disallowed. Thin capitalization 2:1 debt-to-equity cap.
                      </td>
                    </tr>
                    <tr className="bg-red-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Government Fines &amp; Penalties</td>
                      <td className="p-2.5 text-red-700 font-bold">100% Disallowed</td>
                      <td className="p-2.5 text-stone-600">
                        Art. 27: Fines and penalties paid to government agencies or courts cannot reduce taxable profit.
                      </td>
                    </tr>
                    <tr className="bg-red-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Personal &amp; Domestic Consumption</td>
                      <td className="p-2.5 text-red-700 font-bold">100% Disallowed</td>
                      <td className="p-2.5 text-stone-600">
                        Art. 22: Only expenses wholly and exclusively incurred in the production of business income are allowable.
                      </td>
                    </tr>
                    <tr className="bg-amber-50/40">
                      <td className="p-2.5 font-medium text-stone-900">Input VAT (VAT Proclamation Art. 21)</td>
                      <td className="p-2.5 text-stone-800 font-bold">Subject to 6-Month Rule</td>
                      <td className="p-2.5 text-stone-600">
                        Input tax must be claimed within 5 consecutive months following the tax period. Excludes passenger cars and hospitality.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 4: INDIRECT AUDIT METHODS */}
          {activeSection === 'indirect_methods' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200">
                <h4 className="font-bold text-stone-900 text-xs">
                  Chapter 6: Indirect Audit Methods (When Books are Rejected or Incomplete)
                </h4>
                <p className="text-xs text-stone-600 mt-1">
                  When a taxpayer fails to maintain proper double-entry books, conceals sales slips, or records improbable gross profit margins, the MoR manual instructs auditors to apply Indirect Audit Methods to legally reconstruct turnover:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-900 text-xs">
                    <Building2 className="w-4 h-4 text-orange-700" />
                    <span>Bank Deposit Method</span>
                  </div>
                  <p className="text-xs text-stone-600">
                    <strong>Formula:</strong> Total Bank Credits − Non-income deposits (loans, transfers) = Estimated Sales.
                  </p>
                  <p className="text-[11px] text-stone-500">
                    If bank deposits exceed declared turnover, the difference is taxed as unrecorded revenue + 50% penalty.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-900 text-xs">
                    <Calculator className="w-4 h-4 text-orange-700" />
                    <span>Markup &amp; Margin Test</span>
                  </div>
                  <p className="text-xs text-stone-600">
                    <strong>Formula:</strong> Cost of Goods Sold × Sector Standard Markup = Estimated Sales.
                  </p>
                  <p className="text-[11px] text-stone-500">
                    If declared gross margin is significantly below sector averages, the auditor adjusts revenue to benchmark levels.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-900 text-xs">
                    <FileText className="w-4 h-4 text-orange-700" />
                    <span>Source &amp; Application</span>
                  </div>
                  <p className="text-xs text-stone-600">
                    <strong>Formula:</strong> Total Disbursements (expenses, stock, drawings) vs Documented Sourced Cash.
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Excess cash expenditure without proven loan/capital source is treated as undeclared cash sales.
                  </p>
                </div>
              </div>

              {onLaunchSimulators && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      onClose();
                      onLaunchSimulators();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Calculator className="w-4 h-4" />
                    <span>Open Live Indirect Audit Simulators in Tax Engine</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SECTION 5: PENALTIES */}
          {activeSection === 'penalties' && (
            <div className="space-y-3">
              <p className="text-xs text-stone-600">
                Statutory penalties enforced by Ministry of Revenues auditors under Tax Administration Proclamation No. 983/2016:
              </p>

              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex justify-between items-start gap-3">
                  <div>
                    <h5 className="font-bold text-red-950 text-xs">
                      Understatement of Tax (Article 109)
                    </h5>
                    <p className="text-xs text-red-900 mt-0.5">
                      • 10% penalty if understatement is ≤ ETB 50,000.<br />
                      • 25% penalty if understatement is between ETB 50,000 and ETB 200,000.<br />
                      • 50% penalty if understatement exceeds ETB 200,000 or deliberate omission.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-red-800 shrink-0">10% - 50%</span>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex justify-between items-start gap-3">
                  <div>
                    <h5 className="font-bold text-stone-900 text-xs">
                      Failure to Maintain Proper Books and Records (Article 110)
                    </h5>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Imposed when required Category A or B records, receipts, and invoices are incomplete, damaged, or unmaintained.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-stone-900 shrink-0">
                    20% or ETB 100k
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex justify-between items-start gap-3">
                  <div>
                    <h5 className="font-bold text-stone-900 text-xs">
                      Failure to Issue Fiscal Cash Register Receipt (Article 113)
                    </h5>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Failing to use an accredited Electronic Sales Register Machine (ESRM/FRC) or issuing uncertified manual receipts.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-stone-900 shrink-0">
                    ETB 50,000 / occurrence
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex justify-between items-start gap-3">
                  <div>
                    <h5 className="font-bold text-stone-900 text-xs">
                      Late Payment Interest (Article 44)
                    </h5>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Calculated at the National Bank of Ethiopia (NBE) reference lending rate + 2% per annum on unpaid tax liability, compounded monthly.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-stone-900 shrink-0">
                    NBE + 2% p.a.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: APPEALS & RIGHTS */}
          {activeSection === 'appeals' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                <h4 className="font-bold text-stone-900 text-xs">
                  Taxpayer Rights, Exit Conference &amp; Dispute Resolution Timeline
                </h4>
                <p className="text-xs text-stone-600 mt-1">
                  Taxpayers are legally protected against arbitrary assessments through formal administrative and judicial objection stages:
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-white border border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center font-bold text-[10px]">
                      1
                    </span>
                    <strong className="text-xs text-stone-900">Exit Conference &amp; Draft Assessment</strong>
                  </div>
                  <p className="text-xs text-stone-600 mt-1 pl-7">
                    Auditors must conduct an exit interview with the taxpayer, presenting preliminary adjustments and working papers before finalizing the assessment notice.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center font-bold text-[10px]">
                      2
                    </span>
                    <strong className="text-xs text-stone-900">21-Day Objection to MoR Review Committee</strong>
                  </div>
                  <p className="text-xs text-stone-600 mt-1 pl-7">
                    The taxpayer has <strong>21 calendar days</strong> from the receipt of the Assessment Notice to file a formal written objection with documentary proof to the Ministry&apos;s Tax Dispute Resolution Department.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center font-bold text-[10px]">
                      3
                    </span>
                    <strong className="text-xs text-stone-900">Appeal to Tax Appeal Commission (50% Deposit)</strong>
                  </div>
                  <p className="text-xs text-stone-600 mt-1 pl-7">
                    If dissatisfied with the Ministry&apos;s review, an appeal can be filed with the independent Tax Appeal Commission within <strong>30 days</strong>. <em>Crucial requirement: The taxpayer must deposit 50% of the disputed tax in escrow before the appeal is heard.</em>
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center font-bold text-[10px]">
                      4
                    </span>
                    <strong className="text-xs text-stone-900">Federal High Court &amp; Supreme Court</strong>
                  </div>
                  <p className="text-xs text-stone-600 mt-1 pl-7">
                    Appeals on points of law (not factual assessment) may proceed to the Federal High Court and Federal Supreme Court Cassation Division.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-stone-500 text-[11px] text-center sm:text-left">
            Reference: Bahir Dar University Accounting Information System &middot; MoR Tax Audit Manual 2019-0704
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-stone-900 text-white font-semibold hover:bg-stone-800 transition cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
