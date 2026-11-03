/**
 * Cloudflare Worker edge API handler for TaxGuard AI services.
 * Seamlessly handles /api/ai/* endpoints when deployed to Cloudflare Workers or Cloudflare Pages.
 */

interface Env {
  GEMINI_API_KEY?: string;
  VITE_GEMINI_API_KEY?: string;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-gemini-api-key',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

async function callGemini(
  apiKey: string,
  options: {
    contents: any;
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: any;
  }
): Promise<string> {
  const models = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ];

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      let formattedContents: any[];
      if (Array.isArray(options.contents)) {
        formattedContents = options.contents;
      } else if (typeof options.contents === 'string') {
        formattedContents = [{ parts: [{ text: options.contents }] }];
      } else if (options.contents && options.contents.parts) {
        formattedContents = [options.contents];
      } else {
        formattedContents = [{ parts: [{ text: JSON.stringify(options.contents) }] }];
      }

      const bodyPayload: any = {
        contents: formattedContents,
      };

      if (options.systemInstruction) {
        bodyPayload.systemInstruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      if (options.responseMimeType || options.responseSchema) {
        bodyPayload.generationConfig = {};
        if (options.responseMimeType) {
          bodyPayload.generationConfig.responseMimeType = options.responseMimeType;
        }
        if (options.responseSchema) {
          bodyPayload.generationConfig.responseSchema = options.responseSchema;
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'aistudio-build-cf-worker',
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as {
          error?: { message?: string; code?: number };
        };
        const msg = errJson.error?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text !== undefined) {
        return text;
      }
      throw new Error('Empty response candidate returned from Gemini model.');
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.toLowerCase();
      if (
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('quota') ||
        msg.includes('high demand') ||
        msg.includes('not found') ||
        msg.includes('unavailable')
      ) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('All Gemini models failed to generate content.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // Route: /api/ai/health
    if (url.pathname === '/api/ai/health' && request.method === 'GET') {
      const apiKey =
        env.GEMINI_API_KEY ||
        env.VITE_GEMINI_API_KEY ||
        request.headers.get('x-gemini-api-key') ||
        '';

      return jsonResponse({
        status: 'ok',
        hasApiKey: Boolean(apiKey),
        model: 'gemini-2.5-flash / gemini-1.5-flash',
        runtime: 'cloudflare-worker',
        instructions: !apiKey
          ? 'Add GEMINI_API_KEY in your Cloudflare dashboard (Worker Settings -> Variables & Secrets).'
          : 'Ready',
      });
    }

    // Only process /api/ai/* endpoints below
    if (url.pathname.startsWith('/api/ai/')) {
      const apiKey =
        env.GEMINI_API_KEY ||
        env.VITE_GEMINI_API_KEY ||
        request.headers.get('x-gemini-api-key') ||
        '';

      if (!apiKey) {
        return errorResponse(
          'GEMINI_API_KEY is not set in Cloudflare Worker environment variables. Please add GEMINI_API_KEY in your Cloudflare dashboard: Worker Settings -> Variables & Secrets.',
          500
        );
      }

      try {
        // 1. /api/ai/scan-receipt
        if (url.pathname === '/api/ai/scan-receipt' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            imageBase64?: string;
            mimeType?: string;
          };
          const { imageBase64, mimeType = 'image/jpeg' } = body;

          if (!imageBase64) {
            return errorResponse('Missing imageBase64 in request body.', 400);
          }

          const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

          const promptText = `You are an expert tax and financial receipt auditor. Carefully examine this receipt photo or scanned invoice.
Extract the relevant business expense information for tax bookkeeping:
- itemName: concise name or summary of what was purchased (e.g. "Store Inventory Supplies", "Office Chair", "Printer Paper", "Commercial Electricity")
- vendorName: supplier or store name (e.g. "Costco", "Staples", "Local Wholesaler")
- vendorTin: tax identification number (TIN) or VAT registration number if visible, otherwise empty string
- invoiceNumber: invoice number or receipt/FS number if visible, otherwise empty string
- date: purchase date in YYYY-MM-DD format if visible, otherwise empty string
- amount: total gross amount paid on the receipt (number)
- taxAmount: sales tax or VAT amount shown on the receipt, otherwise 0
- category: pick the best matching category from this exact list:
  "inventory_cogs", "rent_lease", "utilities", "packaging_supplies", "marketing_ads", "equipment_repairs", "logistics_transport", "professional_fees", "meals_entertainment", "other_operational"
- deductibility: one of "fully_deductible", "partially_deductible", "non_deductible"
- deductiblePercentage: 100 for fully_deductible, 50 for partially_deductible, 0 for non_deductible
- notes: summary of line items, payment method shown, or auditor notes
- confidence: "high", "medium", or "low"`;

          const resultText = await callGemini(apiKey, {
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                { text: promptText },
              ],
            },
            responseMimeType: 'application/json',
          });

          return jsonResponse(JSON.parse(resultText || '{}'));
        }

        // 2. /api/ai/scan-bank-statement
        if (url.pathname === '/api/ai/scan-bank-statement' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            imageBase64?: string;
            mimeType?: string;
            pages?: any[];
          };
          const { imageBase64, mimeType = 'image/jpeg', pages = [] } = body;

          interface PageItem {
            data: string;
            mimeType: string;
            name: string;
          }
          const pageList: PageItem[] = [];

          if (Array.isArray(pages) && pages.length > 0) {
            pages.forEach((p: any, idx: number) => {
              const raw = typeof p === 'string' ? p : p.imageBase64 || p.data || p.dataUrl || '';
              if (!raw) return;

              let detectedMime = (typeof p === 'object' && p.mimeType) || 'image/jpeg';
              if (raw.startsWith('data:application/pdf')) detectedMime = 'application/pdf';
              else if (raw.startsWith('data:image/png')) detectedMime = 'image/png';
              else if (raw.startsWith('data:image/webp')) detectedMime = 'image/webp';

              const clean = raw.replace(/^data:[^;]+;base64,/, '');
              pageList.push({
                data: clean,
                mimeType: detectedMime,
                name: (typeof p === 'object' && p.name) || `Page ${idx + 1}`,
              });
            });
          } else if (imageBase64) {
            let detectedMime = mimeType || 'image/jpeg';
            if (imageBase64.startsWith('data:application/pdf')) detectedMime = 'application/pdf';
            else if (imageBase64.startsWith('data:image/png')) detectedMime = 'image/png';
            else if (imageBase64.startsWith('data:image/webp')) detectedMime = 'image/webp';

            const clean = imageBase64.replace(/^data:[^;]+;base64,/, '');
            pageList.push({
              data: clean,
              mimeType: detectedMime,
              name: 'Page 1',
            });
          }

          if (pageList.length === 0) {
            return errorResponse('No statement images or pages provided for scanning.', 400);
          }

          const promptText = `You are a certified forensic bank auditor and expert Ethiopian & international banking document specialist.
Exhaustively extract every single bank transaction row across these ${pageList.length} pages.
Do not omit any transaction or micro-fee.
Return a structured JSON object with bankName, accountNumber, statementPeriod, statementDate, openingBalance, closingBalance, totalCredits, totalDebits, totalTransactionsCount, isReconciledCheck, transactions (array of { pageNumber, date, description, type, amount, category, reference, balance }), and notes.`;

          const parts: any[] = [
            ...pageList.map((p) => ({
              inlineData: {
                mimeType: p.mimeType,
                data: p.data,
              },
            })),
            { text: promptText },
          ];

          const resultText = await callGemini(apiKey, {
            contents: { parts },
            responseMimeType: 'application/json',
          });

          const extracted = JSON.parse(resultText || '{}');
          extracted.pageCount = pageList.length;
          if (!extracted.totalTransactionsCount && Array.isArray(extracted.transactions)) {
            extracted.totalTransactionsCount = extracted.transactions.length;
          }
          return jsonResponse(extracted);
        }

        // 3. /api/ai/parse-sale
        if (url.pathname === '/api/ai/parse-sale' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as { text?: string };
          const { text } = body;
          if (!text || !text.trim()) {
            return errorResponse('Missing text in request body.', 400);
          }

          const prompt = `Parse this natural language sales description, dictated cash register close, or receipt notes into structured daily sales bookkeeping fields:
"${text}"

Extract JSON with totalAmount (number), cashAmount (number), bankTransferAmount (number), date (YYYY-MM-DD or empty), receiptRange (string or empty), and notes (summary).`;

          const resultText = await callGemini(apiKey, {
            contents: prompt,
            responseMimeType: 'application/json',
          });

          return jsonResponse(JSON.parse(resultText || '{}'));
        }

        // 4. /api/ai/audit-advisor
        if (url.pathname === '/api/ai/audit-advisor' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            prompt?: string;
            businessContext?: Record<string, any>;
          };
          const { prompt, businessContext } = body;

          if (!prompt || !prompt.trim()) {
            return errorResponse('Missing prompt in request body.', 400);
          }

          const systemInstruction = `You are TaxGuard AI, an elite Ethiopian tax auditor, Certified Public Accountant (CPA), and forensic tax specialist expert in the Ethiopian Ministry of Revenues (MoR) / ERCA Tax Audit Manual (2019 / Bahir Dar University AIS reference).
Your mission is to provide authoritative, audit-proof guidance for business owners and accountants operating in Ethiopia and internationally.
Ground your analysis and advice in the Ethiopian legal framework:
1. Federal Tax Administration Proclamation No. 983/2016
2. Federal Income Tax Proclamation No. 979/2016
3. Value Added Tax (VAT) Proclamation No. 285/2002 & Amendments
4. MoR Indirect Audit Methodologies (Chapter 6: Bank Deposit Analysis, Markup & Gross Profit Margin Test, Cash Flow Test).
Always reference specific proclamations, articles, or MoR manual chapters when advising. Format responses with clean Markdown, bold citations, bullet points, and actionable next steps.`;

          const contents = `--- CURRENT BUSINESS BOOKKEEPING CONTEXT ---
${JSON.stringify(businessContext || {}, null, 2)}
-------------------------------------------

USER INQUIRY:
${prompt}`;

          const resultText = await callGemini(apiKey, {
            contents,
            systemInstruction,
          });

          return jsonResponse({ advice: resultText || 'No response generated.' });
        }

        // 5. /api/ai/deep-audit
        if (url.pathname === '/api/ai/deep-audit' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            businessContext?: Record<string, any>;
          };
          const { businessContext } = body;

          const prompt = `You are an Ethiopian Ministry of Revenues (MoR) Senior Tax Auditor conducting an official pre-audit examination of this taxpayer's books under the MoR Tax Audit Manual (2019 / Bahir Dar University AIS curriculum), Proclamation No. 983/2016, and Proclamation No. 979/2016:
${JSON.stringify(businessContext || {}, null, 2)}

Carefully evaluate:
1. Sales completeness, ESRM/FRC cash register receipt numbering, and 3-way bank deposit correlation.
2. Purchase deductibility under Proclamation 979/2016 Art. 22-27 and Input VAT credit eligibility under VAT Proclamation 285/2002 Art. 21.
3. Indirect Audit Risk assessment under Chapter 6: Bank Deposit Analysis variance and Gross Margin / Markup consistency.
4. Withholding tax compliance (2% withholding on purchases > ETB 10,000).
5. Potential statutory penalty exposure under Proclamation 983/2016 (Articles 109, 110, 113) and late interest (Article 44).

Return structured JSON with score (0-100), riskLevel ("LOW" | "MODERATE" | "HIGH" | "CRITICAL"), summary, findings (array of { title, severity, description, recommendation }), actionItems (array of strings), and taxSavingTips (array of strings).`;

          const resultText = await callGemini(apiKey, {
            contents: prompt,
            responseMimeType: 'application/json',
          });

          return jsonResponse(JSON.parse(resultText || '{}'));
        }

        return errorResponse(`Unknown AI endpoint: ${url.pathname}`, 404);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResponse(message || 'Failed to process AI request.', 500);
      }
    }

    // Default static assets handler for Cloudflare Workers / Pages
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    // Direct fetch fallback
    return fetch(request);
  },
};
