import {
  AuditDiagnosticItem,
  BankAccount,
  BankTransaction,
  ExpenseCategory,
  PaymentMethod,
  PurchaseItem,
  SaleTransaction,
  TaxSettings,
} from '../types';

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  businessName: 'Solomon Building Materials Shop',
  taxIdNumber: '0002769494',
  currency: 'ETB',
  currencySymbol: 'ETB ',
  defaultSalesTaxRate: 0.15, // 15% Ethiopian standard VAT rate
  corporateTaxRate: 0.30, // 30% Ethiopian business profit tax rate
  fiscalYearStartMonth: 7, // Ethiopian Fiscal Year / Hamle
  autoSyncToGoogleSheets: true,
};

export const CURRENCY_OPTIONS = [
  { code: 'ETB', symbol: 'ETB ', name: 'Ethiopian Birr (ETB / Br)' },
  { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€', name: 'Euro (€)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (£)' },
  { code: 'KES', symbol: 'KSh ', name: 'Kenyan Shilling (KSh)' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira (₦)' },
  { code: 'ZAR', symbol: 'R ', name: 'South African Rand (R)' },
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham (AED)' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)' },
];

export function formatCurrency(amount: number, symbol = 'ETB '): string {
  const isNegative = amount < 0;
  const absVal = Math.abs(amount);
  const formatted = absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeDate(dateString: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  if (dateString === today) return 'Today';
  if (dateString === yesterday) return 'Yesterday';
  return formatDate(dateString);
}

export const CATEGORY_LABELS: Record<ExpenseCategory, { label: string; deductibleNote: string; color: string }> = {
  inventory_cogs: {
    label: 'Inventory / COGS',
    deductibleNote: '100% Tax Deductible (Cost of Goods)',
    color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  rent_lease: {
    label: 'Rent & Premises',
    deductibleNote: '100% Tax Deductible (Business facility)',
    color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  utilities: {
    label: 'Electricity, Water, Internet',
    deductibleNote: '100% Tax Deductible (Commercial utility)',
    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  },
  packaging_supplies: {
    label: 'Packaging & Consumables',
    deductibleNote: '100% Tax Deductible (Direct packaging)',
    color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  marketing_ads: {
    label: 'Advertising & Marketing',
    deductibleNote: '100% Tax Deductible (Customer acquisition)',
    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  equipment_repairs: {
    label: 'Equipment & Repairs',
    deductibleNote: '100% Tax Deductible (Asset maintenance)',
    color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  logistics_transport: {
    label: 'Freight & Delivery',
    deductibleNote: '100% Tax Deductible (Inbound/Outbound)',
    color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  },
  professional_fees: {
    label: 'Accounting & Legal',
    deductibleNote: '100% Tax Deductible (Professional services)',
    color: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  },
  meals_entertainment: {
    label: 'Client Meals & Entertainment',
    deductibleNote: '50% Deductible limit by statutory rule',
    color: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  other_operational: {
    label: 'Miscellaneous Operational',
    deductibleNote: 'Auditor verification required',
    color: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { label: string; badge: string }> = {
  cash: { label: 'Cash', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  card: { label: 'Cash', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  bank_transfer: { label: 'Bank Transfer', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  digital_wallet: { label: 'Cash', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

export function formatBankCategory(cat?: BankTransaction['category'] | string): string {
  switch (cat) {
    case 'sale_deposit':
      return 'Sales Transfer Deposit';
    case 'sales_cash_deposit':
      return 'Sales Cash Deposit';
    case 'cash_withdraw':
      return 'Cash Withdraw';
    case 'vendor_payout':
      return 'Supplier Payout';
    case 'tax_payment':
      return 'Tax Payment';
    case 'bank_fee':
      return 'Bank Fee / Charge';
    case 'card_settlement':
      return 'Card / POS Settlement';
    case 'transfer':
      return 'Account Transfer';
    case 'personal_drawing':
      return 'Personal Drawing (Non-Deductible)';
    case 'loan_infusion':
      return 'Capital / Loan Infusion (Non-Taxable)';
    default:
      return (cat || 'other').replace(/_/g, ' ');
  }
}

/**
 * Returns the Bank Transfer portion of a sale.
 * Only explicit bank transfer amounts (or legacy records with paymentMethod === 'bank_transfer') count as bank transfer.
 */
export function getSaleBankTransferAmount(sale: SaleTransaction): number {
  const total = Math.max(0, Number(sale.totalAmount) || 0);
  if (typeof sale.bankTransferAmount === 'number') {
    return Math.min(Math.max(0, Number(sale.bankTransferAmount)), total);
  }
  if (sale.paymentMethod === 'bank_transfer') {
    return total;
  }
  return 0;
}

/**
 * Every sale other than bank transfer is Cash.
 */
export function getSaleCashAmount(sale: SaleTransaction): number {
  const total = Math.max(0, Number(sale.totalAmount) || 0);
  const transfer = getSaleBankTransferAmount(sale);
  return Math.max(0, total - transfer);
}

/**
 * Audit Readiness Score & Diagnostic Calculator
 * Evaluates the 5 biggest triggers for tax audit fines & penalties:
 * 1. Unreconciled bank transactions (unexplained bank deposits look like unrecorded cash sales)
 * 2. Expenses without receipt verification / invoice # (disallowed deductions)
 * 3. Sales tax collected vs tax recorded
 * 4. Negative cash or balance drift
 * 5. Three-way gap between sales, purchases, and bank accounts
 */
export function calculateAuditReadiness(
  sales: SaleTransaction[],
  purchases: PurchaseItem[],
  bankAccounts: BankAccount[],
  bankTransactions: BankTransaction[]
): {
  score: number;
  grade: 'Audit-Proof (A+)' | 'Healthy (A)' | 'Attention Needed (B)' | 'High Audit Risk (C)';
  issues: AuditDiagnosticItem[];
  reconciledSalesRate: number;
  receiptAttachmentRate: number;
  bankReconciliationRate: number;
} {
  const issues: AuditDiagnosticItem[] = [];

  // 1. Bank Reconciliation Rate
  const totalBankTx = bankTransactions.length;
  const reconciledBankTx = bankTransactions.filter((tx) => tx.isReconciled).length;
  const bankReconciliationRate = totalBankTx > 0 ? (reconciledBankTx / totalBankTx) * 100 : 100;

  if (totalBankTx > 0 && bankReconciliationRate < 85) {
    const unreconciledCount = totalBankTx - reconciledBankTx;
    issues.push({
      id: 'unreconciled-bank-tx',
      level: 'critical',
      category: 'bank_unreconciled',
      title: `${unreconciledCount} Unreconciled Bank Transactions`,
      description: 'Tax auditors match bank deposits directly against reported sales. Unmatched deposits are presumed to be hidden taxable income.',
      impact: 'Risk of undeclared revenue penalties + 25% tax surcharge',
      targetTab: 'bank',
    });
  }

  // 2. Receipts attached to Purchases
  const totalPurchases = purchases.length;
  const purchasesWithProof = purchases.filter((p) => p.invoiceNumber && p.invoiceNumber.trim() !== '').length;
  const purchasesWithImage = purchases.filter((p) => !!p.receiptImage).length;
  const receiptAttachmentRate = totalPurchases > 0 ? (purchasesWithProof / totalPurchases) * 100 : 100;

  const missingInvoices = purchases.filter((p) => !p.invoiceNumber || p.invoiceNumber.trim() === '');
  if (missingInvoices.length > 0) {
    issues.push({
      id: 'missing-invoices',
      level: 'critical',
      category: 'missing_receipt',
      title: `${missingInvoices.length} Purchases Missing Official Invoice Number`,
      description: 'Tax authorities disallow tax deductions for expenses lacking a verified supplier tax invoice or official receipt number.',
      impact: 'Deductions will be disallowed during tax audit',
      targetTab: 'purchases',
    });
  }

  // 3. Sales without receipt number
  const missingSaleReceipts = sales.filter((s) => !s.receiptNumber || s.receiptNumber.trim() === '');
  if (missingSaleReceipts.length > 0) {
    issues.push({
      id: 'missing-sale-receipts',
      level: 'warning',
      category: 'tax_gap',
      title: `${missingSaleReceipts.length} Sales Missing Receipt/Ticket Number`,
      description: 'Sequentially numbered sales receipts are required by statutory audit regulations to prove chronological integrity.',
      impact: 'Audit infraction for broken invoice sequence',
      targetTab: 'sales',
    });
  }

  // 4. Check negative bank balances or negative cash
  const negativeAccounts = bankAccounts.filter((acc) => acc.currentBalance < 0);
  if (negativeAccounts.length > 0) {
    issues.push({
      id: 'negative-bank-balance',
      level: 'warning',
      category: 'negative_cash',
      title: `${negativeAccounts.length} Account(s) in Overdraft / Negative Balance`,
      description: 'Unexplained overdrafts trigger tax scrutiny regarding unrecorded infusions of shareholder loans or capital.',
      impact: 'Requires explanation of loan vs revenue source',
      targetTab: 'bank',
    });
  }

  // 5. Sales Reconciliation with Bank
  const cardOrTransferSales = sales.filter((s) => getSaleBankTransferAmount(s) > 0);
  const reconciledSales = cardOrTransferSales.filter((s) => s.isReconciledWithBank);
  const reconciledSalesRate = cardOrTransferSales.length > 0 ? (reconciledSales.length / cardOrTransferSales.length) * 100 : 100;

  if (cardOrTransferSales.length > 0 && reconciledSalesRate < 80) {
    issues.push({
      id: 'unmatched-sales-deposits',
      level: 'warning',
      category: 'unexplained_variance',
      title: `${cardOrTransferSales.length - reconciledSales.length} Bank Transfer Sales Unlinked to Bank Deposits`,
      description: 'Bank transfer sales should tie cleanly to credit entries on your official bank statements.',
      impact: 'Cash-to-bank ledger variance',
      targetTab: 'sales',
    });
  }

  // Calculate score (100 base)
  let score = 100;
  issues.forEach((issue) => {
    if (issue.level === 'critical') score -= 18;
    else if (issue.level === 'warning') score -= 9;
  });

  if (score < 30) score = 30;
  if (score > 100) score = 100;

  let grade: 'Audit-Proof (A+)' | 'Healthy (A)' | 'Attention Needed (B)' | 'High Audit Risk (C)' = 'Audit-Proof (A+)';
  if (score >= 95) grade = 'Audit-Proof (A+)';
  else if (score >= 85) grade = 'Healthy (A)';
  else if (score >= 70) grade = 'Attention Needed (B)';
  else grade = 'High Audit Risk (C)';

  return {
    score: Math.round(score),
    grade,
    issues,
    reconciledSalesRate: Math.round(reconciledSalesRate),
    receiptAttachmentRate: Math.round(receiptAttachmentRate),
    bankReconciliationRate: Math.round(bankReconciliationRate),
  };
}
