/**
 * Ethiopian Tax Audit Engine - Bank Reason & Category Forensic Inspection
 *
 * Grounded in:
 * - Ethiopian Federal Income Tax Proclamation No. 979/2016:
 *     * Article 17: Gross Business Income (Inclusion of all revenue receipts)
 *     * Article 22 & 23: Allowable Business Deductions (Wholly & exclusively incurred)
 *     * Article 27: Non-Deductible Expenditures (Personal drawings, private expenses, fines)
 * - Tax Administration Proclamation No. 983/2016:
 *     * Article 104: Understatement of Tax Penalties (20% - 50% + interest)
 *     * Article 106: Late Payment Interest
 * - Ethiopian VAT Proclamation No. 285/2002 / Proc. 1341/2024 (15% VAT on commercial supplies)
 * - Ministry of Revenues (MoR) Tax Audit Manual Chapter 6 (Indirect Audit - Bank Deposit Method):
 *     Auditors analyze total bank deposits, reconcile explicit transaction reasons/narrations,
 *     deduct verified non-taxable receipts (shareholder equity, verified loans, contra transfers),
 *     and treat unexplained or miscategorized deposits as undeclared taxable sales.
 */

import { BankTransaction, SaleTransaction, PurchaseItem } from '../types';

export type AuditClassification =
  | 'taxable_receipt'
  | 'non_taxable_inflow'
  | 'allowable_deduction'
  | 'disallowed_personal_drawing'
  | 'suspicious_unexplained'
  | 'tax_remittance'
  | 'bank_service_charge'
  | 'inter_account_transfer';

export interface BankAuditFinding {
  id: string;
  transactionId: string;
  date: string;
  bankAccountId: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  reason: string;
  category: string;
  auditClassification: AuditClassification;
  riskLevel: 'high' | 'medium' | 'low' | 'compliant';
  matchedWithLedger: boolean;
  findingTitle: string;
  findingDetail: string;
  proclamationArticle: string;
  recommendedAction: string;
  potentialTaxExposure: number;
}

export interface BankReasonCategoryAuditSummary {
  totalBankCredits: number;
  totalBankDebits: number;
  verifiedTaxableReceipts: number;
  verifiedNonTaxableInflows: number;
  unexplainedDepositsCount: number;
  unexplainedDepositsAmount: number;
  disallowedPersonalDrawingsCount: number;
  disallowedPersonalDrawingsAmount: number;
  taxRemittancesTotal: number;
  allowableDeductionsTotal: number;
  potentialVatUnderdeclaration: number;
  potentialCitExposure: number;
  potentialPenaltiesExposure: number;
  totalTaxRiskExposure: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  findings: BankAuditFinding[];
}

/**
 * Keywords for narrative classification
 */
const NON_TAXABLE_INFLOW_KEYWORDS = [
  'capital',
  'equity',
  'shareholder',
  'owner deposit',
  'owner injection',
  'loan',
  'borrowing',
  'bank loan',
  'disbursement',
  'credit facility',
  'refund',
  'insurance claim',
  'contra',
  'transfer from',
  'internal transfer',
  'own account',
  'inter-bank',
];

const PERSONAL_DRAWING_KEYWORDS = [
  'personal',
  'drawing',
  'owner withdrawal',
  'dividend',
  'tuition',
  'school',
  'groceries',
  'home rent',
  'residential',
  'spouse',
  'vacation',
  'holiday',
  'hotel personal',
  'medical personal',
  'private',
  'house',
  'family',
];

const TAX_PAYMENT_KEYWORDS = [
  'tax',
  'mor',
  'ministry of revenues',
  'vat',
  'tot',
  'withholding',
  'wht',
  'customs',
  'erc',
  'revenue authority',
  'duty',
];

const BANK_FEE_KEYWORDS = [
  'fee',
  'charge',
  'commission',
  'rtgs',
  'ledger',
  'maintenance',
  'alert',
  'sms fee',
  'service fee',
  'cheque book',
];

const COMMERCIAL_SALES_KEYWORDS = [
  'sale',
  'sales',
  'invoice',
  'customer',
  'payment for',
  'goods',
  'supply',
  'order',
  'settlement',
  'telebirr',
  'pos',
  'contract',
  'advance',
  'clearing',
];

/**
 * Forensic audit engine for bank reasons and categories
 */
export function auditBankReasonAndCategory(
  bankTransactions: BankTransaction[],
  sales: SaleTransaction[] = [],
  purchases: PurchaseItem[] = [],
  corporateTaxRate: number = 0.3,
  vatRate: number = 0.15
): BankReasonCategoryAuditSummary {
  const findings: BankAuditFinding[] = [];

  let totalCredits = 0;
  let totalDebits = 0;
  let verifiedTaxableReceipts = 0;
  let verifiedNonTaxableInflows = 0;
  let unexplainedDepositsCount = 0;
  let unexplainedDepositsAmount = 0;
  let disallowedPersonalDrawingsCount = 0;
  let disallowedPersonalDrawingsAmount = 0;
  let taxRemittancesTotal = 0;
  let allowableDeductionsTotal = 0;
  let potentialVatUnderdeclaration = 0;
  let potentialCitExposure = 0;
  let potentialPenaltiesExposure = 0;
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  let lowRiskCount = 0;

  // Pre-index sales and purchases for faster matching
  const salesBankAmounts = new Set(sales.map((s) => Number(s.totalAmount.toFixed(2))));
  const purchasesBankAmounts = new Set(purchases.map((p) => Number(p.totalAmount.toFixed(2))));

  for (const txn of bankTransactions) {
    const rawReason = (txn.reason || txn.description || '').trim();
    const reasonLower = rawReason.toLowerCase();
    const category = txn.category || 'other';
    const amount = Math.abs(txn.amount);

    if (txn.type === 'credit') {
      totalCredits += amount;

      // 1. Check if it is a verified non-taxable inflow (Capital injection, loan, inter-account transfer)
      const isExplicitNonTaxableCategory =
        category === 'loan_infusion' || category === 'transfer';
      const hasNonTaxableKeyword = NON_TAXABLE_INFLOW_KEYWORDS.some((kw) =>
        reasonLower.includes(kw)
      );

      if (isExplicitNonTaxableCategory || hasNonTaxableKeyword) {
        verifiedNonTaxableInflows += amount;

        // Check if documentation is missing (e.g. transfer marked as loan but no bank loan agreement)
        const isTransfer =
          category === 'transfer' ||
          reasonLower.includes('transfer from') ||
          reasonLower.includes('own account') ||
          reasonLower.includes('internal transfer');

        if (isTransfer) {
          findings.push({
            id: `audit-${txn.id}`,
            transactionId: txn.id,
            date: txn.date,
            bankAccountId: txn.bankAccountId,
            type: 'credit',
            amount,
            description: txn.description,
            reason: rawReason,
            category,
            auditClassification: 'inter_account_transfer',
            riskLevel: 'compliant',
            matchedWithLedger: true,
            findingTitle: 'Inter-Account / Internal Transfer Verified',
            findingDetail:
              'Transfer between own business bank accounts excluded from taxable turnover per MoR Indirect Audit Chapter 6.',
            proclamationArticle: 'MoR Tax Audit Manual Ch. 6 (Non-Taxable Contra Verification)',
            recommendedAction:
              'Maintain corresponding debit voucher and bank debit advice in working papers.',
            potentialTaxExposure: 0,
          });
          lowRiskCount++;
        } else {
          // Capital / Shareholder Loan
          const isLargeUnverified = amount > 50000;
          const risk: BankAuditFinding['riskLevel'] = isLargeUnverified ? 'medium' : 'low';
          if (risk === 'medium') mediumRiskCount++;
          else lowRiskCount++;

          findings.push({
            id: `audit-${txn.id}`,
            transactionId: txn.id,
            date: txn.date,
            bankAccountId: txn.bankAccountId,
            type: 'credit',
            amount,
            description: txn.description,
            reason: rawReason,
            category,
            auditClassification: 'non_taxable_inflow',
            riskLevel: risk,
            matchedWithLedger: true,
            findingTitle: 'Non-Taxable Capital / Loan Inflow',
            findingDetail: `Deposit classified as ${category} with reason "${rawReason}". Non-taxable under Proclamation No. 979/2016 provided legal documentation exists.`,
            proclamationArticle: 'Proclamation No. 979/2016 Art. 17 & MoR Directive 43/2011',
            recommendedAction:
              'Keep authenticated minutes of shareholders, loan agreement, or bank credit advice to defend against MoR presumption of sales.',
            potentialTaxExposure: isLargeUnverified ? amount * (vatRate + corporateTaxRate * 0.2) : 0,
          });
        }
      } else {
        // It is an inflow of funds that could be business turnover
        const isMatchedWithSale =
          txn.isReconciled ||
          salesBankAmounts.has(Number(amount.toFixed(2))) ||
          category === 'sale_deposit' ||
          category === 'sales_cash_deposit' ||
          category === 'card_settlement';

        const isUnexplained =
          !isMatchedWithSale ||
          reasonLower === '' ||
          reasonLower === 'deposit' ||
          reasonLower === 'cash' ||
          category === 'other';

        if (isUnexplained) {
          unexplainedDepositsCount++;
          unexplainedDepositsAmount += amount;

          // MoR assesses unexplained deposits as undeclared sales:
          // 15% VAT + 30% CIT on 20% deemed margin + 20% penalty
          const vatExposure = amount * vatRate;
          const deemedProfit = amount * 0.25;
          const citExposure = deemedProfit * corporateTaxRate;
          const penalty = (vatExposure + citExposure) * 0.2;
          const totalExposure = vatExposure + citExposure + penalty;

          potentialVatUnderdeclaration += vatExposure;
          potentialCitExposure += citExposure;
          potentialPenaltiesExposure += penalty;
          highRiskCount++;

          findings.push({
            id: `audit-${txn.id}`,
            transactionId: txn.id,
            date: txn.date,
            bankAccountId: txn.bankAccountId,
            type: 'credit',
            amount,
            description: txn.description,
            reason: rawReason || 'Blank narrative / unexplained deposit',
            category,
            auditClassification: 'suspicious_unexplained',
            riskLevel: 'high',
            matchedWithLedger: false,
            findingTitle: 'High Tax Risk: Unexplained Bank Deposit (Presumed Deemed Sales)',
            findingDetail: `Bank deposit of ${amount.toLocaleString()} ETB lacks sales receipt linkage and clear reason. MoR auditors assess unexplained deposits as undeclared turnover under indirect audit directives.`,
            proclamationArticle:
              'Proclamation No. 979/2016 Art. 17 & Proc. No. 983/2016 Art. 104',
            recommendedAction:
              'Link to a valid POS/e-Fis receipt, sales invoice, or obtain customer deposit slip with explicit commercial reference immediately.',
            potentialTaxExposure: totalExposure,
          });
        } else {
          // Verified Taxable Business Receipt
          verifiedTaxableReceipts += amount;
          lowRiskCount++;

          findings.push({
            id: `audit-${txn.id}`,
            transactionId: txn.id,
            date: txn.date,
            bankAccountId: txn.bankAccountId,
            type: 'credit',
            amount,
            description: txn.description,
            reason: rawReason,
            category,
            auditClassification: 'taxable_receipt',
            riskLevel: 'compliant',
            matchedWithLedger: true,
            findingTitle: 'Compliant Commercial Sales Receipt',
            findingDetail: `Deposit categorized as ${category} with matching business transaction narrative "${rawReason}".`,
            proclamationArticle: 'Proclamation No. 979/2016 Art. 17 (Gross Business Income)',
            recommendedAction: 'Reconciled with sales register. Ensure cash register machine Z-report cross-reference is filed.',
            potentialTaxExposure: 0,
          });
        }
      }
    } else {
      // Outflows / Debits
      totalDebits += amount;

      // 2. Outflow checks: Personal Drawings (Art. 27), Tax Remittances, Bank Fees, Allowable Purchases
      const isPersonalDrawing =
        category === 'personal_drawing' ||
        PERSONAL_DRAWING_KEYWORDS.some((kw) => reasonLower.includes(kw));

      const isTaxPayment =
        category === 'tax_payment' ||
        TAX_PAYMENT_KEYWORDS.some((kw) => reasonLower.includes(kw));

      const isBankFee =
        category === 'bank_fee' ||
        BANK_FEE_KEYWORDS.some((kw) => reasonLower.includes(kw));

      const isTransferOut =
        category === 'transfer' ||
        reasonLower.includes('transfer to') ||
        reasonLower.includes('savings') ||
        reasonLower.includes('tax reserve');

      if (isPersonalDrawing) {
        disallowedPersonalDrawingsCount++;
        disallowedPersonalDrawingsAmount += amount;

        // Disallowance means added back to taxable profit -> 30% CIT + 20% penalty
        const citImpact = amount * corporateTaxRate;
        const penaltyImpact = citImpact * 0.2;
        potentialCitExposure += citImpact;
        potentialPenaltiesExposure += penaltyImpact;
        highRiskCount++;

        findings.push({
          id: `audit-${txn.id}`,
          transactionId: txn.id,
          date: txn.date,
          bankAccountId: txn.bankAccountId,
          type: 'debit',
          amount,
          description: txn.description,
          reason: rawReason,
          category,
          auditClassification: 'disallowed_personal_drawing',
          riskLevel: 'high',
          matchedWithLedger: false,
          findingTitle: 'Disallowed Non-Deductible Drawing (Proc. 979 Art. 27)',
          findingDetail: `Bank outflow with narrative "${rawReason}" indicates personal, household, or owner expenditure. Disallowed 100% from business tax deductions and added back to taxable income.`,
          proclamationArticle: 'Proclamation No. 979/2016 Article 27(1)(a) (Non-Deductible Personal Expenses)',
          recommendedAction:
            'Reclassify from business expenses to Equity/Owner Drawing account to avoid false deduction penalties during MoR audit.',
          potentialTaxExposure: citImpact + penaltyImpact,
        });
      } else if (isTaxPayment) {
        taxRemittancesTotal += amount;
        lowRiskCount++;

        findings.push({
          id: `audit-${txn.id}`,
          transactionId: txn.id,
          date: txn.date,
          bankAccountId: txn.bankAccountId,
          type: 'debit',
          amount,
          description: txn.description,
          reason: rawReason,
          category,
          auditClassification: 'tax_remittance',
          riskLevel: 'compliant',
          matchedWithLedger: true,
          findingTitle: 'Official Tax Remittance to MoR Verified',
          findingDetail: `Payment to Ministry of Revenues / Tax Authority for VAT, TOT, or Corporate Income Tax.`,
          proclamationArticle: 'Tax Administration Proclamation No. 983/2016 Art. 38 (Payment of Tax)',
          recommendedAction: 'Archive MoR official cash receipt / e-Tax payment confirmation voucher.',
          potentialTaxExposure: 0,
        });
      } else if (isBankFee) {
        allowableDeductionsTotal += amount;
        lowRiskCount++;

        findings.push({
          id: `audit-${txn.id}`,
          transactionId: txn.id,
          date: txn.date,
          bankAccountId: txn.bankAccountId,
          type: 'debit',
          amount,
          description: txn.description,
          reason: rawReason,
          category,
          auditClassification: 'bank_service_charge',
          riskLevel: 'compliant',
          matchedWithLedger: true,
          findingTitle: 'Allowable Financial Service Charge',
          findingDetail: `Routine bank operating commission / charge deductible under Proclamation No. 979/2016 Art. 22.`,
          proclamationArticle: 'Proclamation No. 979/2016 Article 22 (General Deductibility)',
          recommendedAction: 'Reconcile with monthly bank debit advice.',
          potentialTaxExposure: 0,
        });
      } else if (isTransferOut) {
        findings.push({
          id: `audit-${txn.id}`,
          transactionId: txn.id,
          date: txn.date,
          bankAccountId: txn.bankAccountId,
          type: 'debit',
          amount,
          description: txn.description,
          reason: rawReason,
          category,
          auditClassification: 'inter_account_transfer',
          riskLevel: 'compliant',
          matchedWithLedger: true,
          findingTitle: 'Internal Inter-Account Transfer Outflow',
          findingDetail: `Transfer out to company savings, tax reserve, or sister account. Neutral for tax computation.`,
          proclamationArticle: 'MoR Tax Audit Manual Ch. 6 (Contra Transfer Verification)',
          recommendedAction: 'Verify corresponding credit on destination account statement.',
          potentialTaxExposure: 0,
        });
        lowRiskCount++;
      } else {
        // Vendor / Business Expense
        const isMatchedWithPurchase =
          purchasesBankAmounts.has(Number(amount.toFixed(2))) ||
          category === 'vendor_payout';

        // Check cash payment limits / documentation
        if (isMatchedWithPurchase) {
          allowableDeductionsTotal += amount;
          lowRiskCount++;

          findings.push({
            id: `audit-${txn.id}`,
            transactionId: txn.id,
            date: txn.date,
            bankAccountId: txn.bankAccountId,
            type: 'debit',
            amount,
            description: txn.description,
            reason: rawReason,
            category,
            auditClassification: 'allowable_deduction',
            riskLevel: 'compliant',
            matchedWithLedger: true,
            findingTitle: 'Allowable Business Expense Outflow',
            findingDetail: `Vendor or supplier settlement with explicit commercial reason "${rawReason}".`,
            proclamationArticle: 'Proclamation No. 979/2016 Article 22 & 23',
            recommendedAction: 'Verify supplier provides VAT invoice with valid TIN.',
            potentialTaxExposure: 0,
          });
        } else {
          // Unmatched or vague vendor payment
          const isVague =
            reasonLower === '' ||
            reasonLower === 'cash withdrawal' ||
            reasonLower === 'payment' ||
            category === 'cash_withdraw';

          const risk: BankAuditFinding['riskLevel'] = isVague ? 'medium' : 'low';
          if (risk === 'medium') mediumRiskCount++;
          else lowRiskCount++;

          findings.push({
            id: `audit-${txn.id}`,
            transactionId: txn.id,
            date: txn.date,
            bankAccountId: txn.bankAccountId,
            type: 'debit',
            amount,
            description: txn.description,
            reason: rawReason || 'Unspecified withdrawal',
            category,
            auditClassification: 'allowable_deduction',
            riskLevel: risk,
            matchedWithLedger: false,
            findingTitle: isVague
              ? 'Warning: Unsubstantiated Bank Withdrawal / Outflow'
              : 'Business Payment (Pending Ledger Matching)',
            findingDetail: isVague
              ? `Withdrawal of ${amount.toLocaleString()} ETB lacks explicit reason or purchase voucher. Under MoR audit, unsubstantiated expenses are disallowed under Art. 27.`
              : `Bank debit of ${amount.toLocaleString()} ETB categorized as ${category}.`,
            proclamationArticle: 'Proclamation No. 979/2016 Article 27(1)(b) & (h)',
            recommendedAction:
              'Attach valid commercial invoice, withholding tax receipt, or payment voucher to justify business deductibility.',
            potentialTaxExposure: isVague ? amount * corporateTaxRate : 0,
          });
        }
      }
    }
  }

  const totalTaxRiskExposure =
    potentialVatUnderdeclaration + potentialCitExposure + potentialPenaltiesExposure;

  return {
    totalBankCredits: totalCredits,
    totalBankDebits: totalDebits,
    verifiedTaxableReceipts,
    verifiedNonTaxableInflows,
    unexplainedDepositsCount,
    unexplainedDepositsAmount,
    disallowedPersonalDrawingsCount,
    disallowedPersonalDrawingsAmount,
    taxRemittancesTotal,
    allowableDeductionsTotal,
    potentialVatUnderdeclaration,
    potentialCitExposure,
    potentialPenaltiesExposure,
    totalTaxRiskExposure,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    findings: findings.sort((a, b) => (b.riskLevel === 'high' ? 1 : -1)),
  };
}

/**
 * Export bank audit findings to CSV
 */
export function exportBankAuditFindingsCSV(findings: BankAuditFinding[]): void {
  const headers = [
    'Date',
    'Flow Type',
    'Amount (ETB)',
    'Bank Description',
    'Reason / Memo',
    'Category',
    'Audit Classification',
    'Risk Level',
    'Audit Finding Title',
    'Legal Basis (Proc. 979/2016 & MoR)',
    'Recommended Action',
    'Potential Tax Exposure (ETB)',
  ];

  const rows = findings.map((f) => [
    `"${f.date}"`,
    `"${f.type.toUpperCase()}"`,
    f.amount.toFixed(2),
    `"${(f.description || '').replace(/"/g, '""')}"`,
    `"${(f.reason || '').replace(/"/g, '""')}"`,
    `"${f.category}"`,
    `"${f.auditClassification}"`,
    `"${f.riskLevel.toUpperCase()}"`,
    `"${f.findingTitle.replace(/"/g, '""')}"`,
    `"${f.proclamationArticle.replace(/"/g, '""')}"`,
    `"${f.recommendedAction.replace(/"/g, '""')}"`,
    f.potentialTaxExposure.toFixed(2),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `TaxGuard_Bank_Reason_Audit_Report_${new Date().toISOString().split('T')[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
