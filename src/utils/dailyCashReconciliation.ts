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

  // 4. Actual Bank Deposits on and up to that Date
  actualBankDeposits: number; // Sum of bank credit deposits on that date
  cumulativeBankDeposits: number; // Running total of actual bank deposits up to that date

  // 5. Undeposited Cash On Hand / Cash Variance
  undepositedCashOnHand: number; // cumulativeCashToDeposit - cumulativeBankDeposits
  dailyDepositGap: number; // dailyCashToDeposit - actualBankDeposits

  // 6. Registered Cash Register Close (Z-Report) if filed
  dailyClose?: DailyRegisterClose;

  // 7. Audit Flags & Findings
  auditStatus: 'compliant' | 'undeposited_excess' | 'negative_daily_cash' | 'excess_bank_deposit' | 'cash_limit_warning';
  findings: string[];
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
  totalActualBankDeposits: number;
  netUndepositedCashBalance: number; // netCashRequiredToBeDeposited - totalActualBankDeposits
  depositComplianceRate: number; // (totalActualBankDeposits / netCashRequiredToBeDeposited) * 100

  // Risk & Audit Assessment
  daysWithDiscrepancy: number;
  highRiskCount: number;
  overallAuditVerdict: 'fully_reconciled' | 'undeposited_cash_flag' | 'unexplained_deposit_flag' | 'acceptable_variance';
  auditorGuidance: string;

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
    const dailyCashToDeposit = cashSales - cashPurchases;
    runningCashToDeposit += dailyCashToDeposit;

    // --- Actual Bank Deposits on this Date ---
    let actualBankDeposits = 0;
    dayBankCredits.forEach((tx) => {
      actualBankDeposits += Number(tx.amount) || 0;
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
        `Substantial undeposited cash on hand: ETB ${undepositedCashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2 })} has not been deposited in bank. Tax auditors require physical cash count verification.`
      );
      if (auditStatus === 'compliant' || auditStatus === 'negative_daily_cash') {
        auditStatus = 'undeposited_excess';
      }
    } else if (undepositedCashOnHand < -10000) {
      findings.push(
        `Bank deposits exceed accumulated net cash by ETB ${Math.abs(undepositedCashOnHand).toLocaleString(undefined, { minimumFractionDigits: 2 })}. Auditors will examine for undeclared revenue or owner loans.`
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

      actualBankDeposits: Number(actualBankDeposits.toFixed(2)),
      cumulativeBankDeposits: Number(runningBankDeposits.toFixed(2)),

      undepositedCashOnHand: Number(undepositedCashOnHand.toFixed(2)),
      dailyDepositGap: Number(dailyDepositGap.toFixed(2)),

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
    netUndepositedCashBalance: Number(netUndepositedCashBalance.toFixed(2)),
    depositComplianceRate: Number(depositComplianceRate.toFixed(1)),

    daysWithDiscrepancy,
    highRiskCount,
    overallAuditVerdict,
    auditorGuidance,

    records,
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
