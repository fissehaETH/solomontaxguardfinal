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

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Receipt scan failed (HTTP ${response.status})`);
  }

  return response.json();
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

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Sales parsing failed (HTTP ${response.status})`);
  }

  return response.json();
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

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Tax advisor request failed (HTTP ${response.status})`);
  }

  const data = await response.json();
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

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Deep audit review failed (HTTP ${response.status})`);
  }

  return response.json();
}

export interface ScannedBankStatementTransaction {
  pageNumber?: number;
  date: string;
  description: string;
  type: 'credit' | 'debit';
  category:
    | 'sale_deposit'
    | 'sales_cash_deposit'
    | 'cash_withdraw'
    | 'card_settlement'
    | 'vendor_payout'
    | 'tax_payment'
    | 'bank_fee'
    | 'transfer'
    | 'other';
  reference?: string;
  balance?: number;
}

export interface BankStatementPageItem {
  id?: string;
  dataUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  name?: string;
}

export interface ExtractedBankStatementData {
  bankName: string;
  accountNumber?: string;
  statementPeriod?: string;
  statementDate?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalCredits?: number;
  totalDebits?: number;
  totalTransactionsCount?: number;
  isReconciledCheck?: boolean;
  pageCount?: number;
  transactions: ScannedBankStatementTransaction[];
  notes?: string;
}

/**
 * Scan & Extract Transactions from Multi-Page Bank Statements (CBE, Awash, Telebirr, etc.)
 * Supports single image/document or multiple page images scanned in order.
 */
export async function scanBankStatementWithAI(
  input: string | BankStatementPageItem[] | string[],
  mimeType: string = 'image/jpeg'
): Promise<ExtractedBankStatementData> {
  let bodyPayload: any;

  if (Array.isArray(input)) {
    const pages = input.map((item, idx) => {
      if (typeof item === 'string') {
        return {
          imageBase64: item,
          name: `Page ${idx + 1}`,
          mimeType: item.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg',
        };
      }
      return {
        imageBase64: item.imageBase64 || item.dataUrl || '',
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

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Bank statement scan failed (HTTP ${response.status})`);
  }

  return response.json();
}

