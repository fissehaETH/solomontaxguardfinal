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

// --- 1. Indirect Audit Method: Bank Deposit Analysis (Considering Reason & Category) ---
export interface BankDepositCategoryItem {
  category: BankTransaction['category'];
  label: string;
  type: 'credit' | 'debit';
  count: number;
  amount: number;
  taxTreatment: string;
  isTaxableSalesDeposit: boolean;
  isExemptOrNonIncome: boolean;
  riskLevel: 'compliant' | 'warning' | 'high_risk';
}

export interface BankDepositAnalysisResult {
  totalBankDeposits: number;
  identifiedNonIncomeDeposits: number; // transfers, loans, owner equity verified by reason/category
  verifiedSalesDeposits: number; // deposits verified as sales
  unexplainedDeposits: number; // deposits with vague or missing reason/category
  netBusinessBankDeposits: number;
  reportedBookSales: number;
  unexplainedVariance: number; // netBusinessBankDeposits - reportedBookSales
  riskStatus: 'low_risk' | 'moderate_risk' | 'high_audit_flag';
  auditorNotes: string;
  categoryBreakdown: BankDepositCategoryItem[];
  reasonAuditDiscrepanciesCount: number;
}

export function calculateBankDepositAnalysis(
  sales: SaleTransaction[],
  bankTransactions: BankTransaction[]
): BankDepositAnalysisResult {
  // Total Bank Credits (Deposits)
  const creditTxs = bankTransactions.filter((tx) => tx.type === 'credit');
  const totalBankDeposits = creditTxs.reduce((sum, tx) => sum + tx.amount, 0);

  let verifiedSalesDeposits = 0;
  let identifiedNonIncomeDeposits = 0;
  let unexplainedDeposits = 0;
  let reasonAuditDiscrepanciesCount = 0;

  // Breakdown by Category map
  const categoryMap: Record<
    string,
    {
      count: number;
      amount: number;
      category: BankTransaction['category'];
      label: string;
      taxTreatment: string;
      isTaxableSalesDeposit: boolean;
      isExemptOrNonIncome: boolean;
      riskLevel: 'compliant' | 'warning' | 'high_risk';
    }
  > = {};

  creditTxs.forEach((tx) => {
    const rawReason = (tx.reason || tx.description || '').toLowerCase();
    const rawNotes = (tx.notes || '').toLowerCase();
    const fullText = `${rawReason} ${rawNotes}`;

    // Test for loan or capital keywords in reason/memo
    const isLoanOrCapitalReason =
      /(?:shareholder\s*loan|director\s*loan|capital\s*injection|capital\s*deposit|equity|owner\s*funds?|bank\s*loan|term\s*loan|infusion)/i.test(
        fullText
      );

    // Test for transfer keywords
    const isTransferReason =
      /(?:transfer\s*from|internal\s*transfer|contra|own\s*account|tax\s*reserve|escrow)/i.test(
        fullText
      );

    // Test for sales keywords in reason
    const isSalesReason =
      /(?:sale|invoice|customer|payment\s*for|pos\s*settlement|daily\s*cash|telebirr\s*merchant|store)/i.test(
        fullText
      );

    let isNonIncome = false;
    let isSales = false;
    let isUnexplained = false;

    if (tx.category === 'loan_infusion' || isLoanOrCapitalReason) {
      isNonIncome = true;
      identifiedNonIncomeDeposits += tx.amount;
    } else if (tx.category === 'transfer' || isTransferReason) {
      // If tagged as transfer but reason explicitly states it's customer payment for sales:
      if (isSalesReason) {
        reasonAuditDiscrepanciesCount += 1;
        isSales = true;
        verifiedSalesDeposits += tx.amount;
      } else {
        isNonIncome = true;
        identifiedNonIncomeDeposits += tx.amount;
      }
    } else if (
      tx.category === 'sale_deposit' ||
      tx.category === 'sales_cash_deposit' ||
      tx.category === 'card_settlement' ||
      isSalesReason
    ) {
      isSales = true;
      verifiedSalesDeposits += tx.amount;
    } else {
      // Category is other or undefined
      if (isLoanOrCapitalReason || isTransferReason) {
        isNonIncome = true;
        identifiedNonIncomeDeposits += tx.amount;
      } else {
        isUnexplained = true;
        unexplainedDeposits += tx.amount;
        if (tx.amount > 5000) reasonAuditDiscrepanciesCount += 1;
      }
    }

    // Accumulate category map
    const catKey = tx.category || 'other';
    if (!categoryMap[catKey]) {
      let label = 'Other Bank Deposit';
      let taxTreatment = 'Unexplained Inflow (MoR Assesses as Taxable Sales)';
      let riskLevel: 'compliant' | 'warning' | 'high_risk' = 'warning';

      switch (catKey) {
        case 'sale_deposit':
          label = 'Sales Transfer Deposit';
          taxTreatment = 'Taxable Operating Sales Revenue (Subject to 15% VAT & Profit Tax)';
          riskLevel = 'compliant';
          break;
        case 'sales_cash_deposit':
          label = 'Store Cash Register Deposit';
          taxTreatment = 'Taxable Operating Sales Revenue (Cross-checked against daily register)';
          riskLevel = 'compliant';
          break;
        case 'card_settlement':
          label = 'POS & Telebirr Settlements';
          taxTreatment = 'Taxable Operating Sales Revenue (Electronic merchant credits)';
          riskLevel = 'compliant';
          break;
        case 'loan_infusion':
          label = 'Capital & Shareholder Loan Infusion';
          taxTreatment = 'Non-Taxable Capital Inflow (Must have loan contract / board resolution)';
          riskLevel = 'compliant';
          break;
        case 'transfer':
          label = 'Inter-Account Transfer';
          taxTreatment = 'Non-Taxable Internal Transfer (Contra movement)';
          riskLevel = 'compliant';
          break;
        case 'personal_drawing':
          label = 'Owner Personal Deposit';
          taxTreatment = 'Non-Taxable Capital Return (Auditor verifies private source)';
          riskLevel = 'warning';
          break;
        default:
          label = 'Unclassified Bank Deposit';
          taxTreatment = 'High Audit Risk (Presumed undeclared sales under MoR Manual Ch. 6)';
          riskLevel = 'high_risk';
          break;
      }

      categoryMap[catKey] = {
        category: catKey,
        label,
        count: 0,
        amount: 0,
        taxTreatment,
        isTaxableSalesDeposit: isSales,
        isExemptOrNonIncome: isNonIncome,
        riskLevel,
      };
    }

    categoryMap[catKey].count += 1;
    categoryMap[catKey].amount += tx.amount;
  });

  const categoryBreakdown: BankDepositCategoryItem[] = Object.values(categoryMap).map((item) => ({
    ...item,
    type: 'credit' as const,
  }));

  const netBusinessBankDeposits = Math.max(0, totalBankDeposits - identifiedNonIncomeDeposits);
  const reportedBookSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);

  // Variance: If net business deposits exceed reported book sales, MoR treats excess as undeclared sales
  const unexplainedVariance = netBusinessBankDeposits - reportedBookSales;

  let riskStatus: 'low_risk' | 'moderate_risk' | 'high_audit_flag' = 'low_risk';
  let auditorNotes = '';

  if (unexplainedVariance > 5000) {
    riskStatus = 'high_audit_flag';
    auditorNotes = `MoR Bank Deposit Test Flag: Net business bank deposits (ETB ${netBusinessBankDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}) exceed reported sales (ETB ${reportedBookSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}) by ETB ${unexplainedVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}. After considering bank Reason and Category, ETB ${identifiedNonIncomeDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })} was recognized as non-taxable loans/transfers. The remaining discrepancy of ETB ${unexplainedVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })} is flagged by MoR auditors under Chapter 6 as undeclared taxable sales subject to 15% VAT and 30% profit tax plus understatement penalties.`;
  } else if (unexplainedVariance < -20000 && reportedBookSales > 0) {
    riskStatus = 'moderate_risk';
    auditorNotes = `Reported sales exceed verified bank deposits by ETB ${Math.abs(unexplainedVariance).toLocaleString(undefined, { minimumFractionDigits: 2 })}. Auditors will verify cash register Z-reports and examine whether customer cash was retained in hand or paid out directly for cash purchases.`;
  } else {
    riskStatus = 'low_risk';
    auditorNotes = `Bank deposits and stated reasons/categories align closely with recorded sales books. Identified non-income deposits (ETB ${identifiedNonIncomeDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}) are cleanly accounted for. High compliance with MoR reconciliation standards.`;
  }

  return {
    totalBankDeposits,
    identifiedNonIncomeDeposits,
    verifiedSalesDeposits,
    unexplainedDeposits,
    netBusinessBankDeposits,
    reportedBookSales,
    unexplainedVariance,
    riskStatus,
    auditorNotes,
    categoryBreakdown,
    reasonAuditDiscrepanciesCount,
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

  // 7. Bank Payment Reason & Category Forensic Audit
  const bankReasonAudit = auditBankReasonAndCategory(bankTransactions, purchases, sales);
  items.push({
    id: 'mor-bank-reason-category-audit',
    category: 'BANK_RECON',
    legalRef: 'Proc. 979/2016 Art. 22 & 27, Proc. 983/2016 Art. 109 & Ch. 6',
    title: 'Bank Statement Reason & Category Tax Examination',
    description: 'Every bank statement narration, payment reason, and category must be scrutinized to disallow personal drawings and identify non-income capital vs taxable sales.',
    auditStandard: 'Disallow non-business debits (Art. 27). Treat unexplained credits as undeclared revenue (Ch. 6). Require third-party invoice cross-reference.',
    status: bankReasonAudit.highRiskCount === 0 ? (bankReasonAudit.warningCount === 0 ? 'passed' : 'warning') : 'action_needed',
    details:
      bankReasonAudit.highRiskCount === 0
        ? `100% compliant: All ${bankTransactions.length} bank transactions have verified business categories and compliant payment reasons.`
        : `${bankReasonAudit.highRiskCount} bank transaction(s) flagged with high-risk reasons/categories (disallowed personal expense risk: ETB ${bankReasonAudit.totalDisallowedPersonalDrawings.toLocaleString(undefined, { minimumFractionDigits: 2 })}; unexplained deposits: ETB ${bankReasonAudit.totalUnexplainedDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
  });

  return items;
}

// --- 6. Comprehensive Bank Reason & Category Audit Engine ---
export interface BankReasonAuditItem {
  id: string;
  txId: string;
  date: string;
  bankAccountId: string;
  type: 'credit' | 'debit';
  amount: number;
  category: BankTransaction['category'];
  categoryLabel: string;
  description: string;
  reason: string;
  notes?: string;

  taxClassification:
    | 'taxable_operating_revenue'
    | 'nontaxable_capital_or_loan'
    | 'nontaxable_interaccount_transfer'
    | 'allowable_business_deduction'
    | 'disallowed_personal_drawing'
    | 'disallowed_fine_penalty'
    | 'statutory_tax_remittance'
    | 'deductible_bank_service_charge'
    | 'unexplained_audit_risk';

  status: 'compliant' | 'warning' | 'high_risk_flag';
  reasonClarity: 'detailed' | 'adequate' | 'vague_or_missing';
  discrepancyTitle?: string;
  discrepancyDetail?: string;
  legalBasis: string;
  auditorRecommendation: string;
}

export interface BankReasonCategoryAuditSummary {
  totalAuditedCount: number;
  totalCreditsCount: number;
  totalDebitsCount: number;

  compliantCount: number;
  warningCount: number;
  highRiskCount: number;
  auditReadinessScore: number; // 0 - 100

  // Financial aggregates determined from reason & category examination
  totalSalesDeposits: number;
  totalCapitalAndLoansVerified: number;
  totalInternalTransfers: number;
  totalUnexplainedDeposits: number;

  totalDeductibleSupplierExpenses: number;
  totalDisallowedPersonalDrawings: number;
  totalDisallowedFinesPenalties: number;
  totalTaxRemittancesToMoR: number;
  totalDeductibleBankCharges: number;
  totalUnexplainedDebits: number;

  categoryBreakdown: {
    category: BankTransaction['category'];
    label: string;
    flowType: 'credit' | 'debit';
    count: number;
    amount: number;
    taxTreatment: string;
    auditStatus: 'compliant' | 'warning' | 'high_risk_flag';
  }[];

  items: BankReasonAuditItem[];
}

export function auditBankReasonAndCategory(
  bankTransactions: BankTransaction[],
  purchases: PurchaseItem[] = [],
  sales: SaleTransaction[] = []
): BankReasonCategoryAuditSummary {
  let totalSalesDeposits = 0;
  let totalCapitalAndLoansVerified = 0;
  let totalInternalTransfers = 0;
  let totalUnexplainedDeposits = 0;

  let totalDeductibleSupplierExpenses = 0;
  let totalDisallowedPersonalDrawings = 0;
  let totalDisallowedFinesPenalties = 0;
  let totalTaxRemittancesToMoR = 0;
  let totalDeductibleBankCharges = 0;
  let totalUnexplainedDebits = 0;

  let compliantCount = 0;
  let warningCount = 0;
  let highRiskCount = 0;

  const items: BankReasonAuditItem[] = [];
  const categoryMap: Record<
    string,
    {
      category: BankTransaction['category'];
      label: string;
      flowType: 'credit' | 'debit';
      count: number;
      amount: number;
      taxTreatment: string;
      auditStatus: 'compliant' | 'warning' | 'high_risk_flag';
    }
  > = {};

  bankTransactions.forEach((tx) => {
    const rawReason = (tx.reason || tx.description || '').trim();
    const rawNotes = (tx.notes || '').trim();
    const combinedReasonText = `${rawReason} ${rawNotes}`.toLowerCase();

    // Reason clarity evaluation
    let reasonClarity: 'detailed' | 'adequate' | 'vague_or_missing' = 'adequate';
    if (!rawReason || rawReason.length <= 4 || /^(bank entry|tx|transfer|deposit|withdrawal|payment|cash)$/i.test(rawReason)) {
      reasonClarity = 'vague_or_missing';
    } else if (rawReason.length >= 15 || /\b(?:inv(?:oice)?|chq|ref|cbe|awash|tin|tax|salary|suppl)\b/i.test(rawReason)) {
      reasonClarity = 'detailed';
    }

    // Friendly Category Label
    let categoryLabel = 'Other Bank Entry';
    switch (tx.category) {
      case 'sale_deposit':
        categoryLabel = 'Sales Electronic Deposit';
        break;
      case 'sales_cash_deposit':
        categoryLabel = 'Sales Cash Deposit';
        break;
      case 'card_settlement':
        categoryLabel = 'Card / POS / Telebirr Settlement';
        break;
      case 'vendor_payout':
        categoryLabel = 'Supplier / Vendor Payout';
        break;
      case 'personal_drawing':
        categoryLabel = 'Personal Drawing (Owner Private)';
        break;
      case 'loan_infusion':
        categoryLabel = 'Capital / Shareholder Loan';
        break;
      case 'tax_payment':
        categoryLabel = 'Tax Remittance to MoR';
        break;
      case 'bank_fee':
        categoryLabel = 'Bank Service Charge / Fee';
        break;
      case 'cash_withdraw':
        categoryLabel = 'Cash Withdrawal';
        break;
      case 'transfer':
        categoryLabel = 'Account Transfer';
        break;
      default:
        categoryLabel = 'Unclassified Bank Entry';
        break;
    }

    let taxClassification: BankReasonAuditItem['taxClassification'] = 'unexplained_audit_risk';
    let status: BankReasonAuditItem['status'] = 'compliant';
    let discrepancyTitle: string | undefined = undefined;
    let discrepancyDetail: string | undefined = undefined;
    let legalBasis = 'Tax Administration Proclamation No. 983/2016';
    let auditorRecommendation = 'Maintain verified supporting documentation for MoR audit.';

    // --- EXAMINATION FOR CREDITS (MONEY IN) ---
    if (tx.type === 'credit') {
      const isLoanOrCapital =
        tx.category === 'loan_infusion' ||
        /(?:shareholder\s*loan|director\s*loan|capital\s*injection|capital\s*deposit|equity|owner\s*funds?|bank\s*loan|term\s*loan|infusion)/i.test(
          combinedReasonText
        );

      const isTransfer =
        tx.category === 'transfer' ||
        /(?:transfer\s*from|internal\s*transfer|contra|own\s*account|tax\s*reserve|escrow)/i.test(
          combinedReasonText
        );

      const isSalesExplicit =
        /(?:sale|invoice|customer|payment\s*for|pos\s*settlement|daily\s*cash|telebirr\s*merchant|store)/i.test(
          combinedReasonText
        );

      if (isLoanOrCapital) {
        taxClassification = 'nontaxable_capital_or_loan';
        totalCapitalAndLoansVerified += tx.amount;
        legalBasis = 'Income Tax Proc. 979/2016 Art. 10 & 21 (Capital & Loan Injections)';

        if (tx.category !== 'loan_infusion') {
          status = 'warning';
          discrepancyTitle = 'Loan Infusion Lacks Category Tag';
          discrepancyDetail = `Bank reason mentions loan/capital ("${rawReason}"), but category is "${tx.category}". Tagging correctly prevents MoR auditors from treating this as taxable sales.`;
          auditorRecommendation = 'Formally classify as "Capital / Shareholder Loan" and file signed loan contract.';
        } else {
          status = 'compliant';
          auditorRecommendation = 'Ensure signed shareholder loan agreement or bank facility approval is retained under Art. 17.';
        }
      } else if (isTransfer) {
        // Discrepancy Check: Is it tagged as transfer but reason mentions sales / customer?
        if (isSalesExplicit) {
          taxClassification = 'taxable_operating_revenue';
          totalSalesDeposits += tx.amount;
          status = 'high_risk_flag';
          discrepancyTitle = 'Disguised Sales Deposit in Transfer Category';
          discrepancyDetail = `Transaction category is set to "Account Transfer", but the bank payment reason explicitly indicates customer sales or goods payment: "${rawReason}".`;
          legalBasis = 'Proc. 983/2016 Art. 109 (Understatement of Taxable Sales)';
          auditorRecommendation = 'Reclassify to Sales Deposit and declare in monthly VAT return to avoid 50% understatement penalty.';
        } else {
          taxClassification = 'nontaxable_interaccount_transfer';
          totalInternalTransfers += tx.amount;
          legalBasis = 'MoR Tax Audit Manual Ch. 6 (Inter-Account Transfers)';
          status = 'compliant';
          auditorRecommendation = 'Verify corresponding debit exists in source bank account.';
        }
      } else if (
        tx.category === 'sale_deposit' ||
        tx.category === 'sales_cash_deposit' ||
        tx.category === 'card_settlement' ||
        isSalesExplicit
      ) {
        taxClassification = 'taxable_operating_revenue';
        totalSalesDeposits += tx.amount;
        legalBasis = 'VAT Proclamation No. 285/2002 & Proc. 979/2016 (Gross Commercial Revenue)';

        if (reasonClarity === 'vague_or_missing') {
          status = 'warning';
          discrepancyTitle = 'Vague Sales Deposit Reason';
          discrepancyDetail = 'Bank narrative lacks customer name, invoice number, or store register date.';
          auditorRecommendation = 'Add invoice reference or cash register receipt range to reason for seamless 3-way reconciliation.';
        } else {
          status = 'compliant';
          auditorRecommendation = 'Verified operating sales deposit matching business activities.';
        }
      } else {
        // Unclassified Credit
        taxClassification = 'unexplained_audit_risk';
        totalUnexplainedDeposits += tx.amount;
        status = 'high_risk_flag';
        discrepancyTitle = 'Unexplained Bank Deposit';
        discrepancyDetail = `Deposit of ETB ${tx.amount.toLocaleString()} has unclassified category ("${tx.category}") and non-specific reason: "${rawReason || 'No reason provided'}".`;
        legalBasis = 'MoR Tax Audit Manual Ch. 6 (Bank Deposit Reconstruction Method)';
        auditorRecommendation = 'Provide bank credit voucher and documentation of source funds immediately to prevent MoR tax assessment.';
      }
    }

    // --- EXAMINATION FOR DEBITS (MONEY OUT) ---
    else {
      // 1. Personal Drawing Check (Proc 979/2016 Art. 27)
      const isPersonalDrawing =
        tx.category === 'personal_drawing' ||
        /(?:school\s*fees?|tuition|personal|family|wife|husband|child(?:ren)?|home\s*rent|house\s*rent|director\s*(?:drawings?|personal|loan\s*repay)|drawings?|allowance\s*private|holiday|vacation|groceries\s*(?:home|private)|private\s*car|personal\s*medical)/i.test(
          combinedReasonText
        );

      // 2. Fines and Penalties Check (Proc 979/2016 Art. 27(1)(e))
      const isFineOrPenalty =
        /(?:traffic\s*fine|police\s*fine|court\s*fine|late\s*filing\s*fee|penalty|statutory\s*fine|infraction|forfeit)/i.test(
          combinedReasonText
        );

      // 3. Tax Remittances to MoR
      const isTaxPayment =
        tx.category === 'tax_payment' ||
        /(?:ministry\s*of\s*revenues|mor\s*tax|erca|15%\s*vat|value\s*added\s*tax|profit\s*tax|income\s*tax|withholding\s*tax|2%\s*wht|tot\s*tax|customs\s*duty|tax\s*payment)/i.test(
          combinedReasonText
        );

      // 4. Bank Service Fees
      const isBankFee =
        tx.category === 'bank_fee' ||
        /(?:ledger\s*fee|service\s*chg|sms\s*alert|rtgs\s*charge|commission|maintenance\s*fee|cheque\s*clearing\s*fee|swift\s*fee|atm\s*fee)/i.test(
          combinedReasonText
        );

      // 5. Transfer Out
      const isTransferOut =
        tx.category === 'transfer' ||
        /(?:transfer\s*to|tax\s*reserve|savings\s*deposit|internal\s*transfer)/i.test(
          combinedReasonText
        );

      if (isPersonalDrawing) {
        taxClassification = 'disallowed_personal_drawing';
        totalDisallowedPersonalDrawings += tx.amount;
        status = 'high_risk_flag';
        discrepancyTitle = 'Disallowed Personal / Domestic Payment';
        discrepancyDetail = `Bank payment reason indicates personal expenditure: "${rawReason}". Under Article 27 of Proclamation 979/2016, domestic and personal expenses are strictly non-deductible.`;
        legalBasis = 'Income Tax Proc. 979/2016 Art. 27(1)(a) & (c) (Disallowance of Personal Expenses)';
        auditorRecommendation = 'Reclassify as Owner Equity Drawing. Remove from business expense claims to prevent audit disallowance & 20% penalty.';
      } else if (isFineOrPenalty) {
        taxClassification = 'disallowed_fine_penalty';
        totalDisallowedFinesPenalties += tx.amount;
        status = 'high_risk_flag';
        discrepancyTitle = 'Non-Deductible Government Fine / Penalty';
        discrepancyDetail = `Bank payment reason references fine or penalty: "${rawReason}". Proclamation 979/2016 Art. 27(1)(e) prohibits claiming fines as business expenses.`;
        legalBasis = 'Income Tax Proc. 979/2016 Art. 27(1)(e) (Disallowance of Fines & Penalties)';
        auditorRecommendation = 'Disallow 100% in tax computation. Exclude from profit tax deductible expenses.';
      } else if (isTaxPayment) {
        taxClassification = 'statutory_tax_remittance';
        totalTaxRemittancesToMoR += tx.amount;
        legalBasis = 'Tax Administration Proc. 983/2016 Art. 44 & VAT Proc. 285/2002';
        status = 'compliant';
        auditorRecommendation = 'Keep official MoR e-tax payment advice and bank transaction reference on file.';
      } else if (isBankFee) {
        taxClassification = 'deductible_bank_service_charge';
        totalDeductibleBankCharges += tx.amount;
        legalBasis = 'Income Tax Proc. 979/2016 Art. 22 (Ordinary & Necessary Financial Expenses)';
        status = 'compliant';
        auditorRecommendation = 'Fully allowable business deduction backed by bank statement debit entry.';
      } else if (isTransferOut) {
        taxClassification = 'nontaxable_interaccount_transfer';
        totalInternalTransfers += tx.amount;
        legalBasis = 'MoR Tax Audit Manual Ch. 6 (Inter-Account Transfers)';
        status = 'compliant';
        auditorRecommendation = 'Verify corresponding credit in recipient bank account.';
      } else if (tx.category === 'cash_withdraw') {
        legalBasis = 'NBE Directives on Cash Transactions & Proc. 979/2016';
        if (tx.amount > 50000) {
          taxClassification = 'allowable_business_deduction';
          status = 'warning';
          discrepancyTitle = 'Large Cash Withdrawal (> ETB 50,000)';
          discrepancyDetail = `Cash withdrawal of ETB ${tx.amount.toLocaleString()} exceeds statutory cash threshold. Auditors require cash book proof of disbursement.`;
          auditorRecommendation = 'Ensure petty cash vouchers and receipts are attached for all cash disbursements funded by this withdrawal.';
        } else {
          taxClassification = 'allowable_business_deduction';
          status = 'compliant';
          auditorRecommendation = 'Operating cash withdrawal; maintain petty cash drawer log.';
        }
      } else if (tx.category === 'vendor_payout') {
        legalBasis = 'VAT Proc. No. 285/2002 Art. 21 & Proc. 979/2016 Art. 22';
        if (reasonClarity === 'vague_or_missing') {
          taxClassification = 'unexplained_audit_risk';
          totalUnexplainedDebits += tx.amount;
          status = 'warning';
          discrepancyTitle = 'Supplier Payment Missing Invoice Reference';
          discrepancyDetail = `Bank reason ("${rawReason || 'Blank'}") does not state supplier name or invoice number. MoR disallows input VAT and expense deduction without verified supplier TIN.`;
          auditorRecommendation = 'Link payment to registered purchase invoice showing supplier TIN.';
        } else {
          taxClassification = 'allowable_business_deduction';
          totalDeductibleSupplierExpenses += tx.amount;
          status = 'compliant';
          auditorRecommendation = 'Verified allowable business purchase supported by bank payment reason.';
        }
      } else {
        // Other / Unclassified debit
        taxClassification = 'unexplained_audit_risk';
        totalUnexplainedDebits += tx.amount;
        status = 'high_risk_flag';
        discrepancyTitle = 'Unclassified Bank Outflow';
        discrepancyDetail = `Bank payment of ETB ${tx.amount.toLocaleString()} lacks verified category and specific business purpose: "${rawReason || 'No reason'}".`;
        legalBasis = 'Income Tax Proc. 979/2016 Art. 22 & 27';
        auditorRecommendation = 'Assign valid business category and attach supplier invoice to prevent auditor disallowance.';
      }
    }

    if (status === 'compliant') compliantCount += 1;
    else if (status === 'warning') warningCount += 1;
    else highRiskCount += 1;

    // Accumulate category breakdown
    const catBreakdownKey = `${tx.category}_${tx.type}`;
    if (!categoryMap[catBreakdownKey]) {
      categoryMap[catBreakdownKey] = {
        category: tx.category,
        label: categoryLabel,
        flowType: tx.type,
        count: 0,
        amount: 0,
        taxTreatment:
          tx.type === 'credit'
            ? taxClassification === 'taxable_operating_revenue'
              ? 'Taxable Sales Revenue'
              : 'Non-Taxable Capital / Transfer'
            : taxClassification === 'disallowed_personal_drawing'
            ? 'Disallowed Personal Drawing (Art. 27)'
            : taxClassification === 'statutory_tax_remittance'
            ? 'Official MoR Tax Remittance'
            : 'Allowable Business Expense',
        auditStatus: status,
      };
    }
    categoryMap[catBreakdownKey].count += 1;
    categoryMap[catBreakdownKey].amount += tx.amount;
    if (status === 'high_risk_flag') {
      categoryMap[catBreakdownKey].auditStatus = 'high_risk_flag';
    } else if (status === 'warning' && categoryMap[catBreakdownKey].auditStatus !== 'high_risk_flag') {
      categoryMap[catBreakdownKey].auditStatus = 'warning';
    }

    items.push({
      id: `audit-${tx.id}`,
      txId: tx.id,
      date: tx.date,
      bankAccountId: tx.bankAccountId,
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      categoryLabel,
      description: tx.description,
      reason: rawReason || tx.description || 'N/A',
      notes: tx.notes,
      taxClassification,
      status,
      reasonClarity,
      discrepancyTitle,
      discrepancyDetail,
      legalBasis,
      auditorRecommendation,
    });
  });

  const totalAuditedCount = bankTransactions.length;
  const totalCreditsCount = bankTransactions.filter((t) => t.type === 'credit').length;
  const totalDebitsCount = bankTransactions.filter((t) => t.type === 'debit').length;

  let auditReadinessScore = 100;
  auditReadinessScore -= highRiskCount * 15;
  auditReadinessScore -= warningCount * 5;
  if (auditReadinessScore < 20) auditReadinessScore = 20;
  if (auditReadinessScore > 100) auditReadinessScore = 100;

  return {
    totalAuditedCount,
    totalCreditsCount,
    totalDebitsCount,
    compliantCount,
    warningCount,
    highRiskCount,
    auditReadinessScore: Math.round(auditReadinessScore),
    totalSalesDeposits,
    totalCapitalAndLoansVerified,
    totalInternalTransfers,
    totalUnexplainedDeposits,
    totalDeductibleSupplierExpenses,
    totalDisallowedPersonalDrawings,
    totalDisallowedFinesPenalties,
    totalTaxRemittancesToMoR,
    totalDeductibleBankCharges,
    totalUnexplainedDebits,
    categoryBreakdown: Object.values(categoryMap),
    items,
  };
}
