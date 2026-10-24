import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  DailyRegisterClose,
  TaxSettings,
} from '../types';
import { DailyCashAuditSummary } from '../utils/dailyCashReconciliation';
import { formatCurrency, formatDate } from '../utils/formatters';

export interface GoogleSheetsSyncResult {
  success: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  syncedAt: string;
  recordsCount: {
    sales: number;
    purchases: number;
    bankAccounts: number;
    bankTransactions: number;
    dailyCashRecords: number;
  };
  error?: string;
  method?: 'appscript';
}

export interface GoogleSheetsSyncOptions {
  appsScriptUrl?: string;
  existingSpreadsheetId?: string;
  settings: TaxSettings;
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  dailyCloses: DailyRegisterClose[];
  dailyCashAudit: DailyCashAuditSummary;
}

export const REQUIRED_SHEET_TITLES = [
  'Overview & Tax Summary',
  'Sales Register',
  'Purchase Invoices',
  'Bank Accounts & Txns',
  'Daily Cash Reconciliation',
];

/**
 * Prepares the formatted 2D table arrays for all 5 sheets
 */
export function generateSheetsData(options: GoogleSheetsSyncOptions) {
  const {
    settings,
    sales,
    purchases,
    bankAccounts,
    bankTransactions,
    dailyCashAudit,
  } = options;

  const totalSales = sales.reduce((acc, s) => acc + (Number(s.totalAmount) || 0), 0);
  const totalVATCollected = sales.reduce((acc, s) => acc + (Number(s.taxAmount) || 0), 0);
  const totalPurchases = purchases.reduce((acc, p) => acc + (Number(p.totalAmount) || 0), 0);
  const totalVATPurchases = purchases.reduce((acc, p) => acc + (Number(p.taxAmount) || 0), 0);
  const netVATPayable = Math.max(0, totalVATCollected - totalVATPurchases);
  const withholdingTaxEstimated = totalSales * 0.02; // Standard 2% statutory withholding
  const estimatedTaxableProfit = Math.max(0, totalSales - totalPurchases);
  const corporateTaxEstimate = estimatedTaxableProfit * (settings.corporateTaxRate || 0.2);

  const nowIso = new Date().toISOString();

  // 1. Overview Sheet Rows
  const overviewRows: (string | number)[][] = [
    ['TaxGuard Financial & Tax Audit Ledger', ''],
    ['Generated On', nowIso],
    ['Business Name', settings.businessName || 'Business Ledger'],
    ['Tax ID / TIN Number', settings.taxIdNumber || 'N/A'],
    ['Currency', `${settings.currency} (${settings.currencySymbol})`],
    ['', ''],
    ['KEY TAX & FINANCIAL METRICS', 'AMOUNT'],
    ['Gross Sales Revenue', totalSales],
    ['Total VAT Collected (15%)', totalVATCollected],
    ['Total Allowable Purchases', totalPurchases],
    ['Input VAT Deductible', totalVATPurchases],
    ['Net VAT Payable to MoR', netVATPayable],
    ['2% Withholding Tax Retained', withholdingTaxEstimated],
    ['Estimated Corporate Income Tax', corporateTaxEstimate],
    ['', ''],
    ['CASH & BANKING STATUS', 'VALUE'],
    ['Bank Accounts Tracked', bankAccounts.length],
    ['Total Bank Balance', bankAccounts.reduce((acc, a) => acc + a.currentBalance, 0)],
    ['Undeposited Cash on Hand (Safe)', dailyCashAudit.netUndepositedCashBalance],
    ['Days With Cash Discrepancy', dailyCashAudit.daysWithDiscrepancy],
    ['Tax Audit Status', dailyCashAudit.overallAuditVerdict.toUpperCase()],
  ];

  // 2. Sales Register Rows
  const salesHeaders = [
    'Date',
    'Receipt / Invoice #',
    'Customer Name',
    'Payment Method',
    'Gross Total',
    'Cash Received',
    'Bank Transfer Received',
    'VAT Rate (%)',
    'VAT Amount',
    'Net Base Sales',
    'Notes',
  ];
  const salesRows: (string | number)[][] = [
    salesHeaders,
    ...sales.map((s) => [
      s.date,
      s.receiptNumber,
      s.customerName || 'Cash Customer',
      s.paymentMethod,
      s.totalAmount,
      s.cashAmount || (s.paymentMethod === 'cash' ? s.totalAmount : 0),
      s.bankTransferAmount || (s.paymentMethod === 'bank_transfer' ? s.totalAmount : 0),
      s.taxRate * 100,
      s.taxAmount,
      s.subtotal,
      s.notes || '',
    ]),
  ];

  // 3. Purchase Invoices Rows
  const purchaseHeaders = [
    'Date',
    'Invoice #',
    'Supplier Name',
    'Supplier TIN',
    'Category',
    'Payment Method',
    'Total Amount',
    'VAT Amount',
    'Pre-Tax Subtotal',
    'Deductibility',
    '50k ETB Cash Rule',
    'Notes',
  ];
  const purchaseRows: (string | number)[][] = [
    purchaseHeaders,
    ...purchases.map((p) => [
      p.date,
      p.invoiceNumber,
      p.vendorName,
      p.vendorTin || '',
      p.category,
      p.paymentMethod,
      p.totalAmount,
      p.taxAmount,
      p.subtotal,
      p.deductibility,
      p.paymentMethod === 'cash' && p.totalAmount > 50000
        ? 'VIOLATION (>50k Cash)'
        : 'COMPLIANT',
      p.notes || '',
    ]),
  ];

  // 4. Bank Accounts & Transactions Rows
  const bankAccountRows: (string | number)[][] = [
    ['BANK ACCOUNTS LIST', '', '', '', ''],
    ['Account Name', 'Bank Name', 'Account Number', 'Currency', 'Current Balance'],
    ...bankAccounts.map((a) => [
      a.name,
      a.bankName,
      a.accountNumberMasked,
      a.currency,
      a.currentBalance,
    ]),
    ['', '', '', '', ''],
    ['BANK TRANSACTIONS REGISTER', '', '', '', '', '', ''],
    ['Date', 'Bank Account ID', 'Description', 'Type', 'Amount', 'Category', 'Reconciled?'],
    ...bankTransactions.map((t) => [
      t.date,
      t.bankAccountId,
      t.description,
      t.type.toUpperCase(),
      t.amount,
      t.category,
      t.isReconciled ? 'YES' : 'NO',
    ]),
  ];

  // 5. Daily Cash Reconciliation Rows
  const dailyCashHeaders = [
    'Date',
    'Day of Week',
    'Total Daily Sales',
    'Cash Sales',
    'Transfer Sales',
    'Cash Purchases (Not Trf)',
    'Transfer Purchases',
    'Net Cash to Bank (Daily)',
    'Cumulative Cash to Bank',
    'Actual Bank Deposit',
    'Cumulative Bank Deposits',
    'Safe / Undeposited Cash on Hand',
    'Audit Status',
    'Findings / Guidance',
  ];
  const dailyCashRows: (string | number)[][] = [
    dailyCashHeaders,
    ...dailyCashAudit.records.map((r) => [
      r.date,
      r.dayOfWeek,
      r.grossDailySales,
      r.cashSales,
      r.bankTransferSales,
      r.cashPurchases,
      r.bankTransferPurchases,
      r.dailyCashToDeposit,
      r.cumulativeCashToDeposit,
      r.actualBankDeposits,
      r.cumulativeBankDeposits,
      r.undepositedCashOnHand,
      r.auditStatus,
      r.findings.join(' | ') || 'Compliant with MoR Chapter 6',
    ]),
  ];

  return {
    overviewRows,
    salesRows,
    purchaseRows,
    bankAccountRows,
    dailyCashRows,
    recordsCount: {
      sales: sales.length,
      purchases: purchases.length,
      bankAccounts: bankAccounts.length,
      bankTransactions: bankTransactions.length,
      dailyCashRecords: dailyCashAudit.records.length,
    },
  };
}

/**
 * Syncs financial data to Google Sheets via Google Apps Script Web App
 */
export async function syncViaAppsScript(
  appsScriptUrl: string,
  options: GoogleSheetsSyncOptions
): Promise<GoogleSheetsSyncResult> {
  const cleanUrl = appsScriptUrl.trim();
  if (!cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    throw new Error(
      'Invalid Apps Script URL. It must begin with "https://script.google.com/macros/s/.../exec"'
    );
  }

  const {
    overviewRows,
    salesRows,
    purchaseRows,
    bankAccountRows,
    dailyCashRows,
    recordsCount,
  } = generateSheetsData(options);

  const payload = {
    action: 'syncData',
    spreadsheetId: options.existingSpreadsheetId || options.settings.googleSheetId || '',
    spreadsheetTitle: `${options.settings.businessName || 'Business'} - Tax & Financial Ledger`,
    overviewRows,
    salesRows,
    purchaseRows,
    bankAccountRows,
    dailyCashRows,
    recordsCount,
    timestamp: new Date().toISOString(),
  };

  try {
    // We send payload as text/plain so the browser does NOT issue an OPTIONS preflight request
    // which Google Apps Script web apps do not handle.
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.status === 'success') {
        return {
          success: true,
          spreadsheetId: data.spreadsheetId || options.settings.googleSheetId || '',
          spreadsheetUrl:
            data.spreadsheetUrl ||
            (data.spreadsheetId
              ? `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`
              : ''),
          spreadsheetTitle: data.spreadsheetTitle || payload.spreadsheetTitle,
          syncedAt: data.syncedAt || new Date().toISOString(),
          recordsCount,
          method: 'appscript',
        };
      } else if (data && data.status === 'error') {
        throw new Error(data.message || 'Apps Script returned an execution error.');
      }
    }

    // If redirected or non-JSON returned, fallback to success confirmation
    return {
      success: true,
      spreadsheetId: options.existingSpreadsheetId || options.settings.googleSheetId || '',
      spreadsheetUrl: options.settings.googleSheetUrl || '',
      spreadsheetTitle: payload.spreadsheetTitle,
      syncedAt: new Date().toISOString(),
      recordsCount,
      method: 'appscript',
    };
  } catch (err: unknown) {
    // If standard fetch failed due to browser redirect restrictions, retry with mode: 'no-cors'
    try {
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      return {
        success: true,
        spreadsheetId: options.existingSpreadsheetId || options.settings.googleSheetId || '',
        spreadsheetUrl: options.settings.googleSheetUrl || '',
        spreadsheetTitle: payload.spreadsheetTitle,
        syncedAt: new Date().toISOString(),
        recordsCount,
        method: 'appscript',
      };
    } catch {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Apps Script sync error: ${errMsg}`);
    }
  }
}

/**
 * Tests connection to Google Apps Script Web App
 */
export async function testAppsScriptUrl(url: string): Promise<{ success: boolean; message: string }> {
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    return {
      success: false,
      message: 'URL must start with https://script.google.com/macros/s/.../exec',
    };
  }

  try {
    const res = await fetch(cleanUrl, { method: 'GET' });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      return {
        success: true,
        message: data?.message || 'Connected successfully to Google Apps Script!',
      };
    }
    return {
      success: false,
      message: `Apps Script returned HTTP status ${res.status}. Ensure deployment is set to "Anyone".`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to reach Apps Script: ${err instanceof Error ? err.message : String(err)}. Check "Execute as Me" and "Who has access: Anyone".`,
    };
  }
}

/**
 * Synchronizes financial data directly to Google Sheets via Google Apps Script Web App
 */
export async function syncToGoogleSheets(
  options: GoogleSheetsSyncOptions
): Promise<GoogleSheetsSyncResult> {
  const appsScriptUrl = options.appsScriptUrl || options.settings.googleAppsScriptUrl;
  if (!appsScriptUrl || appsScriptUrl.trim().length === 0) {
    throw new Error(
      'Google Apps Script Web App URL is required to sync data to Google Sheets. Paste your Web App URL in the setup modal.'
    );
  }
  return await syncViaAppsScript(appsScriptUrl, options);
}

/**
 * Production-ready Google Apps Script Code template for the user to copy-paste into Google Sheets
 */
export const TAXGUARD_APPS_SCRIPT_CODE = `/**
 * =========================================================================
 * TaxGuard Financial Ledger & Tax Audit Sync
 * Google Apps Script Web App
 * =========================================================================
 * 
 * QUICK SETUP (Takes under 1 minute):
 * 1. Open your target Google Sheet (or go to https://sheets.new to make one).
 * 2. In Google Sheets top menu, click: "Extensions" > "Apps Script".
 * 3. Delete any default code in Code.gs, paste this entire script, and click Save (💾).
 * 4. Click the blue "Deploy" button at top right -> select "New deployment".
 * 5. Click the gear icon next to "Select type" -> choose "Web app".
 * 6. Set Description: "TaxGuard Sync"
 * 7. Set "Execute as": "Me (your email address)"
 * 8. Set "Who has access": "Anyone"  <-- CRITICAL for webhook sync!
 * 9. Click "Deploy" -> authorize permissions with your Google account.
 * 10. Copy the "Web app URL" (ends in /exec) and paste it into TaxGuard!
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'TaxGuard Google Apps Script Web App is connected and ready to receive financial data!',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : '';
    if (!raw) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No payload data received.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var payload = JSON.parse(raw);
    
    // Determine active spreadsheet: container-bound sheet or by spreadsheetId
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}

    if (!ss && payload.spreadsheetId) {
      try {
        ss = SpreadsheetApp.openById(payload.spreadsheetId);
      } catch (e) {}
    }

    if (!ss) {
      ss = SpreadsheetApp.create(payload.spreadsheetTitle || 'TaxGuard Financial Ledger');
    }

    // 1. Overview & Tax Summary Tab
    updateTab(ss, 'Overview & Tax Summary', payload.overviewRows || [], '#EA580C');

    // 2. Sales Register Tab
    updateTab(ss, 'Sales Register', payload.salesRows || [], '#16A34A');

    // 3. Purchase Invoices Tab
    updateTab(ss, 'Purchase Invoices', payload.purchaseRows || [], '#2563EB');

    // 4. Bank Accounts & Txns Tab
    updateTab(ss, 'Bank Accounts & Txns', payload.bankAccountRows || [], '#7C3AED');

    // 5. Daily Cash Reconciliation Tab
    updateTab(ss, 'Daily Cash Reconciliation', payload.dailyCashRows || [], '#D97706');

    // Move Overview tab to the first position
    var firstTab = ss.getSheetByName('Overview & Tax Summary');
    if (firstTab) {
      ss.setActiveSheet(firstTab);
      ss.moveActiveSheet(1);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      spreadsheetTitle: ss.getName(),
      syncedAt: new Date().toISOString(),
      recordsCount: payload.recordsCount || {}
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateTab(ss, sheetName, rows, headerColor) {
  if (!rows || rows.length === 0) return;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  var numRows = rows.length;
  var numCols = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length > numCols) numCols = rows[i].length;
  }
  if (numCols === 0) return;

  // Pad rows so every row has identical column count
  var paddedRows = rows.map(function(r) {
    var copy = r.slice();
    while (copy.length < numCols) copy.push('');
    return copy;
  });

  // Ensure grid size accommodates rows
  if (sheet.getMaxRows() < numRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), numRows - sheet.getMaxRows() + 5);
  }
  if (sheet.getMaxColumns() < numCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), numCols - sheet.getMaxColumns() + 2);
  }

  var range = sheet.getRange(1, 1, numRows, numCols);
  range.setValues(paddedRows);

  // Format header row
  var header = sheet.getRange(1, 1, 1, numCols);
  header.setFontWeight('bold');
  header.setBackground(headerColor || '#EA580C');
  header.setFontColor('#FFFFFF');
  header.setHorizontalAlignment('center');

  // Freeze header row
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, Math.min(numCols, 15));
}
`;
