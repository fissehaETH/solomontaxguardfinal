import {
  SaleTransaction,
  PurchaseItem,
  BankTransaction,
  DailyRegisterClose,
} from '../types';
import { getSaleCashAmount, getSaleBankTransferAmount } from './formatters';

export interface DailyCashAuditRecord {
  date: string; // ISO format: YYYY-MM-DD
  dayOfWeek: string;

  // 1. Total Daily Sales
  grossDailySales: number; // Cash + Bank Transfer
  cashSales: number; // Physical cash received from daily sales
  bankTransferSales: number; // Direct bank transfers / mobile banking
  salesCount: number;
  outputVatCollected: number;

  // 2. Total Purchases with Cash (Not Transfer)
  cashPurchases: number; // Purchases paid strictly with Cash
  bankTransferPurchases: number; // Purchases paid via Bank Transfer / Cheque / Card
  cashPurchasesCount: number;
  bankTransferPurchasesCount: number;
  inputVatPaidOnCashPurchases: number;
  largeCashPurchasesCount: number; // Single cash purchases exceeding statutory threshold (> 50,000 ETB)

  // 3. Cash Money Needed to be Deposited into Bank
  dailyCashToDeposit: number; // cashSales - cashPurchases
  cumulativeCashToDeposit: number; // Running total of (cashSales - cashPurchases) up to that date
  priorCumulativeCashToDeposit: number; // Prior cumulative before this date

  // 4. Actual Bank Deposits on and up to that Date
  actualBankDeposits: number; // Operating bank deposits from sales/business on that date
  totalBankCredits: number; // Gross total of all bank credits on that date
  nonIncomeBankCredits: number; // Loans, equity, internal transfers on that date
  cumulativeBankDeposits: number; // Running total of operating bank deposits up to that date
  priorCumulativeBankDeposits: number; // Prior cumulative bank deposits before this date

  // 5. Undeposited Cash On Hand / Cash Variance
  undepositedCashOnHand: number; // cumulativeCashToDeposit - cumulativeBankDeposits
  dailyDepositGap: number; // dailyCashToDeposit - actualBankDeposits
  cashOnHandStatus: 'in_safe_pending_deposit' | 'reconciled_normal_float' | 'excess_bank_deposit';
  cashOnHandExplanation: string; // Clear plain-language explanation of this number

  // 6. Registered Cash Register Close (Z-Report) if filed
  dailyClose?: DailyRegisterClose;

  // 7. Audit Flags & Findings
  auditStatus: 'compliant' | 'undeposited_excess' | 'negative_daily_cash' | 'excess_bank_deposit' | 'cash_limit_warning';
  findings: string[];
  friendlyTip?: string;
}

export interface FriendlyTaxAdviceItem {
  id: string;
  category: 'cash_in_safe' | 'bank_surplus' | 'cash_limit' | 'missing_receipt' | 'general';
  icon: 'bank' | 'safe' | 'shield' | 'alert' | 'check' | 'receipt';
  urgency: 'high' | 'medium' | 'good_news';
  title: string;
  advice: string;
  whyItMatters: string;
  actionButton?: {
    label: string;
    targetTab?: 'sales' | 'purchases' | 'bank' | 'audit';
    actionType?: 'add_sale' | 'add_purchase' | 'record_close' | 'export_csv';
  };
}

export interface FriendlyTaxAdvice {
  headline: string;
  subheadline: string;
  summaryMessage: string;
  items: FriendlyTaxAdviceItem[];
}

export interface DailyCashAuditSummary {
  totalDaysExamined: number;
  earliestDate: string;
  latestDate: string;

  // Sales Totals
  grandGrossSales: number;
  grandCashSales: number;
  grandTransferSales: number;
  cashSalesPercentage: number;
  totalSalesCount: number;

  // Purchases Totals
  grandTotalPurchases: number;
  grandCashPurchases: number; // Strictly Cash (not transfer)
  grandTransferPurchases: number;
  cashPurchasesPercentage: number;
  totalCashPurchasesCount: number;
  totalTransferPurchasesCount: number;
  totalLargeCashPurchasesCount: number;

  // Cash Deposit Examination Totals
  netCashRequiredToBeDeposited: number; // grandCashSales - grandCashPurchases
  totalActualBankDeposits: number; // Operating bank deposits
  totalGrossBankCredits: number; // All bank credits
  totalNonIncomeBankCredits: number; // Loans, equity, inter-bank transfers
  netUndepositedCashBalance: number; // netCashRequiredToBeDeposited - totalActualBankDeposits
  depositComplianceRate: number; // (totalActualBankDeposits / netCashRequiredToBeDeposited) * 100

  // Risk & Audit Assessment
  daysWithDiscrepancy: number;
  highRiskCount: number;
  overallAuditVerdict: 'fully_reconciled' | 'undeposited_cash_flag' | 'unexplained_deposit_flag' | 'acceptable_variance';
  auditorGuidance: string;
  friendlyAdvice: FriendlyTaxAdvice;

  records: DailyCashAuditRecord[];
}

// Statutory Ethiopian Cash Limit per single invoice (Directives under Proc 979/2016, Proc 983/2016 & NBE Cash Directives)
// Only single cash purchases exceeding ETB 50,000 should be flagged
export const ETHIOPIAN_CASH_PURCHASE_LIMIT = 50000; // 50,000 ETB

/**
 * Calculates comprehensive daily sales, cash purchases, net cash to be deposited,
 * and cumulative bank deposit reconciliation for tax and audit examination.
 */
export function calculateDailyCashExamination(
  sales: SaleTransaction[],
  purchases: PurchaseItem[],
  bankTransactions: BankTransaction[],
  dailyCloses: DailyRegisterClose[] = []
): DailyCashAuditSummary {
  // 1. Gather all unique dates across sales, purchases, bank deposits, and daily closes
  const dateSet = new Set<string>();

  sales.forEach((s) => {
    if (s.date && s.date.trim()) dateSet.add(s.date.trim());
  });
  purchases.forEach((p) => {
    if (p.date && p.date.trim()) dateSet.add(p.date.trim());
  });
  bankTransactions.forEach((tx) => {
    if (tx.date && tx.date.trim()) dateSet.add(tx.date.trim());
  });
  dailyCloses.forEach((c) => {
    if (c.date && c.date.trim()) dateSet.add(c.date.trim());
  });

  const sortedDates = Array.from(dateSet).sort();

  // 2. Pre-index collections by date for O(N) performance
  const salesByDate: Record<string, SaleTransaction[]> = {};
  const purchasesByDate: Record<string, PurchaseItem[]> = {};
  const bankDepositsByDate: Record<string, BankTransaction[]> = {};
  const dailyClosesByDate: Record<string, DailyRegisterClose> = {};

  sales.forEach((s) => {
    const d = s.date?.trim();
    if (!d) return;
    if (!salesByDate[d]) salesByDate[d] = [];
    salesByDate[d].push(s);
  });

  purchases.forEach((p) => {
    const d = p.date?.trim();
    if (!d) return;
    if (!purchasesByDate[d]) purchasesByDate[d] = [];
    purchasesByDate[d].push(p);
  });

  bankTransactions
    .filter((tx) => tx.type === 'credit') // only deposits into bank
    .forEach((tx) => {
      const d = tx.date?.trim();
      if (!d) return;
      if (!bankDepositsByDate[d]) bankDepositsByDate[d] = [];
      bankDepositsByDate[d].push(tx);
    });

  dailyCloses.forEach((c) => {
    const d = c.date?.trim();
    if (!d) return;
    dailyClosesByDate[d] = c;
  });

  // 3. Compute running aggregates day-by-day
  let runningCashToDeposit = 0;
  let runningBankDeposits = 0;

  const records: DailyCashAuditRecord[] = [];

  sortedDates.forEach((date) => {
    const daySales = salesByDate[date] || [];
    const dayPurchases = purchasesByDate[date] || [];
    const dayBankCredits = bankDepositsByDate[date] || [];
    const dayClose = dailyClosesByDate[date];

    // --- Daily Sales ---
    let grossDailySales = 0;
    let cashSales = 0;
    let bankTransferSales = 0;
    let outputVatCollected = 0;

    daySales.forEach((s) => {
      const total = Number(s.totalAmount) || 0;
      grossDailySales += total;
      const transfer = getSaleBankTransferAmount(s);
      const cash = getSaleCashAmount(s);
      bankTransferSales += transfer;
      cashSales += cash;
      outputVatCollected += Number(s.taxAmount) || 0;
    });

    // --- Purchases: Cash vs Transfer ---
    let cashPurchases = 0;
    let bankTransferPurchases = 0;
    let cashPurchasesCount = 0;
    let bankTransferPurchasesCount = 0;
    let inputVatPaidOnCashPurchases = 0;
    let largeCashPurchasesCount = 0;

    dayPurchases.forEach((p) => {
      const total = Number(p.totalAmount) || 0;
      const isCash = p.paymentMethod === 'cash';

      if (isCash) {
        cashPurchases += total;
        cashPurchasesCount += 1;
        inputVatPaidOnCashPurchases += Number(p.taxAmount) || 0;
        if (total > ETHIOPIAN_CASH_PURCHASE_LIMIT) {
          largeCashPurchasesCount += 1;
        }
      } else {
        bankTransferPurchases += total;
        bankTransferPurchasesCount += 1;
      }
    });

    // --- Net Cash to be Deposited ---
    // Net cash collected from that day's operations that remains after cash business purchases
    const priorCumulativeCashToDeposit = runningCashToDeposit;
    const priorCumulativeBankDeposits = runningBankDeposits;

    const dailyCashToDeposit = cashSales - cashPurchases;
    runningCashToDeposit += dailyCashToDeposit;

    // --- Bank Deposits on this Date ---
    let actualBankDeposits = 0;
    let nonIncomeBankCredits = 0;
    let totalBankCredits = 0;

    dayBankCredits.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      totalBankCredits += amt;

      const cat = tx.category || 'other';
      const desc = (tx.description || '').toLowerCase();
      const reason = (tx.reason || '').toLowerCase();
      const memo = `${desc} ${reason}`;

      const isNonIncome =
        cat === 'loan_infusion' ||
        cat === 'transfer' ||
        memo.includes('loan') ||
        memo.includes('capital') ||
        memo.includes('shareholder') ||
        memo.includes('equity') ||
        memo.includes('transfer from') ||
        memo.includes('internal transfer') ||
        memo.includes('own account') ||
        memo.includes('contra');

      if (isNonIncome) {
        nonIncomeBankCredits += amt;
      } else {
        actualBankDeposits += amt;
      }
    });

    runningBankDeposits += actualBankDeposits;

    // --- Undeposited Cash On Hand Up to This Date ---
    const undepositedCashOnHand = runningCashToDeposit - runningBankDeposits;
    const dailyDepositGap = dailyCashToDeposit - actualBankDeposits;

    // --- Day of Week ---
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = isNaN(dateObj.getTime())
      ? ''
      : dateObj.toLocaleDateString('en-US', { weekday: 'short' });

    // --- Cash on Hand Status & Explanation ---
    let cashOnHandStatus: DailyCashAuditRecord['cashOnHandStatus'] = 'reconciled_normal_float';
    let cashOnHandExplanation = '';

    if (undepositedCashOnHand > 5000) {
      cashOnHandStatus = 'in_safe_pending_deposit';
      cashOnHandExplanation = `ETB ${undepositedCashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2 })} physical cash in store safe/drawer awaiting deposit into bank. Must match physical cash count in register safe during MoR tax audit.`;
    } else if (undepositedCashOnHand < -5000) {
      cashOnHandStatus = 'excess_bank_deposit';
      cashOnHandExplanation = `Bank deposits exceed recorded cash sales by ETB ${Math.abs(undepositedCashOnHand).toLocaleString(undefined, { minimumFractionDigits: 2 })}. This surplus occurs when customer bank transfers, owner personal funds, or prior cash floats were banked in excess of recorded sales.`;
    } else {
      cashOnHandStatus = 'reconciled_normal_float';
      cashOnHandExplanation = `Net cash collected closely matches bank deposits. Retained drawer float (ETB ${undepositedCashOnHand.toFixed(2)}) is within normal retail working limits.`;
    }

    // --- Forensic Audit Flags & Findings ---
    const findings: string[] = [];
    let auditStatus: DailyCashAuditRecord['auditStatus'] = 'compliant';

    if (largeCashPurchasesCount > 0) {
      findings.push(
        `${largeCashPurchasesCount} single cash purchase(s) exceeded ETB ${ETHIOPIAN_CASH_PURCHASE_LIMIT.toLocaleString()} statutory threshold (NBE & MoR Directives: single cash purchases > ETB 50,000 are flagged and must be settled via banking/electronic transfer).`
      );
      auditStatus = 'cash_limit_warning';
    }

    if (dailyCashToDeposit < 0) {
      findings.push(
        `Negative cash day: Cash purchases (ETB ${cashPurchases.toFixed(2)}) exceeded cash sales (ETB ${cashSales.toFixed(2)}). Funded from prior drawer float or owner cash.`
      );
      if (auditStatus === 'compliant') auditStatus = 'negative_daily_cash';
    }

    if (undepositedCashOnHand > 50000) {
      findings.push(
        `Substantial undeposited cash in safe: ETB ${undepositedCashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2 })} has not been deposited in bank. Tax auditors require physical cash count verification.`
      );
      if (auditStatus === 'compliant' || auditStatus === 'negative_daily_cash') {
        auditStatus = 'undeposited_excess';
      }
    } else if (undepositedCashOnHand < -10000) {
      findings.push(
        `Bank deposit surplus: Deposits exceed accumulated net cash by ETB ${Math.abs(undepositedCashOnHand).toLocaleString(undefined, { minimumFractionDigits: 2 })}. Auditors will examine for undeclared revenue, customer transfers, or owner loans.`
      );
      if (auditStatus === 'compliant' || auditStatus === 'negative_daily_cash') {
        auditStatus = 'excess_bank_deposit';
      }
    }

    if (dayClose && dayClose.status === 'variance_flagged') {
      findings.push(
        `Cash Register Z-Report flagged variance of ETB ${dayClose.cashVariance.toFixed(2)} between counted cash and recorded transactions.`
      );
    }

    let friendlyTip = '';
    if (undepositedCashOnHand > 20000) {
      friendlyTip = `Friend tip: You have ETB ${undepositedCashOnHand.toLocaleString()} in your safe today. Deposit it at your bank tomorrow so you don't accumulate large cash in the till.`;
    } else if (largeCashPurchasesCount > 0) {
      friendlyTip = `Friend tip: Cash purchase over 50k ETB today. Next time, pay by bank transfer or cheque to protect your VAT refund.`;
    } else if (dailyCashToDeposit < 0) {
      friendlyTip = `Friend tip: Cash spent exceeded cash received today. Keep your petty cash receipt slips filed together.`;
    } else if (undepositedCashOnHand < -5000) {
      friendlyTip = `Friend tip: Bank deposits exceeded sales cash today. Check that transfer/loan notes are written on bank slips.`;
    } else {
      friendlyTip = `Friend tip: Cash drawer and bank deposits are nicely balanced today!`;
    }

    records.push({
      date,
      dayOfWeek,
      grossDailySales: Number(grossDailySales.toFixed(2)),
      cashSales: Number(cashSales.toFixed(2)),
      bankTransferSales: Number(bankTransferSales.toFixed(2)),
      salesCount: daySales.length,
      outputVatCollected: Number(outputVatCollected.toFixed(2)),

      cashPurchases: Number(cashPurchases.toFixed(2)),
      bankTransferPurchases: Number(bankTransferPurchases.toFixed(2)),
      cashPurchasesCount,
      bankTransferPurchasesCount,
      inputVatPaidOnCashPurchases: Number(inputVatPaidOnCashPurchases.toFixed(2)),
      largeCashPurchasesCount,

      dailyCashToDeposit: Number(dailyCashToDeposit.toFixed(2)),
      cumulativeCashToDeposit: Number(runningCashToDeposit.toFixed(2)),
      priorCumulativeCashToDeposit: Number(priorCumulativeCashToDeposit.toFixed(2)),

      actualBankDeposits: Number(actualBankDeposits.toFixed(2)),
      totalBankCredits: Number(totalBankCredits.toFixed(2)),
      nonIncomeBankCredits: Number(nonIncomeBankCredits.toFixed(2)),
      cumulativeBankDeposits: Number(runningBankDeposits.toFixed(2)),
      priorCumulativeBankDeposits: Number(priorCumulativeBankDeposits.toFixed(2)),

      undepositedCashOnHand: Number(undepositedCashOnHand.toFixed(2)),
      dailyDepositGap: Number(dailyDepositGap.toFixed(2)),
      cashOnHandStatus,
      cashOnHandExplanation,
      friendlyTip,

      dailyClose: dayClose,
      auditStatus,
      findings,
    });
  });

  // 4. Summarize Overall Period
  const grandGrossSales = records.reduce((s, r) => s + r.grossDailySales, 0);
  const grandCashSales = records.reduce((s, r) => s + r.cashSales, 0);
  const grandTransferSales = records.reduce((s, r) => s + r.bankTransferSales, 0);
  const totalSalesCount = records.reduce((s, r) => s + r.salesCount, 0);

  const grandCashPurchases = records.reduce((s, r) => s + r.cashPurchases, 0);
  const grandTransferPurchases = records.reduce((s, r) => s + r.bankTransferPurchases, 0);
  const grandTotalPurchases = grandCashPurchases + grandTransferPurchases;
  const totalCashPurchasesCount = records.reduce((s, r) => s + r.cashPurchasesCount, 0);
  const totalTransferPurchasesCount = records.reduce((s, r) => s + r.bankTransferPurchasesCount, 0);
  const totalLargeCashPurchasesCount = records.reduce((s, r) => s + r.largeCashPurchasesCount, 0);

  const netCashRequiredToBeDeposited = grandCashSales - grandCashPurchases;
  const totalActualBankDeposits = records.reduce((s, r) => s + r.actualBankDeposits, 0);
  const totalGrossBankCredits = records.reduce((s, r) => s + r.totalBankCredits, 0);
  const totalNonIncomeBankCredits = records.reduce((s, r) => s + r.nonIncomeBankCredits, 0);
  const netUndepositedCashBalance = netCashRequiredToBeDeposited - totalActualBankDeposits;

  const cashSalesPercentage =
    grandGrossSales > 0 ? (grandCashSales / grandGrossSales) * 100 : 0;
  const cashPurchasesPercentage =
    grandTotalPurchases > 0 ? (grandCashPurchases / grandTotalPurchases) * 100 : 0;
  const depositComplianceRate =
    netCashRequiredToBeDeposited > 0
      ? (totalActualBankDeposits / netCashRequiredToBeDeposited) * 100
      : 100;

  const daysWithDiscrepancy = records.filter(
    (r) => r.auditStatus !== 'compliant'
  ).length;
  const highRiskCount = records.filter(
    (r) => r.auditStatus === 'undeposited_excess' || r.auditStatus === 'excess_bank_deposit'
  ).length;

  let overallAuditVerdict: DailyCashAuditSummary['overallAuditVerdict'] = 'fully_reconciled';
  let auditorGuidance = '';

  if (Math.abs(netUndepositedCashBalance) < 5000) {
    overallAuditVerdict = 'fully_reconciled';
    auditorGuidance =
      'High MoR Audit Compliance: Net cash generated from daily sales (after cash purchases) closely matches bank deposits. Undeposited cash on hand is within normal operational retail vault float.';
  } else if (netUndepositedCashBalance > 5000) {
    overallAuditVerdict = 'undeposited_cash_flag';
    auditorGuidance = `Audit Scrutiny Alert: Net cash to be deposited exceeds bank deposits by ETB ${netUndepositedCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Under Chapter 6 of the MoR Tax Audit Manual, examiners will verify physical cash on hand or investigate whether cash was diverted to private use without taxation.`;
  } else {
    overallAuditVerdict = 'unexplained_deposit_flag';
    auditorGuidance = `Indirect Audit Warning: Total bank deposits exceed net cash from sales (after cash purchases) by ETB ${Math.abs(netUndepositedCashBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}. MoR examiners will treat excess bank deposits as potential undeclared sales unless documented as owner capital, loan, or debtor collection.`;
  }

  // 5. Generate Friendly, Practical Advice ("Advice as a Friend")
  const friendlyAdvice = generateFriendlyAdvice({
    grandGrossSales,
    grandCashSales,
    grandTransferSales,
    grandTotalPurchases,
    grandCashPurchases,
    netCashRequiredToBeDeposited,
    totalActualBankDeposits,
    totalGrossBankCredits,
    totalNonIncomeBankCredits,
    netUndepositedCashBalance,
    totalLargeCashPurchasesCount,
    daysWithDiscrepancy,
    overallAuditVerdict,
  });

  return {
    totalDaysExamined: records.length,
    earliestDate: records[0]?.date || '',
    latestDate: records[records.length - 1]?.date || '',

    grandGrossSales: Number(grandGrossSales.toFixed(2)),
    grandCashSales: Number(grandCashSales.toFixed(2)),
    grandTransferSales: Number(grandTransferSales.toFixed(2)),
    cashSalesPercentage: Number(cashSalesPercentage.toFixed(1)),
    totalSalesCount,

    grandTotalPurchases: Number(grandTotalPurchases.toFixed(2)),
    grandCashPurchases: Number(grandCashPurchases.toFixed(2)),
    grandTransferPurchases: Number(grandTransferPurchases.toFixed(2)),
    cashPurchasesPercentage: Number(cashPurchasesPercentage.toFixed(1)),
    totalCashPurchasesCount,
    totalTransferPurchasesCount,
    totalLargeCashPurchasesCount,

    netCashRequiredToBeDeposited: Number(netCashRequiredToBeDeposited.toFixed(2)),
    totalActualBankDeposits: Number(totalActualBankDeposits.toFixed(2)),
    totalGrossBankCredits: Number(totalGrossBankCredits.toFixed(2)),
    totalNonIncomeBankCredits: Number(totalNonIncomeBankCredits.toFixed(2)),
    netUndepositedCashBalance: Number(netUndepositedCashBalance.toFixed(2)),
    depositComplianceRate: Number(depositComplianceRate.toFixed(1)),

    daysWithDiscrepancy,
    highRiskCount,
    overallAuditVerdict,
    auditorGuidance,
    friendlyAdvice,

    records,
  };
}

/**
 * Generates practical, friendly advice for the business owner
 */
export function generateFriendlyAdvice(summary: {
  grandGrossSales: number;
  grandCashSales: number;
  grandTransferSales: number;
  grandTotalPurchases: number;
  grandCashPurchases: number;
  netCashRequiredToBeDeposited: number;
  totalActualBankDeposits: number;
  totalGrossBankCredits: number;
  totalNonIncomeBankCredits: number;
  netUndepositedCashBalance: number;
  totalLargeCashPurchasesCount: number;
  daysWithDiscrepancy: number;
  overallAuditVerdict: string;
}): FriendlyTaxAdvice {
  const items: FriendlyTaxAdviceItem[] = [];

  // Advice 1: Cash in Safe / Undeposited Cash
  if (summary.netUndepositedCashBalance > 15000) {
    items.push({
      id: 'deposit-safe-cash',
      category: 'cash_in_safe',
      icon: 'safe',
      urgency: 'high',
      title: 'Deposit your safe cash into CBE or Awash this week',
      advice: `My friend, you currently have roughly ETB ${summary.netUndepositedCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} sitting in your shop safe or cash drawer that hasn't reached the bank. In Ethiopia, tax auditors can conduct a surprise visit and physically count your safe. If that cash isn't physically there, they will assume you pocketed it as tax-free personal drawings and assess 30% profit tax plus 20% penalties! Walk into your bank branch, deposit it under 'Store Cash Sales', and clip the deposit slip to your daily register summary.`,
      whyItMatters: 'MoR Chapter 6 Indirect Audit assumes unbanked cash is hidden personal income.',
      actionButton: {
        label: 'View Bank Accounts',
        targetTab: 'bank',
      },
    });
  } else if (summary.netUndepositedCashBalance < -10000) {
    items.push({
      id: 'explain-bank-surplus',
      category: 'bank_surplus',
      icon: 'bank',
      urgency: 'medium',
      title: 'Label your extra bank deposits so MoR does not tax them as sales',
      advice: `Your bank statement shows ETB ${Math.abs(summary.netUndepositedCashBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} more deposits than recorded cash sales. Don't worry, this happens all the time! Just make sure every deposit is properly labeled. If it was an owner loan, your personal savings, or a customer mobile transfer (Telebirr/CBE Birr), make sure the note says so. If left unexplained, the tax office will treat it as unrecorded new sales and assess 15% VAT + 30% profit tax on it!`,
      whyItMatters: 'Proclamation 979 Art. 17 treats all unexplained bank credits as taxable turnover.',
      actionButton: {
        label: 'Check Bank Transactions',
        targetTab: 'bank',
      },
    });
  } else {
    items.push({
      id: 'reconciled-praise',
      category: 'cash_in_safe',
      icon: 'check',
      urgency: 'good_news',
      title: 'Your cash drawer and bank deposits are beautifully balanced!',
      advice: `You're doing great, my friend! What you collected in cash from sales minus your cash expenses matches what went into the bank almost to the birr. This is the #1 thing tax inspectors scrutinize in Ethiopian retail businesses, and your books look clean and honest.`,
      whyItMatters: 'You pass the MoR Chapter 6 Bank Triangulation test with zero issues.',
    });
  }

  // Advice 2: Cash Purchases > 50,000 ETB
  if (summary.totalLargeCashPurchasesCount > 0) {
    items.push({
      id: 'cash-over-50k',
      category: 'cash_limit',
      icon: 'alert',
      urgency: 'high',
      title: 'Stop paying suppliers in cash for orders over ETB 50,000',
      advice: `You have ${summary.totalLargeCashPurchasesCount} cash purchase(s) exceeding ETB 50,000. Under Ethiopian commercial directives and MoR rules, single payments over 50,000 ETB in cash are flagged, and you risk losing your 15% input VAT deduction! For your next inventory orders, always write a bank cheque or transfer from CBE/Awash with the supplier's TIN written on the transfer memo.`,
      whyItMatters: 'Protects 100% of your VAT deductions and business expense write-offs under Proc. 979 Art. 22.',
      actionButton: {
        label: 'Review Purchases',
        targetTab: 'purchases',
      },
    });
  }

  // Advice 3: Daily 5-minute register close
  items.push({
    id: 'daily-register-close',
    category: 'general',
    icon: 'receipt',
    urgency: summary.daysWithDiscrepancy > 0 ? 'medium' : 'good_news',
    title: 'Spend 5 minutes every evening closing your register (Z-Report)',
    advice: `Before you pull down the shutters each evening, print your cash register Z-report, count the cash in the drawer, and log today's close in the app. When Ministry of Revenues auditors walk in, seeing clean daily Z-reports immediately tells them you run a disciplined, honest shop.`,
    whyItMatters: 'Council of Ministers Regulation No. 410/2017 requires daily register closing.',
    actionButton: {
      label: 'Record Day Close',
      actionType: 'record_close',
    },
  });

  // Advice 4: Park VAT in Tax Reserve
  items.push({
    id: 'tax-reserve-pot',
    category: 'general',
    icon: 'shield',
    urgency: 'medium',
    title: 'Never treat collected VAT as your money &ndash; stash it in a Tax Reserve',
    advice: `A golden rule from one business owner to another: the 15% VAT you collect from customers doesn't belong to you; you're just holding it for the Ministry of Revenues. Create a separate 'Tax Reserve' savings account and transfer your net VAT there every Friday. When the 30th of the month comes, you'll pay your tax with zero stress!`,
    whyItMatters: 'Avoids late payment penalties and interest under Proclamation 983 Art. 104 & 106.',
    actionButton: {
      label: 'Check Tax Reserve',
      targetTab: 'bank',
    },
  });

  let headline = 'What You Should Do Right Now (Advice as a Friend)';
  let subheadline = 'Practical, stress-free steps from an experienced accountant to keep your shop safe from penalties.';
  let summaryMessage = '';

  if (summary.netUndepositedCashBalance > 15000) {
    summaryMessage = 'Priority #1: Bank the cash sitting in your safe so you do not carry unnecessary tax risk.';
  } else if (summary.totalLargeCashPurchasesCount > 0) {
    summaryMessage = 'Priority #1: Switch suppliers from cash to bank transfers for purchases over 50k ETB.';
  } else {
    summaryMessage = 'Your books look healthy! Follow these small daily habits to stay 100% audit-proof.';
  }

  return {
    headline,
    subheadline,
    summaryMessage,
    items,
  };
}

/**
 * Generates official CSV export format for the Daily Cash & Bank Deposit Examination Schedule
 */
export function exportDailyCashAuditCSV(
  summary: DailyCashAuditSummary,
  businessName: string,
  tin: string,
  currencySymbol = 'ETB '
): string {
  let csv = `TAX & AUDIT EXAMINATION DOSSIER - DAILY SALES, CASH PURCHASES & BANK DEPOSIT AUDIT\n`;
  csv += `Business Name:,"${businessName}"\n`;
  csv += `Tax Identification Number (TIN):,${tin}\n`;
  csv += `Audit Framework:,Ethiopian Ministry of Revenues (MoR) / ERCA Tax Audit Manual Chapter 6\n`;
  csv += `Period Examined:,${summary.earliestDate} to ${summary.latestDate} (${summary.totalDaysExamined} days)\n`;
  csv += `Generated Date:,${new Date().toISOString()}\n\n`;

  csv += `--- EXECUTIVE AUDIT SUMMARY ---\n`;
  csv += `Grand Gross Sales (${currencySymbol}):,${summary.grandGrossSales.toFixed(2)}\n`;
  csv += `Cash Sales (${currencySymbol}):,${summary.grandCashSales.toFixed(2)} (${summary.cashSalesPercentage}% of total)\n`;
  csv += `Bank Transfer Sales (${currencySymbol}):,${summary.grandTransferSales.toFixed(2)}\n`;
  csv += `Total Purchases Paid in Cash (Not Transfer) (${currencySymbol}):,${summary.grandCashPurchases.toFixed(2)} (${summary.cashPurchasesPercentage}% of total purchases)\n`;
  csv += `Total Purchases Paid via Bank Transfer (${currencySymbol}):,${summary.grandTransferPurchases.toFixed(2)}\n`;
  csv += `Net Cash Required to be Deposited into Bank (${currencySymbol}):,${summary.netCashRequiredToBeDeposited.toFixed(2)}\n`;
  csv += `Total Actual Bank Deposits Recorded (${currencySymbol}):,${summary.totalActualBankDeposits.toFixed(2)}\n`;
  csv += `Net Undeposited Cash on Hand (${currencySymbol}):,${summary.netUndepositedCashBalance.toFixed(2)}\n`;
  csv += `Audit Verdict:,"${summary.overallAuditVerdict}"\n`;
  csv += `Auditor Guidance:,"${summary.auditorGuidance.replace(/"/g, '""')}"\n\n`;

  csv += `--- DAY-BY-DAY AUDIT EXAMINATION SCHEDULE ---\n`;
  csv += `Date,Day,Total Daily Sales,Cash Sales,Bank Transfer Sales,Cash Purchases (Not Transfer),Bank Transfer Purchases,Net Cash to Deposit (Daily),Cumulative Cash Need to Deposit,Actual Bank Deposit (Daily),Cumulative Bank Deposits,Undeposited Cash On Hand (Cumulative),Audit Status,Findings\n`;

  summary.records.forEach((r) => {
    const findingsStr = r.findings.join(' | ').replace(/"/g, '""');
    csv += `${r.date},${r.dayOfWeek},${r.grossDailySales.toFixed(2)},${r.cashSales.toFixed(2)},${r.bankTransferSales.toFixed(2)},${r.cashPurchases.toFixed(2)},${r.bankTransferPurchases.toFixed(2)},${r.dailyCashToDeposit.toFixed(2)},${r.cumulativeCashToDeposit.toFixed(2)},${r.actualBankDeposits.toFixed(2)},${r.cumulativeBankDeposits.toFixed(2)},${r.undepositedCashOnHand.toFixed(2)},"${r.auditStatus}","${findingsStr}"\n`;
  });

  return csv;
}
