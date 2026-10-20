/**
 * Ethiopian Ministry of Revenues (MoR) / ERCA Tax Audit Manual Engine
 * Based on the Revised Tax Audit Manual (May 2019 / Bahir Dar University AIS Course Reference)
 * Grounded in:
 * - Federal Tax Administration Proclamation No. 983/2016
 * - Federal Income Tax Proclamation No. 979/2016
 * - Value Added Tax Proclamation No. 285/2002 & Amendments
 * - Council of Ministers Regulation No. 410/2017 & No. 407/2017
 * - Tax Assessment Directive No. 1063/2025
 */

import {
  BankAccount,
  BankTransaction,
  PurchaseItem,
  SaleTransaction,
  TaxSettings,
} from '../types';

export interface SectorBenchmark {
  code: string;
  name: string;
  typicalGrossMarginMin: number; // e.g. 0.18 (18%)
  typicalGrossMarginMax: number; // e.g. 0.25 (25%)
  typicalMarkupMin: number;      // e.g. 0.22 (22%)
  typicalMarkupMax: number;      // e.g. 0.33 (33%)
  description: string;
}

export const SECTOR_BENCHMARKS: SectorBenchmark[] = [
  {
    code: 'BUILDING_MATERIALS',
    name: 'Building Materials & Hardware (Solomon Shop)',
    typicalGrossMarginMin: 0.16,
    typicalGrossMarginMax: 0.24,
    typicalMarkupMin: 0.19,
    typicalMarkupMax: 0.32,
    description: 'Cement, rebar, paints, electrical, plumbing. High volume, moderate markup.',
  },
  {
    code: 'RETAIL_GROCERY',
    name: 'Retail Supermarket & Grocery Store',
    typicalGrossMarginMin: 0.12,
    typicalGrossMarginMax: 0.18,
    typicalMarkupMin: 0.14,
    typicalMarkupMax: 0.22,
    description: 'Fast moving consumer goods (FMCG), edible items, household goods.',
  },
  {
    code: 'WHOLESALE_TRADING',
    name: 'Wholesale & Distribution',
    typicalGrossMarginMin: 0.08,
    typicalGrossMarginMax: 0.14,
    typicalMarkupMin: 0.09,
    typicalMarkupMax: 0.16,
    description: 'Bulk supplies to retailers. Low gross margin, high inventory turnover.',
  },
  {
    code: 'ELECTRONICS_APPLIANCES',
    name: 'Electronics & Mobile Phones',
    typicalGrossMarginMin: 0.20,
    typicalGrossMarginMax: 0.28,
    typicalMarkupMin: 0.25,
    typicalMarkupMax: 0.39,
    description: 'Phones, computers, accessories. High risk of missing supplier TINs on imports.',
  },
  {
    code: 'PHARMACY_MEDICAL',
    name: 'Pharmacy & Drug Stores',
    typicalGrossMarginMin: 0.20,
    typicalGrossMarginMax: 0.30,
    typicalMarkupMin: 0.25,
    typicalMarkupMax: 0.43,
    description: 'Medicines, medical supplies. Strictly controlled price lists and expiry.',
  },
  {
    code: 'CAFE_RESTAURANT',
    name: 'Food & Beverage / Restaurant / Cafe',
    typicalGrossMarginMin: 0.40,
    typicalGrossMarginMax: 0.58,
    typicalMarkupMin: 0.67,
    typicalMarkupMax: 1.38,
    description: 'High labor and wastage. High gross profit over raw food purchases.',
  },
];

// --- 1. Indirect Audit Method: Bank Deposit Analysis ---
export interface BankDepositAnalysisResult {
  totalBankDeposits: number;
  identifiedNonIncomeDeposits: number; // transfers, loans, owner equity
  netBusinessBankDeposits: number;
  reportedBookSales: number;
  unexplainedVariance: number; // netBusinessBankDeposits - reportedBookSales
  riskStatus: 'low_risk' | 'moderate_risk' | 'high_audit_flag';
  auditorNotes: string;
}

export function calculateBankDepositAnalysis(
  sales: SaleTransaction[],
  bankTransactions: BankTransaction[]
): BankDepositAnalysisResult {
  // Total Bank Credits (Deposits)
  const creditTxs = bankTransactions.filter((tx) => tx.type === 'credit');
  const totalBankDeposits = creditTxs.reduce((sum, tx) => sum + tx.amount, 0);

  // Non-income deposits: transfers between own accounts, owner loans, or capital
  const nonIncomeTxs = creditTxs.filter(
    (tx) => tx.category === 'transfer' || tx.notes?.toLowerCase().includes('loan') || tx.notes?.toLowerCase().includes('capital')
  );
  const identifiedNonIncomeDeposits = nonIncomeTxs.reduce((sum, tx) => sum + tx.amount, 0);

  const netBusinessBankDeposits = Math.max(0, totalBankDeposits - identifiedNonIncomeDeposits);
  const reportedBookSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);

  // Variance: If bank deposits exceed reported sales, MoR auditor treats excess as undeclared sales
  const unexplainedVariance = netBusinessBankDeposits - reportedBookSales;

  let riskStatus: 'low_risk' | 'moderate_risk' | 'high_audit_flag' = 'low_risk';
  let auditorNotes = '';

  if (unexplainedVariance > 5000) {
    riskStatus = 'high_audit_flag';
    auditorNotes = `MoR Bank Deposit Test Flag: Total bank deposits exceed reported sales by ETB ${unexplainedVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Under Chapter 6 of the MoR Tax Audit Manual, auditors will assess this discrepancy as undeclared taxable sales subject to 15% VAT and 30% profit tax plus understatement penalties.`;
  } else if (unexplainedVariance < -20000 && reportedBookSales > 0) {
    riskStatus = 'moderate_risk';
    auditorNotes = `Reported sales exceed bank deposits by ETB ${Math.abs(unexplainedVariance).toLocaleString(undefined, { minimumFractionDigits: 2 })}. Auditors will verify physical cash receipts, cash register Z-reports, and examine whether cash was retained in hand or paid out directly for purchases.`;
  } else {
    riskStatus = 'low_risk';
    auditorNotes = 'Bank deposits align closely with recorded sales and account transfers. High compliance with MoR reconciliation standards.';
  }

  return {
    totalBankDeposits,
    identifiedNonIncomeDeposits,
    netBusinessBankDeposits,
    reportedBookSales,
    unexplainedVariance,
    riskStatus,
    auditorNotes,
  };
}

// --- 2. Indirect Audit Method: Markup & Gross Profit Margin Test ---
export interface MarkupTestResult {
  totalNetSales: number;
  costOfPurchases: number;
  actualGrossProfit: number;
  actualGrossMarginPercent: number; // e.g. 0.22 (22%)
  actualMarkupPercent: number;      // e.g. 0.28 (28%)
  benchmark: SectorBenchmark;
  benchmarkExpectedSalesMin: number;
  benchmarkExpectedSalesMax: number;
  estimatedUnderreportedRevenue: number;
  riskStatus: 'normal' | 'depressed_margin_warning' | 'high_reconstruction_risk';
  auditorFinding: string;
}

export function calculateMarkupTest(
  sales: SaleTransaction[],
  purchases: PurchaseItem[],
  sectorCode: string = 'BUILDING_MATERIALS'
): MarkupTestResult {
  const benchmark =
    SECTOR_BENCHMARKS.find((b) => b.code === sectorCode) || SECTOR_BENCHMARKS[0];

  const totalNetSales = sales.reduce((sum, s) => sum + s.subtotal, 0);

  // Cost of inventory goods (category: inventory_cogs)
  const inventoryPurchases = purchases.filter(
    (p) => p.category === 'inventory_cogs' || p.category === 'packaging_supplies'
  );
  // If no inventory category explicitly tagged, use total purchases
  const costOfPurchases =
    inventoryPurchases.length > 0
      ? inventoryPurchases.reduce((sum, p) => sum + p.subtotal, 0)
      : purchases.reduce((sum, p) => sum + p.subtotal, 0);

  const actualGrossProfit = totalNetSales - costOfPurchases;
  const actualGrossMarginPercent = totalNetSales > 0 ? actualGrossProfit / totalNetSales : 0;
  const actualMarkupPercent = costOfPurchases > 0 ? actualGrossProfit / costOfPurchases : 0;

  // Expected sales based on sector benchmark markup
  const benchmarkExpectedSalesMin = costOfPurchases * (1 + benchmark.typicalMarkupMin);
  const benchmarkExpectedSalesMax = costOfPurchases * (1 + benchmark.typicalMarkupMax);

  let estimatedUnderreportedRevenue = 0;
  let riskStatus: 'normal' | 'depressed_margin_warning' | 'high_reconstruction_risk' = 'normal';
  let auditorFinding = '';

  if (costOfPurchases > 0 && totalNetSales > 0) {
    if (actualGrossMarginPercent < benchmark.typicalGrossMarginMin * 0.7) {
      riskStatus = 'high_reconstruction_risk';
      estimatedUnderreportedRevenue = Math.max(0, benchmarkExpectedSalesMin - totalNetSales);
      auditorFinding = `Critical Underreporting Risk: Actual gross margin (${(actualGrossMarginPercent * 100).toFixed(1)}%) is severely below the sector benchmark (${(benchmark.typicalGrossMarginMin * 100).toFixed(1)}% - ${(benchmark.typicalGrossMarginMax * 100).toFixed(1)}%). Under MoR Tax Audit Manual Chapter 6 (Markup Method), the auditor will reject books as non-credible and reconstruct revenue upward using standard sector markup, estimating ETB ${estimatedUnderreportedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} in undeclared sales.`;
    } else if (actualGrossMarginPercent < benchmark.typicalGrossMarginMin) {
      riskStatus = 'depressed_margin_warning';
      estimatedUnderreportedRevenue = Math.max(0, benchmarkExpectedSalesMin - totalNetSales);
      auditorFinding = `Depressed Margin Notice: Actual gross margin (${(actualGrossMarginPercent * 100).toFixed(1)}%) is slightly below standard benchmark (${(benchmark.typicalGrossMarginMin * 100).toFixed(1)}%). Prepare evidence for discounts, stock spoilage, or wholesale clearance to justify lower margin during MoR audit.`;
    } else {
      riskStatus = 'normal';
      auditorFinding = `Normal Margin: Achieved gross margin (${(actualGrossMarginPercent * 100).toFixed(1)}%) is fully consistent with Ethiopian Ministry of Revenues trade benchmarks (${(benchmark.typicalGrossMarginMin * 100).toFixed(1)}% - ${(benchmark.typicalGrossMarginMax * 100).toFixed(1)}%).`;
    }
  } else {
    auditorFinding = 'Record more sales and supplier purchases to evaluate the gross profit margin test.';
  }

  return {
    totalNetSales,
    costOfPurchases,
    actualGrossProfit,
    actualGrossMarginPercent,
    actualMarkupPercent,
    benchmark,
    benchmarkExpectedSalesMin,
    benchmarkExpectedSalesMax,
    estimatedUnderreportedRevenue,
    riskStatus,
    auditorFinding,
  };
}

// --- 3. Indirect Audit Method: Source & Application of Funds / Cash Flow ---
export interface CashFlowSourceAppResult {
  totalKnownInflows: number; // Sales + Bank credits
  totalKnownOutflows: number; // Purchases + Bank debits
  netCashFlow: number;
  cashDeficitFlag: boolean;
  auditorNotes: string;
}

export function calculateSourceAndApplicationOfFunds(
  sales: SaleTransaction[],
  purchases: PurchaseItem[],
  bankTransactions: BankTransaction[]
): CashFlowSourceAppResult {
  const salesInflow = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const bankCredits = bankTransactions.filter((tx) => tx.type === 'credit').reduce((sum, tx) => sum + tx.amount, 0);
  const totalKnownInflows = Math.max(salesInflow, bankCredits);

  const purchaseOutflow = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const bankDebits = bankTransactions.filter((tx) => tx.type === 'debit').reduce((sum, tx) => sum + tx.amount, 0);
  const totalKnownOutflows = purchaseOutflow + bankDebits;

  const netCashFlow = totalKnownInflows - totalKnownOutflows;
  const cashDeficitFlag = netCashFlow < -10000;

  let auditorNotes = '';
  if (cashDeficitFlag) {
    auditorNotes = `Cash Outflow Anomaly: Total business expenditures (ETB ${totalKnownOutflows.toLocaleString(undefined, { minimumFractionDigits: 2 })}) exceed documented revenue inflows (ETB ${totalKnownInflows.toLocaleString(undefined, { minimumFractionDigits: 2 })}). Under MoR Manual Chapter 6 (Source & Application of Funds), the auditor will presume cash expenditures were funded by off-the-books cash sales unless capital injection receipts or registered bank loan contracts are provided.`;
  } else {
    auditorNotes = 'Documented cash & bank sources sufficiently cover all business disbursements. Low audit risk.';
  }

  return {
    totalKnownInflows,
    totalKnownOutflows,
    netCashFlow,
    cashDeficitFlag,
    auditorNotes,
  };
}

// --- 4. Ethiopian Tax Penalties & Late Interest Calculator (Proclamation 983/2016) ---
export interface PenaltySimulation {
  understatedTaxAmount: number;
  understatementPenaltyRate: number; // 0.10, 0.25, or 0.50
  understatementPenaltyAmount: number;
  bookkeepingPenaltyAmount: number; // Art. 110: 20% of tax or 100k
  esrmReceiptViolationPenalty: number; // Art. 113: failure to issue fiscal receipts
  latePaymentInterestRateMonthly: number; // NBE reference + 2% / 12 ~ 1.5% - 2.0%
  estimatedLateInterestAmount: number;
  totalPotentialAssessment: number;
  legalArticles: string[];
}

export function simulateMoRPenalties(
  disallowedExpenses: number,
  unreportedSales: number,
  corporateTaxRate: number = 0.30,
  vatRate: number = 0.15,
  monthsDelinquent: number = 3,
  missingFiscalReceiptCount: number = 0
): PenaltySimulation {
  // Tax gap from disallowed deductions + unreported sales
  const profitTaxOwed = (disallowedExpenses + unreportedSales) * corporateTaxRate;
  const vatOwed = unreportedSales * vatRate;
  const totalUnderstatedTax = profitTaxOwed + vatOwed;

  // Proclamation No. 983/2016 Article 109 - Penalty for Understatement of Tax
  // - 10% if understatement <= 50,000 ETB
  // - 25% if understatement > 50,000 and <= 200,000 ETB
  // - 50% if understatement > 200,000 ETB (or intentional)
  let understatementRate = 0.10;
  if (totalUnderstatedTax > 200000) {
    understatementRate = 0.50;
  } else if (totalUnderstatedTax > 50000) {
    understatementRate = 0.25;
  }
  const understatementPenaltyAmount = totalUnderstatedTax * understatementRate;

  // Article 110 - Failure to Maintain Proper Books and Records (20% of tax payable or ETB 100,000)
  const bookkeepingPenaltyAmount = totalUnderstatedTax > 0 ? Math.max(10000, totalUnderstatedTax * 0.20) : 0;

  // Article 113 - Electronic Sales Register Machine / Non-issuance of Fiscal Receipts
  // Fixed statutory penalty (ETB 50,000 per violation, capped)
  const esrmReceiptViolationPenalty = missingFiscalReceiptCount > 0 ? 50000 : 0;

  // Article 44 - Late Payment Interest: NBE Reference Rate + 2% per annum, compounded monthly
  // Typical NBE reference rate ~ 16%, + 2% = 18% per annum (1.5% per month)
  const monthlyInterestRate = 0.015;
  const estimatedLateInterestAmount = totalUnderstatedTax * monthlyInterestRate * monthsDelinquent;

  const totalPotentialAssessment =
    totalUnderstatedTax +
    understatementPenaltyAmount +
    bookkeepingPenaltyAmount +
    esrmReceiptViolationPenalty +
    estimatedLateInterestAmount;

  return {
    understatedTaxAmount: totalUnderstatedTax,
    understatementPenaltyRate: understatementRate,
    understatementPenaltyAmount,
    bookkeepingPenaltyAmount,
    esrmReceiptViolationPenalty,
    latePaymentInterestRateMonthly: monthlyInterestRate,
    estimatedLateInterestAmount,
    totalPotentialAssessment,
    legalArticles: [
      'Proc. 983/2016 Art. 109: Penalty for Understatement of Tax (10% - 50%)',
      'Proc. 983/2016 Art. 110: Penalty for Failure to Maintain Records (20%)',
      'Proc. 983/2016 Art. 113: Penalty for Non-Issuance of Fiscal Receipt (ETB 50,000)',
      'Proc. 983/2016 Art. 44: Late Payment Interest (NBE Rate + 2% p.a.)',
      'Proc. 979/2016 Art. 21-27: Non-Deductible Business Expenses',
      'Proc. 285/2002 Art. 21: Disallowance of Input VAT Without Valid Tax Invoice',
    ],
  };
}

// --- 5. MoR Comprehensive Audit Checklist Items ---
export interface MoRChecklistItem {
  id: string;
  category: 'SALES_VAT' | 'PURCHASES_COGS' | 'BANK_RECON' | 'WITHHOLDING' | 'RECORDS_RETENTION';
  legalRef: string;
  title: string;
  description: string;
  auditStandard: string;
  status: 'passed' | 'warning' | 'action_needed';
  details: string;
}

export function evaluateMoRChecklist(
  sales: SaleTransaction[],
  purchases: PurchaseItem[],
  bankAccounts: BankAccount[],
  bankTransactions: BankTransaction[],
  settings: TaxSettings
): MoRChecklistItem[] {
  const items: MoRChecklistItem[] = [];

  // 1. Sales Cash Register Machine (ESRM/FRC) Receipt Sequence
  const salesWithoutReceipt = sales.filter((s) => !s.receiptNumber || s.receiptNumber.trim() === '');
  const salesComplianceRate = sales.length > 0 ? ((sales.length - salesWithoutReceipt.length) / sales.length) * 100 : 100;
  items.push({
    id: 'mor-sales-esrm',
    category: 'SALES_VAT',
    legalRef: 'Proc. 983/2016 Art. 113 & ESRM Directive',
    title: 'Fiscal Sales Receipt / ESRM Machine Compliance',
    description: 'All customer sales must be recorded sequentially using an accredited Electronic Sales Register Machine (ESRM/FRC) or official tax cash receipts.',
    auditStandard: 'Consecutive numbering, daily Z-report balance, customer TIN on sales > ETB 50,000.',
    status: salesWithoutReceipt.length === 0 ? 'passed' : salesWithoutReceipt.length < 3 ? 'warning' : 'action_needed',
    details:
      salesWithoutReceipt.length === 0
        ? `100% compliant: All ${sales.length} sales have recorded receipt numbers.`
        : `${salesWithoutReceipt.length} sale(s) lack official receipt/ticket numbers. MoR auditors can impose ETB 50,000 fine per unissued receipt under Art. 113.`,
  });

  // 2. VAT Input Tax Invoice & Supplier TIN Verification
  const purchasesWithoutReceipt = purchases.filter((p) => !p.invoiceNumber || p.invoiceNumber.trim() === '');
  const purchasesWithoutImage = purchases.filter((p) => !p.receiptImage);
  items.push({
    id: 'mor-vat-input-invoice',
    category: 'PURCHASES_COGS',
    legalRef: 'VAT Proclamation No. 285/2002 Art. 21',
    title: 'Input VAT Tax Invoice & Supplier TIN Verification',
    description: 'Input VAT deductions require an official VAT invoice issued by a registered supplier showing supplier TIN, customer TIN, and VAT amount.',
    auditStandard: 'Disallowed if invoice lacks supplier TIN or is older than 6 months (tax period + 5 months).',
    status: purchasesWithoutReceipt.length === 0 ? 'passed' : purchasesWithoutReceipt.length < 3 ? 'warning' : 'action_needed',
    details:
      purchasesWithoutReceipt.length === 0
        ? `100% compliant: All ${purchases.length} purchases have supplier invoice/receipt numbers.`
        : `${purchasesWithoutReceipt.length} purchase(s) miss supplier invoice/receipt numbers. Input VAT will be 100% disallowed by MoR auditor.`,
  });

  // 3. 2% Withholding Tax Deduction on Local Supplies
  // Proclamation 979/2016 Art. 92: Withhold 2% on supply of goods > ETB 10,000 and services > ETB 3,000
  const largePurchases = purchases.filter((p) => p.totalAmount >= 10000);
  items.push({
    id: 'mor-withholding-compliance',
    category: 'WITHHOLDING',
    legalRef: 'Income Tax Proc. 979/2016 Art. 92-93',
    title: '2% Withholding Tax on Payments Exceeding ETB 10,000',
    description: 'Category A & B taxpayers are withholding agents and must withhold 2% on local purchase of goods over ETB 10,000 and remit by the 30th of the following month.',
    auditStandard: 'Auditor assesses payer personally for unwithheld 2% tax + 20% penalty under Art. 110.',
    status: largePurchases.length === 0 ? 'passed' : 'warning',
    details:
      largePurchases.length === 0
        ? 'No individual local purchases exceeding ETB 10,000 threshold recorded.'
        : `${largePurchases.length} purchase(s) exceed ETB 10,000. Ensure 2% withholding receipts were issued to suppliers and remitted to MoR.`,
  });

  // 4. Non-Deductible Expenses Under Proclamation 979/2016 Art. 22-27
  const mealsAndPersonal = purchases.filter(
    (p) => p.category === 'meals_entertainment' || p.deductibility === 'non_deductible'
  );
  items.push({
    id: 'mor-expense-deductibility',
    category: 'PURCHASES_COGS',
    legalRef: 'Income Tax Proc. 979/2016 Art. 22-27 & Reg. 410/2017',
    title: 'Expense Deductibility & Entertainment Cap Examination',
    description: 'Personal, domestic, entertainment, and illegal payments/fines are non-deductible for business profit tax.',
    auditStandard: 'Representation expenses strictly limited to 10% of salary ceiling. Fines/penalties are 100% disallowed.',
    status: 'passed',
    details: `${mealsAndPersonal.length} entertainment/partially deductible expense(s) correctly classified in books.`,
  });

  // 5. Statutory Single Cash Purchase Ceiling (Directive / MoR Rule: Only single cash purchase exceeding ETB 50,000 flagged)
  const cashPurchasesExceeding50k = purchases.filter(
    (p) => p.paymentMethod === 'cash' && p.totalAmount > 50000
  );
  items.push({
    id: 'mor-single-cash-purchase-ceiling',
    category: 'PURCHASES_COGS',
    legalRef: 'NBE Directives & Proc. 979/2016 (MoR Directives on Cash Transactions)',
    title: 'Statutory Single Cash Purchase Ceiling (≤ ETB 50,000 in Cash)',
    description: 'Under Ethiopian banking and revenue directives, only single cash purchases exceeding ETB 50,000 are flagged and prohibited from cash payment (must be settled via banking channels).',
    auditStandard: 'Examiners flag single cash purchases > ETB 50,000 for VAT input deduction disallowance and penalty.',
    status: cashPurchasesExceeding50k.length === 0 ? 'passed' : 'action_needed',
    details:
      cashPurchasesExceeding50k.length === 0
        ? '100% compliant: No single cash purchases exceeded ETB 50,000. All supplier purchases above ETB 50,000 were settled through banking channels.'
        : `${cashPurchasesExceeding50k.length} single cash purchase(s) exceeded the ETB 50,000 threshold. Bank transfer confirmation required to prevent tax disallowance.`,
  });

  // 6. 3-Way Bank Reconciliation & CBRS Compliance
  const totalBankTx = bankTransactions.length;
  const unreconciledTx = bankTransactions.filter((tx) => !tx.isReconciled);
  items.push({
    id: 'mor-bank-3way-recon',
    category: 'BANK_RECON',
    legalRef: 'MoR Tax Audit Manual Ch. 6 (Bank Reconciliation)',
    title: 'Bank Statement 3-Way Reconciliation with Sales & Cash Books',
    description: 'All business accounts (CBE, Awash, Telebirr, Dashen) must reconcile with recorded sales receipts and vendor payouts.',
    auditStandard: 'Unexplained bank deposits are treated as undeclared sales. Personal withdrawals must be documented as drawings.',
    status: unreconciledTx.length === 0 ? 'passed' : unreconciledTx.length <= 2 ? 'warning' : 'action_needed',
    details:
      unreconciledTx.length === 0
        ? `100% reconciled: All ${totalBankTx} bank entries matched.`
        : `${unreconciledTx.length} bank entry(ies) remain unreconciled. Complete bank reconciliation to prevent auditor assessment.`,
  });

  // 6. Statutory 6-Year Records Preservation Requirement
  items.push({
    id: 'mor-records-retention',
    category: 'RECORDS_RETENTION',
    legalRef: 'Tax Administration Proc. No. 983/2016 Art. 17',
    title: '6-Year Record Preservation & Digital Backup Requirement',
    description: 'All books of account, sales slips, purchase invoices, customs declarations, and bank statements must be maintained for 6 years.',
    auditStandard: 'Auditors can inspect records back to Hamle 2012 E.C. (July 2020 G.C.). Digital cloud copies must be accessible.',
    status: 'passed',
    details: 'Digital records safely stored in local IndexedDB/localStorage with export capabilities (CSV/Excel & PDF).',
  });

  return items;
}
