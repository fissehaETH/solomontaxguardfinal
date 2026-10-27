import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  DailyRegisterClose,
  TaxSettings,
  ExpenseCategory,
} from '../types';
import { DailyCashAuditSummary } from '../utils/dailyCashReconciliation';
import { formatCurrency, formatDate, DEFAULT_TAX_SETTINGS } from '../utils/formatters';

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

export interface SheetTabDetail {
  name: string;
  rowCount: number;
  previewHeaders: string[];
  isEmpty: boolean;
}

export interface GoogleSheetsImportData {
  settings?: Partial<TaxSettings>;
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  dailyCloses: DailyRegisterClose[];
  rawStats: {
    salesCount: number;
    purchasesCount: number;
    bankAccountsCount: number;
    bankTransactionsCount: number;
    dailyClosesCount: number;
  };
  spreadsheetTitle?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sourceSpreadsheetId?: string;
  sourceSpreadsheetTitle?: string;
  source: 'appscript' | 'public_sheet';
  tabNames?: string[];
  tabSummaries?: SheetTabDetail[];
  isEmptySpreadsheet?: boolean;
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
    ['Currency', `${(settings.currency || 'ETB').replace(/[()]/g, '').trim()}`],
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
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  if (action === 'read' || action === 'export' || action === 'populate') {
    return handleRead(e.parameter ? e.parameter.spreadsheetId : null);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'TaxGuard Google Apps Script Web App is connected and ready to receive and export financial data!',
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

    // If client requested reading/populating data
    if (payload.action === 'read' || payload.action === 'export' || payload.action === 'populate') {
      return handleRead(payload.spreadsheetId);
    }
    
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

function handleRead(spreadsheetId) {
  try {
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}

    if (!ss && spreadsheetId) {
      try {
        ss = SpreadsheetApp.openById(spreadsheetId);
      } catch (e) {}
    }

    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Spreadsheet not found. Ensure the script is bound to your sheet or valid spreadsheetId is passed.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var allSheets = ss.getSheets();
    var sheetsData = {};
    for (var i = 0; i < allSheets.length; i++) {
      var s = allSheets[i];
      var name = s.getName();
      var lastRow = s.getLastRow();
      var lastCol = s.getLastColumn();
      if (lastRow > 0 && lastCol > 0) {
        sheetsData[name] = s.getRange(1, 1, lastRow, lastCol).getValues();
      } else {
        sheetsData[name] = [];
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      spreadsheetTitle: ss.getName(),
      readAt: new Date().toISOString(),
      sheets: sheetsData
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

// =========================================================================
// DATA POPULATION & IMPORT HELPERS (GOOGLE SHEETS -> TAXGUARD)
// =========================================================================

export function parseNumber(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim().replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function parseDateStr(val: unknown): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

export function parseCsvToRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function findSheetRows(
  sheetsMap: Record<string, any[][]>,
  keywords: string[]
): { name: string; rows: any[][] } {
  for (const key of Object.keys(sheetsMap)) {
    const lowerKey = key.toLowerCase();
    if (keywords.some((kw) => lowerKey.includes(kw.toLowerCase()))) {
      return { name: key, rows: sheetsMap[key] || [] };
    }
  }
  return { name: '', rows: [] };
}

/**
 * Parses raw 2D sheet arrays into validated domain objects
 */
export function parseSpreadsheetSheets(
  sheetsMap: Record<string, any[][]>,
  fallbackSettings: TaxSettings
): GoogleSheetsImportData {
  const importedSettings: Partial<TaxSettings> = {};

  const tabNames = Object.keys(sheetsMap);
  const tabSummaries: SheetTabDetail[] = tabNames.map((name) => {
    const rawRows = sheetsMap[name] || [];
    const nonEmptyRows = rawRows.filter(
      (r) => r && r.some((c) => c !== '' && c !== null && c !== undefined)
    );
    const headers =
      rawRows.length > 0
        ? (rawRows[0] || []).map((c) => String(c || '').trim()).filter(Boolean)
        : [];
    return {
      name,
      rowCount: nonEmptyRows.length,
      previewHeaders: headers.slice(0, 6),
      isEmpty: nonEmptyRows.length <= 1,
    };
  });

  // 1. Overview Sheet -> Settings
  const overviewMatch = findSheetRows(sheetsMap, [
    'overview & tax summary',
    'overview',
    'tax summary',
    'summary',
    'info',
    'profile',
    'business',
    'ማጠቃለያ',
  ]);
  const overviewRows = overviewMatch.rows;
  if (overviewRows.length > 0) {
    for (const row of overviewRows) {
      if (!row || row.length < 2) continue;
      const key = String(row[0] || '').trim().toLowerCase();
      const val = row[1];
      if (!val) continue;

      if (key.includes('business name')) {
        importedSettings.businessName = String(val).trim();
      } else if (key.includes('tax id') || key.includes('tin')) {
        importedSettings.taxIdNumber = String(val).trim();
      } else if (key.includes('currency') && !key.includes('symbol')) {
        const rawCurr = String(val).replace(/[()]/g, '').trim();
        const match = rawCurr.match(/[A-Z]{3}|\$|€|£|₹|₦|ETB/i);
        const code = (match ? match[0] : rawCurr.split(' ')[0]).trim() || 'ETB';
        importedSettings.currency = code;
        importedSettings.currencySymbol = `${code} `;
      }
    }
  }

  // 2. Sales Register -> SaleTransaction[]
  const salesMatch = findSheetRows(sheetsMap, [
    'sales register',
    'sales',
    'ሽያጭ',
    'sale',
    'revenues',
    'revenue',
    'incomes',
    'income',
    'receipts',
    'receipt',
    'orders',
    'order',
    'customers',
    'customer',
    'ደንበኞች',
    'ገቢ',
    'ሂሳብ',
  ]);
  const salesRows = salesMatch.rows;
  const sales: SaleTransaction[] = [];
  if (salesRows.length > 1) {
    let headerIdx = 0;
    for (let i = 0; i < Math.min(salesRows.length, 5); i++) {
      const rowStr = (salesRows[i] || []).join(' ').toLowerCase();
      if (rowStr.includes('date') && (rowStr.includes('receipt') || rowStr.includes('total') || rowStr.includes('gross') || rowStr.includes('customer'))) {
        headerIdx = i;
        break;
      }
    }
    const headers = (salesRows[headerIdx] || []).map((h) => String(h || '').trim().toLowerCase());
    const findCol = (regex: RegExp) => headers.findIndex((h) => regex.test(h));

    const dateCol = findCol(/date|ቀን/i);
    const receiptCol = findCol(/receipt|invoice|fs|ቁጥር/i);
    const customerCol = findCol(/customer|ደንበኛ/i);
    const methodCol = findCol(/method|payment|አከፋፈል/i);
    const totalCol = findCol(/gross|total|ድምር|ጠቅላላ/i);
    const cashCol = findCol(/cash|ጥሬ/i);
    const transferCol = findCol(/transfer|ባንክ/i);
    const taxRateCol = findCol(/rate|መጠን/i);
    const taxCol = findCol(/vat amount|tax amount|ታክስ|vat/i);
    const subtotalCol = findCol(/subtotal|net base|base/i);
    const notesCol = findCol(/note|ማስታወሻ/i);

    for (let i = headerIdx + 1; i < salesRows.length; i++) {
      const row = salesRows[i];
      if (!row || row.length === 0) continue;
      const rawDate = dateCol >= 0 ? row[dateCol] : row[0];
      const date = parseDateStr(rawDate);
      const totalAmount = totalCol >= 0 ? parseNumber(row[totalCol]) : parseNumber(row[4]);
      if (!totalAmount && !rawDate) continue;

      const receiptNumber =
        receiptCol >= 0 && row[receiptCol]
          ? String(row[receiptCol]).trim()
          : `REC-${date.replace(/-/g, '')}-${i}`;
      const customerName =
        customerCol >= 0 && row[customerCol] ? String(row[customerCol]).trim() : 'Daily Sales Customer';
      const cashAmount = cashCol >= 0 ? parseNumber(row[cashCol]) : 0;
      const transferAmount = transferCol >= 0 ? parseNumber(row[transferCol]) : 0;
      const rawMethod = methodCol >= 0 ? String(row[methodCol]).toLowerCase() : '';
      const paymentMethod: 'cash' | 'bank_transfer' =
        (transferAmount > 0 && cashAmount === 0) || rawMethod.includes('transfer') || rawMethod.includes('bank')
          ? 'bank_transfer'
          : 'cash';
      const taxAmount = taxCol >= 0 ? parseNumber(row[taxCol]) : (totalAmount * 0.15) / 1.15;
      const subtotal = subtotalCol >= 0 ? parseNumber(row[subtotalCol]) : totalAmount - taxAmount;
      const taxRate =
        taxRateCol >= 0 && parseNumber(row[taxRateCol]) > 0 ? parseNumber(row[taxRateCol]) / 100 : 0.15;
      const notes = notesCol >= 0 && row[notesCol] ? String(row[notesCol]).trim() : '';

      sales.push({
        id: `sale-${date.replace(/-/g, '')}-${receiptNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        date,
        time: '17:00',
        receiptNumber,
        customerName,
        items: [
          {
            id: `item-${i}-1`,
            name: `${customerName} Merchandise`,
            quantity: 1,
            unitPrice: subtotal,
          },
        ],
        paymentMethod,
        totalAmount,
        cashAmount: cashAmount || (paymentMethod === 'cash' ? totalAmount : 0),
        bankTransferAmount: transferAmount || (paymentMethod === 'bank_transfer' ? totalAmount : 0),
        taxAmount: Math.round(taxAmount * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: taxRate > 1 ? taxRate / 100 : taxRate || 0.15,
        isReconciledWithBank: transferAmount > 0 || paymentMethod === 'bank_transfer',
        notes,
        createdAt: Date.now() - (salesRows.length - i) * 60000,
      });
    }
  }

  // 3. Purchase Invoices -> PurchaseItem[]
  const purchaseMatch = findSheetRows(sheetsMap, [
    'purchase invoices',
    'purchase',
    'purchases',
    'invoice',
    'invoices',
    'ግዢ',
    'expense',
    'expenses',
    'supplier',
    'suppliers',
    'vendor',
    'vendors',
    'cost',
    'costs',
    'bills',
    'bill',
    'አቅራቢዎች',
    'ወጪ',
  ]);
  const purchaseRows = purchaseMatch.rows;
  const purchases: PurchaseItem[] = [];
  if (purchaseRows.length > 1) {
    let headerIdx = 0;
    for (let i = 0; i < Math.min(purchaseRows.length, 5); i++) {
      const rowStr = (purchaseRows[i] || []).join(' ').toLowerCase();
      if (rowStr.includes('date') && (rowStr.includes('invoice') || rowStr.includes('supplier') || rowStr.includes('vendor') || rowStr.includes('total'))) {
        headerIdx = i;
        break;
      }
    }
    const headers = (purchaseRows[headerIdx] || []).map((h) => String(h || '').trim().toLowerCase());
    const findCol = (regex: RegExp) => headers.findIndex((h) => regex.test(h));

    const dateCol = findCol(/date|ቀን/i);
    const invoiceCol = findCol(/invoice|ደረሰኝ|ቁጥር/i);
    const vendorCol = findCol(/supplier|vendor|አቅራቢ/i);
    const tinCol = findCol(/tin|ቲን/i);
    const categoryCol = findCol(/category|ዘርፍ/i);
    const methodCol = findCol(/method|payment|አከፋፈል/i);
    const totalCol = findCol(/total|ድምር|ጠቅላላ/i);
    const taxCol = findCol(/vat amount|tax|ተ.እ.ታ/i);
    const subtotalCol = findCol(/pre-tax|subtotal/i);
    const deductCol = findCol(/deduct/i);
    const notesCol = findCol(/note|ማስታወሻ/i);

    for (let i = headerIdx + 1; i < purchaseRows.length; i++) {
      const row = purchaseRows[i];
      if (!row || row.length === 0) continue;
      const rawDate = dateCol >= 0 ? row[dateCol] : row[0];
      const date = parseDateStr(rawDate);
      const totalAmount = totalCol >= 0 ? parseNumber(row[totalCol]) : parseNumber(row[6]);
      if (!totalAmount && !rawDate) continue;

      const invoiceNumber =
        invoiceCol >= 0 && row[invoiceCol]
          ? String(row[invoiceCol]).trim()
          : `INV-${date.replace(/-/g, '')}-${i}`;
      const vendorName = vendorCol >= 0 && row[vendorCol] ? String(row[vendorCol]).trim() : 'Supplier';
      const vendorTin = tinCol >= 0 && row[tinCol] ? String(row[tinCol]).trim() : '';
      const rawCat = categoryCol >= 0 ? String(row[categoryCol]).toLowerCase() : '';
      let category: ExpenseCategory = 'inventory_cogs';
      if (rawCat.includes('rent')) category = 'rent_lease';
      else if (rawCat.includes('utility') || rawCat.includes('electric') || rawCat.includes('water')) category = 'utilities';
      else if (rawCat.includes('transport') || rawCat.includes('freight')) category = 'logistics_transport';
      else if (rawCat.includes('repair') || rawCat.includes('maintenance')) category = 'equipment_repairs';
      else if (rawCat.includes('pack')) category = 'packaging_supplies';
      else if (rawCat.includes('fee') || rawCat.includes('legal') || rawCat.includes('account')) category = 'professional_fees';
      else if (rawCat.includes('meal') || rawCat.includes('food')) category = 'meals_entertainment';
      else if (rawCat.includes('market') || rawCat.includes('ad')) category = 'marketing_ads';
      else if (rawCat.includes('other')) category = 'other_operational';

      const rawMethod = methodCol >= 0 ? String(row[methodCol]).toLowerCase() : '';
      const paymentMethod: any =
        rawMethod.includes('transfer') || rawMethod.includes('bank') ? 'bank_transfer' : 'cash';
      const taxAmount = taxCol >= 0 ? parseNumber(row[taxCol]) : (totalAmount * 0.15) / 1.15;
      const subtotal = subtotalCol >= 0 ? parseNumber(row[subtotalCol]) : totalAmount - taxAmount;
      const deductibility =
        deductCol >= 0 && String(row[deductCol]).toLowerCase().includes('non')
          ? 'non_deductible'
          : 'fully_deductible';
      const deductiblePercentage = deductibility === 'fully_deductible' ? 100 : 0;
      const notes = notesCol >= 0 && row[notesCol] ? String(row[notesCol]).trim() : '';

      purchases.push({
        id: `pur-${date.replace(/-/g, '')}-${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        date,
        invoiceNumber,
        vendorName,
        vendorTin,
        itemName: `${vendorName} Goods / Services`,
        category,
        quantity: 1,
        unitCost: Math.round(subtotal * 100) / 100,
        paymentMethod,
        totalAmount,
        taxRate: 0.15,
        taxAmount: Math.round(taxAmount * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        deductibility,
        deductiblePercentage,
        isReconciledWithBank: paymentMethod === 'bank_transfer',
        notes,
        createdAt: Date.now() - (purchaseRows.length - i) * 60000,
      });
    }
  }

  // 4. Fallback: If neither sales nor purchases matched standard tab names, scan all sheets (e.g. Sheet1)
  if (sales.length === 0 && purchases.length === 0) {
    for (const [sheetName, rawRows] of Object.entries(sheetsMap)) {
      if (!rawRows || rawRows.length < 2) continue;

      let headerIdx = -1;
      let headers: string[] = [];
      for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
        const row = rawRows[i] || [];
        const rowStr = row.join(' ').toLowerCase();
        if (
          rowStr.includes('date') ||
          rowStr.includes('ቀን') ||
          rowStr.includes('amount') ||
          rowStr.includes('total') ||
          rowStr.includes('ድምር') ||
          rowStr.includes('price') ||
          rowStr.includes('ዋጋ') ||
          rowStr.includes('customer') ||
          rowStr.includes('vendor') ||
          rowStr.includes('supplier')
        ) {
          headerIdx = i;
          headers = row.map((h) => String(h || '').trim().toLowerCase());
          break;
        }
      }

      if (headerIdx === -1) {
        headerIdx = 0;
        headers = (rawRows[0] || []).map((h) => String(h || '').trim().toLowerCase());
      }

      const findCol = (regex: RegExp) => headers.findIndex((h) => regex.test(h));
      const dateCol = findCol(/date|ቀን|ዕለት|time|day/i);
      const totalCol = findCol(/gross|total|ድምር|ጠቅላላ|amount|price|ዋጋ|cost/i);
      const customerCol = findCol(/customer|client|buyer|ደንበኛ|name|ስም/i);
      const supplierCol = findCol(/supplier|vendor|አቅራቢ|payee/i);
      const invoiceCol = findCol(/invoice|receipt|ደረሰኝ|fs|ቁጥር|ref|bill|id/i);
      const typeCol = findCol(/type|category|ዘርፍ|kind|ዓይነት/i);

      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;
        const totalAmount =
          totalCol >= 0
            ? parseNumber(row[totalCol])
            : parseNumber(row[1] || row[2] || row[0]);
        if (totalAmount <= 0) continue;

        const rawDate = dateCol >= 0 ? row[dateCol] : row[0];
        const date = parseDateStr(rawDate);
        const rawType = typeCol >= 0 ? String(row[typeCol]).toLowerCase() : '';
        const isPurchaseRow =
          (supplierCol >= 0 && Boolean(row[supplierCol])) ||
          /purchase|expense|cost|ወጪ|ግዢ/i.test(rawType) ||
          /purchase|expense|cost|ወጪ|ግዢ/i.test(sheetName);

        if (isPurchaseRow) {
          const vendorName =
            supplierCol >= 0 && row[supplierCol]
              ? String(row[supplierCol]).trim()
              : 'Supplier';
          const invoiceNum =
            invoiceCol >= 0 && row[invoiceCol]
              ? String(row[invoiceCol]).trim()
              : `INV-${date.replace(/-/g, '')}-${i}`;
          purchases.push({
            id: `pur-${date.replace(/-/g, '')}-${invoiceNum.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
            date,
            invoiceNumber: invoiceNum,
            vendorName,
            vendorTin: '',
            itemName: `${vendorName} Goods / Services`,
            category: 'inventory_cogs',
            quantity: 1,
            unitCost: totalAmount,
            paymentMethod: 'cash',
            totalAmount,
            taxRate: 0.15,
            taxAmount: Math.round(((totalAmount * 0.15) / 1.15) * 100) / 100,
            subtotal: Math.round((totalAmount / 1.15) * 100) / 100,
            deductibility: 'fully_deductible',
            deductiblePercentage: 100,
            isReconciledWithBank: false,
            notes: `Imported from ${sheetName}`,
            createdAt: Date.now() - (rawRows.length - i) * 60000,
          });
        } else {
          const custName =
            customerCol >= 0 && row[customerCol]
              ? String(row[customerCol]).trim()
              : 'Cash Customer';
          const recNum =
            invoiceCol >= 0 && row[invoiceCol]
              ? String(row[invoiceCol]).trim()
              : `REC-${date.replace(/-/g, '')}-${i}`;
          sales.push({
            id: `sale-${date.replace(/-/g, '')}-${recNum.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
            date,
            time: '17:00',
            receiptNumber: recNum,
            customerName: custName,
            items: [
              {
                id: `item-${i}-1`,
                name: `${custName} Merchandise`,
                quantity: 1,
                unitPrice: totalAmount,
              },
            ],
            paymentMethod: 'cash',
            totalAmount,
            cashAmount: totalAmount,
            bankTransferAmount: 0,
            taxAmount: Math.round(((totalAmount * 0.15) / 1.15) * 100) / 100,
            subtotal: Math.round((totalAmount / 1.15) * 100) / 100,
            taxRate: 0.15,
            isReconciledWithBank: false,
            notes: `Imported from ${sheetName}`,
            createdAt: Date.now() - (rawRows.length - i) * 60000,
          });
        }
      }
    }
  }

  // 5. Bank Accounts & Transactions
  const bankMatch = findSheetRows(sheetsMap, [
    'bank accounts & txns',
    'bank accounts',
    'bank',
    'account',
    'accounts',
    'ባንክ',
    'txn',
    'txns',
    'transaction',
    'transactions',
    'statement',
    'deposits',
    'deposit',
    'cbe',
  ]);
  const bankRows = bankMatch.rows;
  const bankAccounts: BankAccount[] = [];
  const bankTransactions: BankTransaction[] = [];

  if (bankRows.length > 0) {
    let mode: 'none' | 'accounts' | 'transactions' = 'none';
    for (let i = 0; i < bankRows.length; i++) {
      const row = bankRows[i];
      if (!row || row.length === 0) continue;
      const firstCell = String(row[0] || '').trim().toUpperCase();

      if (firstCell.includes('BANK ACCOUNTS LIST')) {
        mode = 'accounts';
        continue;
      }
      if (firstCell.includes('BANK TRANSACTIONS REGISTER') || (firstCell.includes('DATE') && String(row[1] || '').includes('Bank Account'))) {
        mode = 'transactions';
        continue;
      }

      if (mode === 'accounts') {
        if (firstCell.includes('ACCOUNT NAME') || firstCell === '') continue;
        const name = String(row[0] || '').trim();
        if (!name) continue;
        const bankName = String(row[1] || 'Commercial Bank of Ethiopia (CBE)').trim();
        const accNum = String(row[2] || '•••• 4821').trim();
        const curr = String(row[3] || fallbackSettings.currency || 'ETB').trim();
        const balance = parseNumber(row[4]);
        const id = `acc-${name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'main'}`;

        bankAccounts.push({
          id,
          name,
          bankName,
          accountNumberMasked: accNum,
          type: name.toLowerCase().includes('reserve') ? 'tax_reserve' : 'checking',
          currentBalance: balance,
          currency: curr,
          color: name.toLowerCase().includes('reserve') ? '#059669' : '#ea580c',
        });
      } else if (mode === 'transactions') {
        if (firstCell.includes('DATE') || firstCell === '') continue;
        const date = parseDateStr(row[0]);
        const targetAccId = String(row[1] || '').trim();
        const desc = String(row[2] || 'Bank Transaction').trim();
        const typeStr = String(row[3] || '').trim().toLowerCase();
        const type: 'credit' | 'debit' =
          typeStr.includes('debit') || typeStr.includes('withdrawal') || typeStr.includes('payment')
            ? 'debit'
            : 'credit';
        const amount = parseNumber(row[4]);
        const category = (String(row[5] || 'other').trim().toLowerCase()) as any;
        const reconciled = String(row[6] || '').trim().toUpperCase() === 'YES';

        if (amount > 0) {
          bankTransactions.push({
            id: `btx-sheet-${date.replace(/-/g, '')}-${i}`,
            bankAccountId: targetAccId || (bankAccounts[0]?.id || 'acc-cbe-main'),
            date,
            description: desc,
            type,
            amount,
            category: category || 'other',
            isReconciled: reconciled,
          });
        }
      }
    }
  }

  // Ensure primary business account exists
  if (bankAccounts.length === 0) {
    bankAccounts.push({
      id: 'acc-cbe-main',
      name: 'Main Business Account',
      bankName: 'Commercial Bank of Ethiopia (CBE)',
      accountNumberMasked: '•••• 4821',
      type: 'checking',
      currentBalance: 0,
      currency: fallbackSettings.currency || 'ETB',
      color: '#ea580c',
    });
  }

  // 6. Daily Cash Reconciliation -> DailyRegisterClose[]
  const cashMatch = findSheetRows(sheetsMap, [
    'daily cash reconciliation',
    'daily cash',
    'cash',
    'reconciliation',
    'ካሽ',
    'audit',
    'close',
    'daily',
    'safe',
    'መዝጊያ',
  ]);
  const cashRows = cashMatch.rows;
  const dailyCloses: DailyRegisterClose[] = [];
  if (cashRows.length > 1) {
    let headerIdx = 0;
    for (let i = 0; i < Math.min(cashRows.length, 5); i++) {
      const rowStr = (cashRows[i] || []).join(' ').toLowerCase();
      if (rowStr.includes('date') && (rowStr.includes('sales') || rowStr.includes('deposit') || rowStr.includes('audit'))) {
        headerIdx = i;
        break;
      }
    }

    for (let i = headerIdx + 1; i < cashRows.length; i++) {
      const row = cashRows[i];
      if (!row || row.length < 2) continue;
      const rawDate = row[0];
      if (!rawDate) continue;
      const date = parseDateStr(rawDate);
      const totalSales = parseNumber(row[2]);
      const cashSales = parseNumber(row[3]);
      const transferSales = parseNumber(row[4]);
      const cashPurchases = parseNumber(row[5]);
      const bankDeposit = parseNumber(row[9]);
      const undeposited = parseNumber(row[11]);

      if (totalSales > 0 || cashSales > 0 || bankDeposit > 0) {
        dailyCloses.push({
          id: `close-${date.replace(/-/g, '')}`,
          date,
          openingFloat: 0,
          cashSales,
          cardSales: 0,
          bankTransferSales: transferSales,
          totalGrossSales: totalSales,
          totalTaxCollected: Math.round(((totalSales * 0.15) / 1.15) * 100) / 100,
          cashPaidOutForPurchases: cashPurchases,
          actualCashCounted: undeposited,
          cashVariance: 0,
          bankDepositAmount: bankDeposit,
          closedBy: 'Google Sheet Import',
          status: 'balanced',
          notes: `Imported from Google Sheet (${date})`,
        });
      }
    }
  }

  return {
    settings: importedSettings,
    sales,
    purchases,
    bankAccounts,
    bankTransactions,
    dailyCloses,
    rawStats: {
      salesCount: sales.length,
      purchasesCount: purchases.length,
      bankAccountsCount: bankAccounts.length,
      bankTransactionsCount: bankTransactions.length,
      dailyClosesCount: dailyCloses.length,
    },
    source: 'appscript',
    tabNames,
    tabSummaries,
    isEmptySpreadsheet: tabSummaries.every((t) => t.isEmpty),
  };
}

/**
 * Fetches and populates financial data from Google Sheets
 */
export async function fetchDataFromGoogleSheets(options: {
  appsScriptUrl?: string;
  spreadsheetIdOrUrl?: string;
  spreadsheetId?: string;
  sheetUrl?: string;
  settings?: Partial<TaxSettings>;
}): Promise<GoogleSheetsImportData> {
  const { appsScriptUrl, spreadsheetIdOrUrl, spreadsheetId, sheetUrl, settings } = options;
  const cleanUrl = (appsScriptUrl || settings?.googleAppsScriptUrl || '').trim();

  let targetSheetId = (
    spreadsheetId ||
    spreadsheetIdOrUrl ||
    sheetUrl ||
    settings?.googleSheetId ||
    ''
  ).trim();

  if (targetSheetId.includes('/spreadsheets/d/')) {
    const match = targetSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) targetSheetId = match[1];
  }

  let sheetsData: Record<string, any[][]> | null = null;
  let detectedTitle = settings?.googleSheetName || 'Google Sheets Ledger';
  let detectedId = targetSheetId;
  let detectedUrl = settings?.googleSheetUrl || '';
  let sourceMethod: 'appscript' | 'public_sheet' = 'appscript';

  // 1. Try Google Apps Script Web App
  if (cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    try {
      const getUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=read${targetSheetId ? `&spreadsheetId=${encodeURIComponent(targetSheetId)}` : ''}&t=${Date.now()}`;
      const res = await fetch(getUrl, { method: 'GET' });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && json.status === 'success' && json.sheets && typeof json.sheets === 'object') {
          sheetsData = json.sheets;
          if (json.spreadsheetTitle) detectedTitle = json.spreadsheetTitle;
          if (json.spreadsheetId) detectedId = json.spreadsheetId;
          if (json.spreadsheetUrl) detectedUrl = json.spreadsheetUrl;
          sourceMethod = 'appscript';
        }
      }
    } catch {}

    // Fallback POST if GET didn't return sheets
    if (!sheetsData) {
      try {
        const postRes = await fetch(cleanUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'read', spreadsheetId: targetSheetId }),
        });
        if (postRes.ok) {
          const json = await postRes.json().catch(() => null);
          if (json && json.status === 'success' && json.sheets && typeof json.sheets === 'object') {
            sheetsData = json.sheets;
            if (json.spreadsheetTitle) detectedTitle = json.spreadsheetTitle;
            if (json.spreadsheetId) detectedId = json.spreadsheetId;
            if (json.spreadsheetUrl) detectedUrl = json.spreadsheetUrl;
            sourceMethod = 'appscript';
          }
        }
      } catch {}
    }
  }

  // 2. Direct Google Sheet Public CSV Fallback (GViz export)
  if (!sheetsData && targetSheetId) {
    try {
      const gvizSheets: Record<string, any[][]> = {};
      const expectedSheets = [
        'Overview & Tax Summary',
        'Sales Register',
        'Purchase Invoices',
        'Bank Accounts & Txns',
        'Daily Cash Reconciliation',
      ];

      let anyFetched = false;
      for (const sheetName of expectedSheets) {
        try {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${targetSheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
          const gRes = await fetch(gvizUrl);
          if (gRes.ok) {
            const csvText = await gRes.text();
            if (csvText && csvText.length > 10 && !csvText.includes('<!DOCTYPE html>')) {
              gvizSheets[sheetName] = parseCsvToRows(csvText);
              anyFetched = true;
            }
          }
        } catch {}
      }

      if (anyFetched) {
        sheetsData = gvizSheets;
        sourceMethod = 'public_sheet';
        detectedId = targetSheetId;
        detectedUrl = `https://docs.google.com/spreadsheets/d/${targetSheetId}/edit`;
      }
    } catch {}
  }

  if (!sheetsData || Object.keys(sheetsData).length === 0) {
    throw new Error(
      'Could not read data from Google Sheet. Please check that your Google Apps Script Web App URL is correct and deployed with "Who has access: Anyone", or verify your spreadsheet link.'
    );
  }

  const fallback = (settings as TaxSettings) || DEFAULT_TAX_SETTINGS;
  const parsed = parseSpreadsheetSheets(sheetsData, fallback);
  parsed.spreadsheetTitle = detectedTitle;
  parsed.spreadsheetId = detectedId;
  parsed.spreadsheetUrl = detectedUrl;
  parsed.sourceSpreadsheetId = detectedId;
  parsed.sourceSpreadsheetTitle = detectedTitle;
  parsed.source = sourceMethod;
  return parsed;
}

