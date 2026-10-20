import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Send,
  Loader2,
  Lightbulb,
  X,
  RefreshCw,
  FileText,
  DollarSign,
} from 'lucide-react';
import {
  SaleTransaction,
  PurchaseItem,
  BankAccount,
  BankTransaction,
  TaxSettings,
} from '../../types';
import {
  askTaxAdvisorAI,
  runDeepAuditWithAI,
  DeepAuditReport,
} from '../../utils/aiApi';
import { formatCurrency } from '../../utils/formatters';

interface TaxAICopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: SaleTransaction[];
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  settings: TaxSettings;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const TaxAICopilotModal: React.FC<TaxAICopilotModalProps> = ({
  isOpen,
  onClose,
  sales,
  purchases,
  bankAccounts,
  bankTransactions,
  settings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'audit' | 'chat'>('audit');

  // Deep Audit State
  const [auditReport, setAuditReport] = useState<DeepAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Chat Advisor State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I am your **TaxGuard AI Auditor & CPA Advisor** (powered by the standard Free Edition of Gemini 3.8 Flash).

I have direct visibility into your current sales, purchases, bank records, and tax settings with zero API subscription costs. How can I help you ensure 100% audit-proof books today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  if (!isOpen) return null;

  // Compile live business context for AI
  const totalSales = sales.reduce((acc, s) => acc + s.totalAmount, 0);
  const cashSales = sales.reduce((acc, s) => acc + (s.cashAmount ?? (s.paymentMethod === 'cash' ? s.totalAmount : 0)), 0);
  const transferSales = sales.reduce((acc, s) => acc + (s.bankTransferAmount ?? (s.paymentMethod === 'bank_transfer' ? s.totalAmount : 0)), 0);
  const totalPurchases = purchases.reduce((acc, p) => acc + p.totalAmount, 0);
  const deductiblePurchases = purchases.reduce(
    (acc, p) => acc + p.subtotal * (p.deductiblePercentage / 100),
    0
  );
  const purchasesWithReceipt = purchases.filter((p) => Boolean(p.receiptImage)).length;
  const purchasesWithoutReceipt = purchases.length - purchasesWithReceipt;
  const unreconciledPurchases = purchases.filter(
    (p) => p.paymentMethod !== 'cash' && !p.isReconciledWithBank
  ).length;

  const businessContext = {
    summary: {
      totalSalesRevenue: Number(totalSales.toFixed(2)),
      cashSalesPortion: Number(cashSales.toFixed(2)),
      bankTransferSalesPortion: Number(transferSales.toFixed(2)),
      totalPurchasesCost: Number(totalPurchases.toFixed(2)),
      totalDeductibleExpenses: Number(deductiblePurchases.toFixed(2)),
      salesRecordCount: sales.length,
      purchaseRecordCount: purchases.length,
      purchasesWithAttachedReceipts: purchasesWithReceipt,
      purchasesMissingReceipts: purchasesWithoutReceipt,
      unreconciledBankPurchases: unreconciledPurchases,
      bankAccountCount: bankAccounts.length,
      bankAccounts: bankAccounts.map((b) => ({
        name: b.name,
        type: b.type,
        currentBalance: b.currentBalance,
      })),
      taxSettings: {
        currency: settings.currency,
        salesTaxRate: settings.defaultSalesTaxRate,
        corporateTaxRate: settings.corporateTaxRate,
      },
    },
    sampleRecentPurchases: purchases.slice(0, 10).map((p) => ({
      date: p.date,
      vendor: p.vendorName,
      item: p.itemName,
      amount: p.totalAmount,
      category: p.category,
      deductiblePercent: p.deductiblePercentage,
      hasReceipt: Boolean(p.receiptImage),
    })),
  };

  const handleRunDeepAudit = async () => {
    setIsAuditing(true);
    setAuditError(null);
    try {
      const report = await runDeepAuditWithAI(businessContext);
      setAuditReport(report);
    } catch (err: any) {
      setAuditError(err.message || 'Failed to complete AI audit review');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputPrompt;
    if (!promptToSend.trim() || isChatting) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: promptToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputPrompt('');
    setIsChatting(true);

    try {
      const reply = await askTaxAdvisorAI(promptToSend, businessContext);
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: `⚠️ **Advisory Error**: ${err.message || 'Unable to connect to Gemini AI. Please check server.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatting(false);
    }
  };

  const promptSuggestions = [
    'Audit my books against the MoR 2019 Tax Audit Manual',
    'Run Bank Deposit Analysis indirect audit test (Ch. 6)',
    'Check single cash purchases exceeding ETB 50k limit',
    'Check 15% VAT Art. 21 Input tax eligibility & 6-month rule',
    'Review 2% Withholding compliance on purchases over ETB 10k',
    'Calculate potential penalties under Proclamation 983/2016',
    'What documentation is required for Category A/B audit?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-gradient-to-r from-orange-50/80 via-white to-amber-50/80 dark:from-stone-900 dark:via-stone-900 dark:to-orange-950/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-700 text-white flex items-center justify-center shadow-md shadow-orange-700/20">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-900 dark:text-stone-100 text-base">
                  TaxGuard AI Audit &amp; Tax Copilot
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Free AI Edition &middot; MoR 2019
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                MoR Audit Manual (2019 / Bahir Dar AIS) &middot; Proclamations 983/2016 &amp; 979/2016
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close AI Copilot"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 px-5 pt-2 gap-2 shrink-0">
          <button
            onClick={() => setActiveSubTab('audit')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'audit'
                ? 'border-orange-700 text-orange-700 dark:text-orange-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Deep Pre-Audit Examination
          </button>
          <button
            onClick={() => setActiveSubTab('chat')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'chat'
                ? 'border-orange-700 text-orange-700 dark:text-orange-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Ask AI Tax Advisor
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 text-stone-800 dark:text-stone-200 space-y-4">
          {activeSubTab === 'audit' ? (
            <div className="space-y-4">
              {/* Call to action if not audited yet */}
              {!auditReport && !isAuditing && (
                <div className="text-center py-8 px-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                      Ready for AI Forensic Audit Examination
                    </h4>
                    <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto mt-1">
                      TaxGuard AI will review your gross sales revenue, physical cash vs bank deposits,
                      expense deductibility ratios, and receipt documentation to identify any audit risks.
                    </p>
                  </div>
                  <button
                    onClick={handleRunDeepAudit}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-semibold text-xs transition shadow-md shadow-orange-700/20"
                  >
                    <Sparkles className="w-4 h-4 text-amber-200" />
                    Run AI Pre-Audit Examination
                  </button>
                </div>
              )}

              {/* Loading State */}
              {isAuditing && (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-orange-700 dark:text-orange-400 animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                    Auditing ledger books with Gemini 3.8 Flash...
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Checking cash transactions, deductible expenses, VAT ratios, and attached invoice photos.
                  </p>
                </div>
              )}

              {/* Error State */}
              {auditError && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 text-xs flex items-center justify-between">
                  <span>{auditError}</span>
                  <button
                    onClick={handleRunDeepAudit}
                    className="underline font-semibold ml-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Audit Report Results */}
              {auditReport && !isAuditing && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Top Score Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-stone-50 to-orange-50/50 dark:from-stone-800/80 dark:to-orange-950/20 border border-stone-200 dark:border-stone-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative w-16 h-16 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex flex-col items-center justify-center shadow-sm shrink-0">
                        <span className="text-xl font-black text-stone-900 dark:text-white leading-none">
                          {auditReport.score}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-stone-400 font-bold mt-0.5">
                          / 100
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                              auditReport.riskLevel === 'LOW'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : auditReport.riskLevel === 'MODERATE'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800'
                            }`}
                          >
                            {auditReport.riskLevel} AUDIT RISK
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 dark:text-stone-300 mt-1 leading-relaxed">
                          {auditReport.summary}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleRunDeepAudit}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold hover:bg-white dark:hover:bg-stone-800 transition shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-Audit
                    </button>
                  </div>

                  {/* Findings */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      Audit Findings & Remediation ({auditReport.findings.length})
                    </h4>
                    <div className="space-y-2">
                      {auditReport.findings.map((finding, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 space-y-1.5 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {finding.severity === 'danger' ? (
                                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                              ) : finding.severity === 'warning' ? (
                                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              )}
                              <h5 className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                                {finding.title}
                              </h5>
                            </div>
                            <span
                              className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                finding.severity === 'danger'
                                  ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                  : finding.severity === 'warning'
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {finding.severity}
                            </span>
                          </div>
                          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                            {finding.description}
                          </p>
                          <div className="p-2 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-100 dark:border-stone-800 text-[11px] text-stone-700 dark:text-stone-300">
                            <strong className="text-orange-700 dark:text-orange-400">Action:</strong>{' '}
                            {finding.recommendation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Immediate Action Items */}
                  {auditReport.actionItems?.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 space-y-2">
                      <h4 className="text-xs font-bold text-orange-900 dark:text-orange-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-orange-700 dark:text-orange-400" />
                        Priority Action Checklist to Become 100% Audit-Proof
                      </h4>
                      <ul className="space-y-1.5 text-xs text-stone-700 dark:text-stone-300">
                        {auditReport.actionItems.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="font-bold text-orange-700 dark:text-orange-400">
                              {idx + 1}.
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Tax Saving Tips */}
                  {auditReport.taxSavingTips && auditReport.taxSavingTips.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                      <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                        Tax Deduction Opportunities Found by AI
                      </h4>
                      <ul className="space-y-1 text-xs text-stone-700 dark:text-stone-300">
                        {auditReport.taxSavingTips.map((tip, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Interactive Chat with AI Tax Auditor */
            <div className="flex flex-col h-[520px]">
              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                        m.sender === 'user'
                          ? 'bg-orange-700 text-white rounded-br-xs'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-bl-xs border border-stone-200 dark:border-stone-700'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                    <span className="text-[10px] text-stone-400 mt-1 px-1">
                      {m.timestamp}
                    </span>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex items-center gap-2 text-xs text-stone-500 italic p-2">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-700" />
                    TaxGuard AI is analyzing tax regulations...
                  </div>
                )}
              </div>

              {/* Suggestions */}
              <div className="pt-3 pb-2 flex flex-wrap gap-1.5">
                {promptSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(suggestion)}
                    disabled={isChatting}
                    className="px-2.5 py-1 text-[11px] bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg border border-stone-200 dark:border-stone-700 transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {/* Input Box */}
              <div className="pt-2 flex items-center gap-2 border-t border-stone-200 dark:border-stone-800">
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask any tax, VAT, or bookkeeping question..."
                  className="flex-1 px-3.5 py-2.5 text-xs bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-600 dark:text-stone-100"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isChatting || !inputPrompt.trim()}
                  className="p-2.5 rounded-xl bg-orange-700 text-white hover:bg-orange-800 disabled:opacity-50 transition shadow-sm"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
