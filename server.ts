import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

// Ensure HMR is disabled in cloud iframe environment per runtime specs
process.env.DISABLE_HMR = 'true';

const isProduction = process.env.NODE_ENV === 'production';
// Dev server and reverse proxy target must strictly run on port 3000
const PORT = 3000;

// Initialize Google GenAI with required User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Resilient 100% Free-Tier Content Generator
 * Strictly uses Google's standard free-tier models: gemini-3.8-flash and gemini-3.1-flash-lite.
 * Automatically falls back to gemini-3.1-flash-lite if temporary 503 high-demand
 * or free-tier rate limits (429 / RESOURCE_EXHAUSTED) occur.
 */
async function generateWithFallback(options: {
  contents: any;
  config?: any;
}) {
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        ...options,
        model,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      if (
        msg.includes('503') ||
        msg.includes('high demand') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('quota')
      ) {
        console.warn(
          `Free-tier model ${model} reached rate limit or high demand; falling back to next free-tier model...`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();

  // Allow up to 50MB for multi-page base64 statements, receipts & documents
  app.use(express.json({ limit: '50mb' }));

  // Health check endpoint
  app.get('/api/ai/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      model: 'gemini-3.8-flash / gemini-3.1-flash-lite',
    });
  });

  // 1. OCR & Extraction Endpoint for Receipt Images / Scanned Invoices
  app.post('/api/ai/scan-receipt', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'Missing imageBase64 in request body.' });
      }

      // Strip potential data URL prefix
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

      const response = await generateWithFallback({
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: `You are an expert tax and financial receipt auditor. Carefully examine this receipt photo or scanned invoice.
Extract the relevant business expense information for tax bookkeeping:
- itemName: concise name or summary of what was purchased (e.g. "Store Inventory Supplies", "Office Chair", "Printer Paper", "Commercial Electricity")
- vendorName: supplier or store name (e.g. "Costco", "Staples", "Local Wholesaler")
- vendorTin: tax identification number (TIN) or VAT registration number if visible, otherwise empty string
- invoiceNumber: invoice number or receipt/FS number if visible, otherwise empty string
- date: purchase date in YYYY-MM-DD format if visible, otherwise empty string
- amount: total gross amount paid on the receipt (number)
- taxAmount: sales tax or VAT amount shown on the receipt, otherwise 0
- category: pick the best matching category from this exact list:
  "inventory_cogs" (goods for resale, stock)
  "rent_lease" (store or office rent)
  "utilities" (electricity, water, internet, phone)
  "packaging_supplies" (bags, boxes, tape, labels)
  "marketing_ads" (advertising, flyers, promos)
  "equipment_repairs" (hardware, repairs, maintenance)
  "logistics_transport" (fuel, delivery, freight)
  "professional_fees" (accounting, legal, consulting)
  "meals_entertainment" (business meals)
  "other_operational" (miscellaneous expenses)
- deductibility: one of "fully_deductible", "partially_deductible", "non_deductible" (standard business expenses are fully_deductible; meals are partially_deductible; personal items are non_deductible)
- deductiblePercentage: 100 for fully_deductible, 50 for partially_deductible, 0 for non_deductible
- notes: summary of line items, payment method shown, or auditor notes
- confidence: "high", "medium", or "low"`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              itemName: { type: Type.STRING },
              vendorName: { type: Type.STRING },
              vendorTin: { type: Type.STRING },
              invoiceNumber: { type: Type.STRING },
              date: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              taxAmount: { type: Type.NUMBER },
              category: { type: Type.STRING },
              deductibility: { type: Type.STRING },
              deductiblePercentage: { type: Type.NUMBER },
              notes: { type: Type.STRING },
              confidence: { type: Type.STRING },
            },
            required: ['itemName', 'vendorName', 'amount', 'category'],
          },
        },
      });

      const extracted = JSON.parse(response.text || '{}');
      res.json(extracted);
    } catch (error: any) {
      console.error('Error in /api/ai/scan-receipt:', error);
      res.status(500).json({
        error: error.message || 'Failed to analyze receipt image with AI.',
      });
    }
  });

  // 1b. Scan & Extract Transactions from Multi-Page Bank Statements (CBE, Awash, Telebirr, etc.)
  app.post('/api/ai/scan-bank-statement', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', pages = [] } = req.body;

      // Normalize pages list to support both multi-page array and single image
      interface NormalizedPage {
        data: string;
        mimeType: string;
        name: string;
      }
      const pageList: NormalizedPage[] = [];

      if (Array.isArray(pages) && pages.length > 0) {
        pages.forEach((p: any, idx: number) => {
          const raw = typeof p === 'string' ? p : p.imageBase64 || p.data || p.dataUrl || '';
          if (!raw) return;

          let detectedMime = (typeof p === 'object' && p.mimeType) || 'image/jpeg';
          if (raw.startsWith('data:application/pdf')) {
            detectedMime = 'application/pdf';
          } else if (raw.startsWith('data:image/png')) {
            detectedMime = 'image/png';
          } else if (raw.startsWith('data:image/webp')) {
            detectedMime = 'image/webp';
          }

          const clean = raw.replace(/^data:[^;]+;base64,/, '');
          pageList.push({
            data: clean,
            mimeType: detectedMime,
            name: (typeof p === 'object' && p.name) || `Page ${idx + 1}`,
          });
        });
      } else if (imageBase64) {
        let detectedMime = mimeType || 'image/jpeg';
        if (imageBase64.startsWith('data:application/pdf')) {
          detectedMime = 'application/pdf';
        } else if (imageBase64.startsWith('data:image/png')) {
          detectedMime = 'image/png';
        } else if (imageBase64.startsWith('data:image/webp')) {
          detectedMime = 'image/webp';
        }
        const clean = imageBase64.replace(/^data:[^;]+;base64,/, '');
        pageList.push({
          data: clean,
          mimeType: detectedMime,
          name: 'Page 1',
        });
      }

      if (pageList.length === 0) {
        return res.status(400).json({ error: 'No statement images or pages provided for scanning.' });
      }

      const promptText = `You are a certified forensic bank auditor and expert Ethiopian & international banking document specialist.

MANDATORY MISSION CRITICAL OBJECTIVE: EXHAUSTIVE EXTRACTION OF EACH AND EVERY BANK TRANSACTION (100% COMPLETE COVERAGE).
The user has provided ${pageList.length} sequential page(s) (${pageList.map((p, i) => `Page ${i + 1}: ${p.name}`).join(', ')}) of a bank statement.

STRICT INSTRUCTIONS FOR 100% EXHAUSTIVE ROW-BY-ROW EXTRACTION:
1. ZERO-OMISSION RULE:
   - You MUST extract EACH AND EVERY SINGLE bank transaction listed on these statement pages.
   - You must NOT sample, truncate with ellipsis, group, or omit ANY transaction row.
   - If Page 1 has 20 transactions and Page 2 has 35 transactions, your output array MUST contain all 55 individual transactions.
   - Process every single row sequentially, starting from the first transaction line at the top of Page 1 down through the very last transaction line on the final page.

2. EXTRACT ALL TRANSACTION TYPES - NO ENTRY IS TOO SMALL:
   - All customer deposits, mobile transfers (CBE Birr, Telebirr, Awash Birr), wire transfers (RTGS, ACH, SWIFT), cash deposits, and card settlements.
   - All vendor payouts, supplier checks, debit card purchases, and cash withdrawals.
   - ALL bank charges and micro-fees without exception: monthly maintenance/ledger fees, SMS alert notification charges, RTGS fees, cheque clearing charges, ATM transaction fees, and VAT on bank services.
   - Any interest credits, tax withholdings, adjustments, or reversals.
   - NOTE: Only omit non-transaction rows such as column header repetitions or "Balance Brought Forward (B/F)" / "Balance Carried Forward (C/F)" summaries. Every actual balance-moving debit or credit entry MUST be extracted.

3. REQUIRED DATA FIELDS FOR EACH TRANSACTION:
   - pageNumber: 1-based page number where this specific transaction was found (e.g. 1, 2, 3...)
   - date: transaction date in YYYY-MM-DD format (infer proper year if only DD/MM or Ethiopian EC calendar month is printed)
   - description: full transaction narrative, payee name, counterparty, or reference memo as printed
   - type: "credit" (money in, deposits, transfers in) or "debit" (money out, payments, fees, withdrawals)
   - amount: positive numeric value of the transaction
   - category: select the most accurate category:
     * "sale_deposit" (customer sales deposit, retail transfer, cashier deposit)
     * "card_settlement" (POS terminal or card settlement)
     * "vendor_payout" (supplier payment, invoice purchase, check payment)
     * "tax_payment" (Ministry of Revenues, VAT payment, customs duty)
     * "bank_fee" (bank service fee, SMS alert charge, RTGS fee, ledger fee)
     * "transfer" (internal transfer, tax reserve transfer)
     * "other" (miscellaneous)
   - reference: transaction reference number, trace ID, FT reference, voucher number, or check number
   - balance: running balance after this transaction occurred if visible on the row

4. STATEMENT AUDIT & RECONCILIATION TOTALS:
   - bankName: full name of financial institution (e.g. "Commercial Bank of Ethiopia (CBE)", "Awash Bank", "Dashen Bank", "Telebirr")
   - accountNumber: bank account number or masked identifier
   - statementPeriod: date range or statement billing cycle
   - statementDate: statement issue date or latest transaction date
   - openingBalance: beginning balance on Page 1 before transactions
   - closingBalance: ending balance on final page after all transactions
   - totalCredits: exact sum of all credit transactions extracted across all pages
   - totalDebits: exact sum of all debit transactions extracted across all pages
   - totalTransactionsCount: the exact integer count of all transactions extracted in the 'transactions' array
   - isReconciledCheck: true if (openingBalance + totalCredits - totalDebits) approximately equals closingBalance (within 1.5 units)
   - notes: summary of statement findings, reconciliation results, and confirmation of exhaustive line-by-line coverage`;

      const parts: any[] = [
        ...pageList.map((p) => ({
          inlineData: {
            mimeType: p.mimeType,
            data: p.data,
          },
        })),
        { text: promptText },
      ];

      const response = await generateWithFallback({
        contents: { parts },
        config: {
          maxOutputTokens: 16384,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bankName: { type: Type.STRING },
              accountNumber: { type: Type.STRING },
              statementPeriod: { type: Type.STRING },
              statementDate: { type: Type.STRING },
              openingBalance: { type: Type.NUMBER },
              closingBalance: { type: Type.NUMBER },
              totalCredits: { type: Type.NUMBER },
              totalDebits: { type: Type.NUMBER },
              totalTransactionsCount: { type: Type.INTEGER },
              isReconciledCheck: { type: Type.BOOLEAN },
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pageNumber: { type: Type.INTEGER },
                    date: { type: Type.STRING },
                    description: { type: Type.STRING },
                    type: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                    reference: { type: Type.STRING },
                    balance: { type: Type.NUMBER },
                  },
                  required: ['date', 'description', 'type', 'amount'],
                },
              },
              notes: { type: Type.STRING },
            },
            required: ['bankName', 'transactions'],
          },
        },
      });

      const extracted = JSON.parse(response.text || '{}');
      extracted.pageCount = pageList.length;
      if (!extracted.totalTransactionsCount && Array.isArray(extracted.transactions)) {
        extracted.totalTransactionsCount = extracted.transactions.length;
      }
      res.json(extracted);
    } catch (error: any) {
      console.error('Error in /api/ai/scan-bank-statement:', error);
      res.status(500).json({
        error: error.message || 'Failed to analyze bank statement with AI.',
      });
    }
  });

  // 2. Natural Language Sales & Register Voice / Text Parser
  app.post('/api/ai/parse-sale', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Missing text in request body.' });
      }

      const response = await generateWithFallback({
        contents: `Parse this natural language sales description, dictated cash register close, or receipt notes into structured daily sales bookkeeping fields:
"${text}"

Extract:
- totalAmount: the total gross revenue (number)
- cashAmount: the portion received in cash (number). If no split specified, default to totalAmount.
- bankTransferAmount: the portion received via bank transfer, card, POS, or digital wallet (number).
- date: YYYY-MM-DD if a specific date was mentioned, otherwise empty string
- receiptRange: receipt numbers or sequence mentioned (e.g. "DS-101 to DS-130"), or empty string
- notes: concise summary of the transaction or register day`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              totalAmount: { type: Type.NUMBER },
              cashAmount: { type: Type.NUMBER },
              bankTransferAmount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              receiptRange: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
            required: ['totalAmount', 'cashAmount', 'bankTransferAmount'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (error: any) {
      console.error('Error in /api/ai/parse-sale:', error);
      res.status(500).json({
        error: error.message || 'Failed to parse sales notes with AI.',
      });
    }
  });

  // 3. Interactive AI Tax & Audit Copilot
  app.post('/api/ai/audit-advisor', async (req, res) => {
    try {
      const { prompt, businessContext } = req.body;
      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Missing prompt in request body.' });
      }

      const systemInstruction = `You are TaxGuard AI, an elite Ethiopian tax auditor, Certified Public Accountant (CPA), and forensic tax specialist expert in the Ethiopian Ministry of Revenues (MoR) / ERCA Tax Audit Manual (2019 / Bahir Dar University AIS reference).
Your mission is to provide authoritative, audit-proof guidance for business owners and accountants operating in Ethiopia and internationally.
Ground your analysis and advice in the Ethiopian legal framework:
1. Federal Tax Administration Proclamation No. 983/2016 (Articles 17 for 6-year records retention, 108 for late filing, 109 for tax understatement penalties 10%-50%, 110 for record-keeping violations 20%, 113 for ESRM/FRC receipt non-issuance, Article 44 for late interest at NBE rate + 2%).
2. Federal Income Tax Proclamation No. 979/2016 (Articles 22-27 for deductible vs disallowed business expenses, 10% entertainment/representation ceiling, thin capitalization & interest ceiling at NBE + 2%, 100% disallowance of government fines and penalties, Article 92 for 2% withholding agent obligations on purchases over ETB 10,000).
3. Value Added Tax (VAT) Proclamation No. 285/2002 & Amendments (15% standard rate, Article 21 input tax rules: requires official VAT invoice with supplier & buyer TIN, strict 6-month claim window, disallowance for passenger vehicles and hospitality).
4. MoR Indirect Audit Methodologies (Chapter 6 of the Tax Audit Manual: Bank Deposit Analysis, Markup & Gross Profit Margin Test, Source & Application of Funds / Cash Flow Test).
5. Always reference specific proclamations, articles, or MoR manual chapters when advising. Format responses with clean Markdown, bold citations, bullet points, and actionable next steps.`;

      const contents = `--- CURRENT BUSINESS BOOKKEEPING CONTEXT ---
${JSON.stringify(businessContext || {}, null, 2)}
-------------------------------------------

USER INQUIRY:
${prompt}`;

      const response = await generateWithFallback({
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });

      res.json({ advice: response.text || 'No response generated.' });
    } catch (error: any) {
      console.error('Error in /api/ai/audit-advisor:', error);
      res.status(500).json({
        error: error.message || 'Failed to get AI tax advisory advice.',
      });
    }
  });

  // 4. In-Depth AI Audit & Compliance Examination (MoR 2019 Manual Compliant)
  app.post('/api/ai/deep-audit', async (req, res) => {
    try {
      const { businessContext } = req.body;

      const response = await generateWithFallback({
        contents: `You are an Ethiopian Ministry of Revenues (MoR) Senior Tax Auditor conducting an official pre-audit examination of this taxpayer's books under the MoR Tax Audit Manual (2019 / Bahir Dar University AIS curriculum), Proclamation No. 983/2016, and Proclamation No. 979/2016:
${JSON.stringify(businessContext || {}, null, 2)}

Carefully evaluate according to MoR Audit Manual procedures:
1. Sales completeness, ESRM/FRC cash register receipt numbering, and 3-way bank deposit correlation (Chapter 4 & 5).
2. Purchase deductibility under Proclamation 979/2016 Art. 22-27 and Input VAT credit eligibility under VAT Proclamation 285/2002 Art. 21 (valid supplier TIN, missing receipt images, non-deductible items).
3. Indirect Audit Risk assessment under Chapter 6: Bank Deposit Analysis variance and Gross Margin / Markup consistency against trade benchmarks.
4. Withholding tax compliance (2% withholding on purchases > ETB 10,000).
5. Potential statutory penalty exposure under Proclamation 983/2016 (Articles 109, 110, 113) and late interest (Article 44).

Return structured JSON with:
- score: overall MoR audit-readiness score from 0 to 100
- riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"
- summary: 2-3 sentence executive assessment citing Ethiopian audit compliance status
- findings: array of { title: string, severity: "info" | "warning" | "danger", description: string, recommendation: string } with legal citations (e.g. Proc. 983/2016, Proc. 979/2016, VAT Art. 21)
- actionItems: array of prioritized next steps
- taxSavingTips: array of legitimate deduction opportunities and risk mitigation steps`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              riskLevel: { type: Type.STRING },
              summary: { type: Type.STRING },
              findings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    severity: { type: Type.STRING },
                    description: { type: Type.STRING },
                    recommendation: { type: Type.STRING },
                  },
                  required: ['title', 'severity', 'description', 'recommendation'],
                },
              },
              actionItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              taxSavingTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['score', 'riskLevel', 'summary', 'findings', 'actionItems'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (error: any) {
      console.error('Error in /api/ai/deep-audit:', error);
      res.status(500).json({
        error: error.message || 'Failed to complete AI deep audit examination.',
      });
    }
  });

  // Vite Integration (Dev Middleware vs Production Static Serving)
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      // Fallback if dist doesn't exist yet
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TaxGuard Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
