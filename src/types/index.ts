export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'digital_wallet';

export type ExpenseCategory =
  | 'inventory_cogs'
  | 'rent_lease'
  | 'utilities'
  | 'packaging_supplies'
  | 'marketing_ads'
  | 'equipment_repairs'
  | 'logistics_transport'
  | 'professional_fees'
  | 'meals_entertainment'
  | 'other_operational';

export type TaxDeductibility = 'fully_deductible' | 'partially_deductible' | 'non_deductible';

export interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface SaleTransaction {
  id: string;
  receiptNumber: string;
  date: string; // ISO date string (YYYY-MM-DD)
  time: string; // HH:mm
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  taxRate: number; // e.g. 0.10 for 10%
  taxAmount: number;
  totalAmount: number;
  cashAmount?: number; // Cash portion of daily sales
  bankTransferAmount?: number; // Bank transfer portion of daily sales
  paymentMethod: PaymentMethod;
  bankAccountId?: string; // which bank account it deposited into (if card/bank_transfer)
  isReconciledWithBank: boolean;
  notes?: string;
  createdAt: number;
}

export interface PurchaseItem {
  id: string;
  invoiceNumber: string;
  date: string; // ISO date string
  vendorName: string;
  vendorTin?: string; // Supplier TIN (Tax Identification Number)
  itemName: string;
  category: ExpenseCategory;
  quantity: number;
  unitCost: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number; // Input VAT/Tax
  totalAmount: number;
  deductibility: TaxDeductibility;
  deductiblePercentage: number; // 100, 50, 0
  paymentMethod: PaymentMethod;
  bankAccountId?: string;
  isReconciledWithBank: boolean;
  receiptImage?: string; // base64 or placeholder preview
  notes?: string;
  createdAt: number;
}

export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountNumberMasked: string; // e.g. '•••• 4821'
  type: 'checking' | 'savings' | 'tax_reserve';
  currentBalance: number;
  currency: string;
  color: string;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  reason?: string; // Explicit bank transaction reason / payment purpose / narrative memo
  type: 'credit' | 'debit';
  amount: number;
  category:
    | 'sale_deposit'
    | 'sales_cash_deposit'
    | 'cash_withdraw'
    | 'card_settlement'
    | 'vendor_payout'
    | 'tax_payment'
    | 'bank_fee'
    | 'transfer'
    | 'personal_drawing'
    | 'loan_infusion'
    | 'other';
  referenceId?: string; // Sale ID or Purchase ID
  isReconciled: boolean;
  notes?: string;
}

export interface DailyRegisterClose {
  id: string;
  date: string;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  bankTransferSales: number;
  totalGrossSales: number;
  totalTaxCollected: number;
  cashPaidOutForPurchases: number;
  actualCashCounted: number;
  cashVariance: number; // actual - (opening + cashSales - cashPaidOut)
  bankDepositAmount: number;
  closedBy: string;
  status: 'balanced' | 'variance_flagged';
  notes?: string;
}

export interface TaxSettings {
  businessName: string;
  taxIdNumber: string; // e.g. TIN / EIN / VAT No
  currency: string;
  currencySymbol: string;
  defaultSalesTaxRate: number; // e.g. 0.10 for 10%
  corporateTaxRate: number; // e.g. 0.20 for 20%
  fiscalYearStartMonth: number; // 1 for January
  googleSheetId?: string;
  googleSheetUrl?: string;
  googleSheetName?: string;
  lastGoogleSheetSyncAt?: string;
  googleAppsScriptUrl?: string;
  googleSyncMethod?: 'appscript';
  autoSyncToGoogleSheets?: boolean; // When true, automatically syncs changes to Google Sheets in the background
}

export interface AuditDiagnosticItem {
  id: string;
  level: 'critical' | 'warning' | 'compliant';
  category: 'bank_unreconciled' | 'missing_receipt' | 'negative_cash' | 'tax_gap' | 'unexplained_variance';
  title: string;
  description: string;
  impact: string;
  targetTab: 'sales' | 'purchases' | 'bank' | 'audit';
}

export type ReconcilingItemType =
  | 'deposit_in_transit'      // Added to Bank Balance
  | 'outstanding_cheque'      // Deducted from Bank Balance
  | 'bank_error_adjustment'   // Added/Deducted on Bank side
  | 'unrecorded_bank_credit'  // Added to Book Balance (e.g. direct customer deposit / interest)
  | 'bank_service_charge'     // Deducted from Book Balance (e.g. CBE RTGS fee / ledger fee)
  | 'nsf_dishonored_cheque';  // Deducted from Book Balance

export interface ReconcilingItem {
  id: string;
  bankAccountId: string;
  date: string;
  type: ReconcilingItemType;
  referenceNumber: string; // e.g. CHQ-004812 or DEP-1050
  partyOrDescription: string;
  amount: number;
  isCleared: boolean;
  notes?: string;
}

export interface BankReconciliationStatement {
  id: string;
  statementNumber: string; // e.g. BRS-2026-09-CBE
  bankAccountId: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  balancePerBankStatement: number;
  unadjustedBookBalance: number;
  depositsInTransitTotal: number;
  outstandingChequesTotal: number;
  unrecordedCreditsTotal: number;
  bankChargesTotal: number;
  adjustedBankBalance: number;
  adjustedBookBalance: number;
  variance: number;
  status: 'reconciled' | 'discrepancy';
  preparedBy: string;
  certifiedAt: string;
  notes?: string;
}

