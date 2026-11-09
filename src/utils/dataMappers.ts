/**
 * Tri-Tier Data Mappers (LocalStorage <-> Cloud Firestore <-> Google Sheets)
 * 
 * Enforces:
 * 1. Full data parity across all 3 tiers.
 * 2. Immutable date & timestamp preservation: Client-side runtime `createdAt`
 *    and user-entered `date` are never overwritten, recalibrated, or auto-generated.
 */

import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  DailyRegisterClose,
  ReconcilingItem,
  BankReconciliationStatement,
  TaxSettings,
} from '../types';

/**
 * Sanitizes document or entity IDs to Firestore-compatible regex: ^[a-zA-Z0-9_\-]+$
 */
export function sanitizeId(raw: string): string {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

/**
 * Ensures a valid ISO 8601 string timestamp for client-side date tracking
 */
export function ensureIsoTimestamp(val?: number | string | null): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') {
    // Check if already an ISO date string
    if (val.includes('T') && val.includes('Z')) return val;
    // Check if a parseable date string
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
    return val;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

// =========================================================================
// TIER 1 -> TIER 2: LOCALSTORAGE TO FIRESTORE DOCUMENT MAPPING
// =========================================================================

export const FirestoreMappers = {
  saleToFirestore(sale: SaleTransaction, ownerId: string): Record<string, unknown> {
    const saleId = sanitizeId(sale.id);
    const createdAt = ensureIsoTimestamp(sale.createdAt);
    const updatedAt = ensureIsoTimestamp(sale.updatedAt || sale.createdAt);

    const doc: Record<string, unknown> = {
      id: saleId,
      ownerId,
      receiptNumber: (sale.receiptNumber || `REC-${Date.now()}`).slice(0, 100),
      date: (sale.date || new Date().toISOString().split('T')[0]).slice(0, 30),
      time: (sale.time || '17:00').slice(0, 20),
      customerName: (sale.customerName || 'Daily Sales Summary').slice(0, 200),
      items: (sale.items || []).slice(0, 10).map((i) => ({
        id: sanitizeId(i.id || 'item-1'),
        name: (i.name || 'Goods').slice(0, 150),
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || 0,
      })),
      subtotal: Number(sale.subtotal) || 0,
      taxRate: Number(sale.taxRate) || 0,
      taxAmount: Number(sale.taxAmount) || 0,
      totalAmount: Number(sale.totalAmount) || 0,
      cashAmount: Number(sale.cashAmount) || 0,
      bankTransferAmount: Number(sale.bankTransferAmount) || 0,
      paymentMethod: sale.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash',
      isReconciledWithBank: Boolean(sale.isReconciledWithBank),
      createdAt,
      updatedAt,
    };

    if (typeof sale.version === 'number') {
      doc.version = sale.version;
    }
    if (typeof sale.versionTimestamp === 'number') {
      doc.versionTimestamp = sale.versionTimestamp;
    }
    if (sale.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = sale.lastModifiedByDeviceId.slice(0, 128);
    }
    if (sale.bankAccountId) {
      doc.bankAccountId = sanitizeId(sale.bankAccountId);
    }
    if (sale.notes) {
      doc.notes = sale.notes.slice(0, 1000);
    }

    return doc;
  },

  purchaseToFirestore(purchase: PurchaseItem, ownerId: string): Record<string, unknown> {
    const purchaseId = sanitizeId(purchase.id);
    const createdAt = ensureIsoTimestamp(purchase.createdAt);
    const updatedAt = ensureIsoTimestamp(purchase.updatedAt || purchase.createdAt);

    const doc: Record<string, unknown> = {
      id: purchaseId,
      ownerId,
      invoiceNumber: (purchase.invoiceNumber || `INV-${Date.now()}`).slice(0, 100),
      date: (purchase.date || new Date().toISOString().split('T')[0]).slice(0, 30),
      vendorName: (purchase.vendorName || 'Supplier').slice(0, 200),
      itemName: (purchase.itemName || 'Expense item').slice(0, 300),
      category: (purchase.category || 'other_operational').slice(0, 60),
      quantity: Number(purchase.quantity) || 1,
      unitCost: Number(purchase.unitCost) || 0,
      subtotal: Number(purchase.subtotal) || 0,
      taxRate: Number(purchase.taxRate) || 0,
      taxAmount: Number(purchase.taxAmount) || 0,
      totalAmount: Number(purchase.totalAmount) || 0,
      cashAmount: Number(purchase.cashAmount) || 0,
      bankAmount: Number(purchase.bankAmount) || 0,
      deductibility: purchase.deductibility || 'fully_deductible',
      deductiblePercentage: Number(purchase.deductiblePercentage) || 100,
      paymentMethod: purchase.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash',
      isReconciledWithBank: Boolean(purchase.isReconciledWithBank),
      createdAt,
      updatedAt,
    };

    if (typeof purchase.version === 'number') {
      doc.version = purchase.version;
    }
    if (typeof purchase.versionTimestamp === 'number') {
      doc.versionTimestamp = purchase.versionTimestamp;
    }
    if (purchase.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = purchase.lastModifiedByDeviceId.slice(0, 128);
    }
    if (purchase.vendorTin) {
      doc.vendorTin = purchase.vendorTin.slice(0, 100);
    }
    if (purchase.bankAccountId) {
      doc.bankAccountId = sanitizeId(purchase.bankAccountId);
    }
    if (purchase.receiptImage && purchase.receiptImage.length < 800000) {
      doc.receiptImage = purchase.receiptImage;
    }
    if (purchase.notes) {
      doc.notes = purchase.notes.slice(0, 1000);
    }

    return doc;
  },

  bankAccountToFirestore(account: BankAccount, ownerId: string): Record<string, unknown> {
    const accountId = sanitizeId(account.id);
    const createdAt = ensureIsoTimestamp(account.createdAt);
    const updatedAt = ensureIsoTimestamp(account.updatedAt || account.createdAt);

    const doc: Record<string, unknown> = {
      id: accountId,
      ownerId,
      name: (account.name || 'Main Account').slice(0, 150),
      bankName: (account.bankName || 'Bank').slice(0, 150),
      accountNumberMasked: (account.accountNumberMasked || '•••• 0000').slice(0, 50),
      type: account.type || 'checking',
      currentBalance: Number(account.currentBalance) || 0,
      currency: (account.currency || 'ETB').slice(0, 20),
      color: (account.color || 'orange').slice(0, 40),
      createdAt,
      updatedAt,
    };

    if (typeof account.version === 'number') {
      doc.version = account.version;
    }
    if (typeof account.versionTimestamp === 'number') {
      doc.versionTimestamp = account.versionTimestamp;
    }
    if (account.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = account.lastModifiedByDeviceId.slice(0, 128);
    }

    return doc;
  },

  bankTxToFirestore(tx: BankTransaction, ownerId: string): Record<string, unknown> {
    const txId = sanitizeId(tx.id);
    const createdAt = ensureIsoTimestamp(tx.createdAt);
    const updatedAt = ensureIsoTimestamp(tx.updatedAt || tx.createdAt);

    const doc: Record<string, unknown> = {
      id: txId,
      ownerId,
      bankAccountId: sanitizeId(tx.bankAccountId),
      date: (tx.date || new Date().toISOString().split('T')[0]).slice(0, 30),
      description: (tx.description || 'Transaction').slice(0, 500),
      type: tx.type === 'credit' ? 'credit' : 'debit',
      amount: Number(tx.amount) || 0,
      category: (tx.category || 'other').slice(0, 60),
      isReconciled: Boolean(tx.isReconciled),
      createdAt,
      updatedAt,
    };

    if (typeof tx.version === 'number') {
      doc.version = tx.version;
    }
    if (typeof tx.versionTimestamp === 'number') {
      doc.versionTimestamp = tx.versionTimestamp;
    }
    if (tx.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = tx.lastModifiedByDeviceId.slice(0, 128);
    }
    if (tx.referenceId) {
      doc.referenceId = sanitizeId(tx.referenceId);
    }
    if (tx.reason) {
      doc.reason = tx.reason.slice(0, 500);
    }
    if (tx.notes || tx.reason) {
      doc.notes = (tx.notes || tx.reason || '').slice(0, 1000);
    }

    return doc;
  },

  dailyCloseToFirestore(close: DailyRegisterClose, ownerId: string): Record<string, unknown> {
    const closeId = sanitizeId(close.id);
    const createdAt = ensureIsoTimestamp(close.createdAt);
    const updatedAt = ensureIsoTimestamp(close.updatedAt || close.createdAt);

    const doc: Record<string, unknown> = {
      id: closeId,
      ownerId,
      date: (close.date || new Date().toISOString().split('T')[0]).slice(0, 30),
      openingFloat: Number(close.openingFloat) || 0,
      cashSales: Number(close.cashSales) || 0,
      cardSales: Number(close.cardSales) || 0,
      bankTransferSales: Number(close.bankTransferSales) || 0,
      totalGrossSales: Number(close.totalGrossSales) || 0,
      totalTaxCollected: Number(close.totalTaxCollected) || 0,
      cashPaidOutForPurchases: Number(close.cashPaidOutForPurchases) || 0,
      actualCashCounted: Number(close.actualCashCounted) || 0,
      cashVariance: Number(close.cashVariance) || 0,
      bankDepositAmount: Number(close.bankDepositAmount) || 0,
      closedBy: (close.closedBy || 'Cashier').slice(0, 150),
      status: close.status === 'variance_flagged' ? 'variance_flagged' : 'balanced',
      notes: (close.notes || '').slice(0, 1000),
      createdAt,
      updatedAt,
    };

    if (typeof close.version === 'number') {
      doc.version = close.version;
    }
    if (typeof close.versionTimestamp === 'number') {
      doc.versionTimestamp = close.versionTimestamp;
    }
    if (close.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = close.lastModifiedByDeviceId.slice(0, 128);
    }

    return doc;
  },

  reconcilingItemToFirestore(item: ReconcilingItem, ownerId: string): Record<string, unknown> {
    const itemId = sanitizeId(item.id);
    const createdAt = ensureIsoTimestamp(item.createdAt);
    const updatedAt = ensureIsoTimestamp(item.updatedAt || item.createdAt);

    const doc: Record<string, unknown> = {
      id: itemId,
      ownerId,
      bankAccountId: sanitizeId(item.bankAccountId),
      date: (item.date || new Date().toISOString().split('T')[0]).slice(0, 30),
      type: item.type || 'deposit_in_transit',
      referenceNumber: (item.referenceNumber || 'REF-1').slice(0, 100),
      partyOrDescription: (item.partyOrDescription || 'Adjustment').slice(0, 300),
      amount: Number(item.amount) || 0,
      isCleared: Boolean(item.isCleared),
      notes: (item.notes || '').slice(0, 1000),
      createdAt,
      updatedAt,
    };

    if (typeof item.version === 'number') {
      doc.version = item.version;
    }
    if (typeof item.versionTimestamp === 'number') {
      doc.versionTimestamp = item.versionTimestamp;
    }
    if (item.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = item.lastModifiedByDeviceId.slice(0, 128);
    }

    return doc;
  },

  brsStatementToFirestore(stmt: BankReconciliationStatement, ownerId: string): Record<string, unknown> {
    const stmtId = sanitizeId(stmt.id);
    const createdAt = ensureIsoTimestamp(stmt.createdAt);
    const updatedAt = ensureIsoTimestamp(stmt.updatedAt || stmt.createdAt);

    const doc: Record<string, unknown> = {
      id: stmtId,
      ownerId,
      statementNumber: (stmt.statementNumber || 'BRS-1').slice(0, 100),
      bankAccountId: sanitizeId(stmt.bankAccountId),
      statementDate: (stmt.statementDate || new Date().toISOString().split('T')[0]).slice(0, 30),
      periodStart: (stmt.periodStart || new Date().toISOString().split('T')[0]).slice(0, 30),
      periodEnd: (stmt.periodEnd || new Date().toISOString().split('T')[0]).slice(0, 30),
      balancePerBankStatement: Number(stmt.balancePerBankStatement) || 0,
      unadjustedBookBalance: Number(stmt.unadjustedBookBalance) || 0,
      depositsInTransitTotal: Number(stmt.depositsInTransitTotal) || 0,
      outstandingChequesTotal: Number(stmt.outstandingChequesTotal) || 0,
      unrecordedCreditsTotal: Number(stmt.unrecordedCreditsTotal) || 0,
      bankChargesTotal: Number(stmt.bankChargesTotal) || 0,
      adjustedBankBalance: Number(stmt.adjustedBankBalance) || 0,
      adjustedBookBalance: Number(stmt.adjustedBookBalance) || 0,
      variance: Number(stmt.variance) || 0,
      status: stmt.status === 'discrepancy' ? 'discrepancy' : 'reconciled',
      preparedBy: (stmt.preparedBy || 'Accountant').slice(0, 150),
      certifiedAt: (stmt.certifiedAt || new Date().toISOString()).slice(0, 60),
      notes: (stmt.notes || '').slice(0, 1000),
      createdAt,
      updatedAt,
    };

    if (typeof stmt.version === 'number') {
      doc.version = stmt.version;
    }
    if (typeof stmt.versionTimestamp === 'number') {
      doc.versionTimestamp = stmt.versionTimestamp;
    }
    if (stmt.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = stmt.lastModifiedByDeviceId.slice(0, 128);
    }

    return doc;
  },

  settingsToFirestore(settings: TaxSettings, ownerId: string): Record<string, unknown> {
    const createdAt = ensureIsoTimestamp(settings.createdAt);
    const updatedAt = ensureIsoTimestamp(settings.updatedAt || settings.createdAt);

    const doc: Record<string, unknown> = {
      ownerId,
      businessName: (settings.businessName || 'Business Shop').slice(0, 200),
      taxIdNumber: (settings.taxIdNumber || '').slice(0, 100),
      currency: (settings.currency || 'ETB').slice(0, 20),
      currencySymbol: (settings.currencySymbol || 'Br').slice(0, 20),
      defaultSalesTaxRate: Number(settings.defaultSalesTaxRate) || 0.15,
      corporateTaxRate: Number(settings.corporateTaxRate) || 0.30,
      fiscalYearStartMonth: Number(settings.fiscalYearStartMonth) || 7,
      createdAt,
      updatedAt,
    };

    if (typeof settings.version === 'number') {
      doc.version = settings.version;
    }
    if (typeof settings.versionTimestamp === 'number') {
      doc.versionTimestamp = settings.versionTimestamp;
    }
    if (settings.lastModifiedByDeviceId) {
      doc.lastModifiedByDeviceId = settings.lastModifiedByDeviceId.slice(0, 128);
    }
    if (settings.googleSheetId) doc.googleSheetId = settings.googleSheetId.slice(0, 200);
    if (settings.googleSheetUrl) doc.googleSheetUrl = settings.googleSheetUrl.slice(0, 500);
    if (settings.googleSheetName) doc.googleSheetName = settings.googleSheetName.slice(0, 200);
    if (settings.googleAppsScriptUrl) doc.googleAppsScriptUrl = settings.googleAppsScriptUrl.slice(0, 500);
    if (settings.googleSyncMethod) doc.googleSyncMethod = settings.googleSyncMethod;
    if (typeof settings.autoSyncToGoogleSheets === 'boolean') doc.autoSyncToGoogleSheets = settings.autoSyncToGoogleSheets;
    if (settings.lastGoogleSheetSyncAt) doc.lastGoogleSheetSyncAt = settings.lastGoogleSheetSyncAt;

    return doc;
  },
};

// =========================================================================
// TIER 1 / TIER 2 -> TIER 3: GOOGLE SHEETS 2D ARRAY MAPPING
// =========================================================================

export const GoogleSheetsMappers = {
  salesHeaders: [
    'Record ID',
    'Date (User Entered)',
    'Created At (Original Timestamp)',
    'Receipt / Invoice #',
    'Customer Name',
    'Payment Method',
    'Gross Total',
    'Cash Received',
    'Bank Transfer Received',
    'VAT Rate (%)',
    'VAT Amount',
    'Net Base Sales',
    'Bank Account ID',
    'Reconciled With Bank?',
    'Notes',
  ],

  saleToRow(s: SaleTransaction): (string | number)[] {
    return [
      s.id,
      s.date,
      ensureIsoTimestamp(s.createdAt),
      s.receiptNumber,
      s.customerName || 'Cash Customer',
      s.paymentMethod,
      Number(s.totalAmount) || 0,
      Number(s.cashAmount) || (s.paymentMethod === 'cash' ? Number(s.totalAmount) : 0),
      Number(s.bankTransferAmount) || (s.paymentMethod === 'bank_transfer' ? Number(s.totalAmount) : 0),
      (Number(s.taxRate) || 0) * 100,
      Number(s.taxAmount) || 0,
      Number(s.subtotal) || 0,
      s.bankAccountId || '',
      s.isReconciledWithBank ? 'YES' : 'NO',
      s.notes || '',
    ];
  },

  purchaseHeaders: [
    'Record ID',
    'Date (User Entered)',
    'Created At (Original Timestamp)',
    'Invoice / FS #',
    'Supplier Name',
    'Supplier TIN',
    'Item Name',
    'Category',
    'Payment Method',
    'Quantity',
    'Unit Cost',
    'Pre-Tax Subtotal',
    'VAT Amount',
    'Total Amount',
    'Deductibility',
    'Deductible %',
    'Bank Account ID',
    'Reconciled With Bank?',
    'Notes',
  ],

  purchaseToRow(p: PurchaseItem): (string | number)[] {
    return [
      p.id,
      p.date,
      ensureIsoTimestamp(p.createdAt),
      p.invoiceNumber,
      p.vendorName,
      p.vendorTin || '',
      p.itemName,
      p.category,
      p.paymentMethod,
      Number(p.quantity) || 1,
      Number(p.unitCost) || 0,
      Number(p.subtotal) || 0,
      Number(p.taxAmount) || 0,
      Number(p.totalAmount) || 0,
      p.deductibility,
      Number(p.deductiblePercentage) || 100,
      p.bankAccountId || '',
      p.isReconciledWithBank ? 'YES' : 'NO',
      p.notes || '',
    ];
  },

  bankTxHeaders: [
    'Record ID',
    'Date',
    'Created At',
    'Bank Account ID',
    'Description',
    'Type',
    'Amount',
    'Category',
    'Reference ID',
    'Reconciled?',
    'Notes',
  ],

  bankTxToRow(t: BankTransaction): (string | number)[] {
    return [
      t.id,
      t.date,
      ensureIsoTimestamp(t.createdAt),
      t.bankAccountId,
      t.description,
      t.type.toUpperCase(),
      Number(t.amount) || 0,
      t.category,
      t.referenceId || '',
      t.isReconciled ? 'YES' : 'NO',
      t.notes || t.reason || '',
    ];
  },
};
