import { ExpenseCategory, TaxDeductibility } from '../types';

export interface ExtractedReceiptData {
  itemName: string;
  vendorName: string;
  vendorTin?: string;
  invoiceNumber?: string;
  date?: string;
  amount: number;
  taxAmount: number;
  category: ExpenseCategory;
  deductibility: TaxDeductibility;
  deductiblePercentage: number;
  notes?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ParsedSaleData {
  totalAmount: number;
  cashAmount: number;
  bankTransferAmount: number;
  date?: string;
  receiptRange?: string;
  notes?: string;
}

export interface AuditFinding {
  title: string;
  severity: 'info' | 'warning' | 'danger';
  description: string;
  recommendation: string;
}

export interface DeepAuditReport {
  score: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  summary: string;
  findings: AuditFinding[];
  actionItems: string[];
  taxSavingTips?: string[];
}

export interface ScannedBankStatementTransaction {
  pageNumber?: number;
  date: string;
  description: string;
  reason?: string;
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
  reference?: string;
  balance?: number;
}

export interface ScannedBankStatementReport {
  bankName?: string;
  accountNumber?: string;
  statementPeriod?: string;
  statementDate?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalCredits?: number;
  totalDebits?: number;
  totalTransactionsCount?: number;
  isReconciledCheck?: boolean;
  transactions: ScannedBankStatementTransaction[];
  notes?: string;
  pageCount?: number;
}

export type ExtractedBankStatementData = ScannedBankStatementReport;

export interface BankStatementPageInput {
  id?: string;
  data?: string; // base64 string
  imageBase64?: string;
  mimeType: string;
  name?: string;
}

export type BankStatementPageItem = BankStatementPageInput;

async function parseApiResponse<T>(response: Response, actionName: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(
      `${actionName} failed: The backend server returned HTML instead of JSON. Ensure your Cloudflare Worker or backend API proxy is active and GEMINI_API_KEY is configured in your deployment settings.`
    );
  }

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `${actionName} failed (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Scan & Extract Details from a Receipt Photo or Scanned Invoice
 */
export async function scanReceiptWithAI(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ExtractedReceiptData> {
  const response = await fetch('/api/ai/scan-receipt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  return parseApiResponse<ExtractedReceiptData>(response, 'Receipt scan');
}

/**
 * Parse Natural Language Sales Notes or Dictated Register Close
 */
export async function parseSaleWithAI(text: string): Promise<ParsedSaleData> {
  const response = await fetch('/api/ai/parse-sale', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  return parseApiResponse<ParsedSaleData>(response, 'Sales parsing');
}

/**
 * Query the AI Tax & Audit Advisor with Live Business Context
 */
export async function askTaxAdvisorAI(
  prompt: string,
  businessContext: Record<string, any>
): Promise<string> {
  const response = await fetch('/api/ai/audit-advisor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, businessContext }),
  });

  const data = await parseApiResponse<{ advice: string }>(response, 'Tax advisor');
  return data.advice;
}

/**
 * Run a Deep Forensic Tax Audit Analysis of Business Books
 */
export async function runDeepAuditWithAI(
  businessContext: Record<string, any>
): Promise<DeepAuditReport> {
  const response = await fetch('/api/ai/deep-audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ businessContext }),
  });

  return parseApiResponse<DeepAuditReport>(response, 'Deep audit examination');
}

/**
 * Scan & Extract Transactions from Multi-Page Bank Statements (CBE, Awash, Telebirr, etc.)
 */
export async function scanBankStatementWithAI(
  input: string | BankStatementPageInput[],
  mimeType: string = 'image/jpeg'
): Promise<ScannedBankStatementReport> {
  let bodyPayload: Record<string, any> = {};

  if (Array.isArray(input)) {
    const pages = input.map((item, idx) => {
      const raw = item.data || item.imageBase64 || '';
      const clean = raw.replace(/^data:[^;]+;base64,/, '');
      return {
        imageBase64: clean,
        name: item.name || `Page ${idx + 1}`,
        mimeType: item.mimeType || 'image/jpeg',
      };
    });
    bodyPayload = { pages };
  } else {
    bodyPayload = { imageBase64: input, mimeType };
  }

  const response = await fetch('/api/ai/scan-bank-statement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  return parseApiResponse<ScannedBankStatementReport>(response, 'Bank statement scan');
}
