import React, { useState, useRef } from 'react';
import {
  BankAccount,
  BankTransaction,
  TaxSettings,
} from '../../types';
import {
  formatCurrency,
  formatDate,
} from '../../utils/formatters';
import { compressImage } from '../../utils/imageUtils';
import {
  scanBankStatementWithAI,
  ExtractedBankStatementData,
  ScannedBankStatementTransaction,
  BankStatementPageItem,
} from '../../utils/aiApi';
import {
  parseBankStatementCSV,
  SAMPLE_CBE_CSV_STATEMENT,
} from '../../utils/csvBankStatementParser';
import {
  Sparkles,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Landmark,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Calendar,
  Layers,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  Calculator,
  Edit2,
  Save,
} from 'lucide-react';

export interface StatementPage {
  id: string;
  dataUrl: string;
  name: string;
  mimeType: string;
  timestamp: number;
}

interface ScanBankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
  settings: TaxSettings;
  onImportTransactions: (
    targetAccountId: string,
    transactions: Omit<BankTransaction, 'id'>[],
    newBalance?: number
  ) => void;
  onApplyBRSBalance?: (balance: number, statementDate?: string) => void;
  onAddBankAccount?: (account: BankAccount) => void;
}

export const ScanBankStatementModal: React.FC<ScanBankStatementModalProps> = ({
  isOpen,
  onClose,
  bankAccounts,
  settings,
  onImportTransactions,
  onApplyBRSBalance,
  onAddBankAccount,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    bankAccounts[0]?.id || ''
  );
  const [pages, setPages] = useState<StatementPage[]>([]);
  const [previewPage, setPreviewPage] = useState<StatementPage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ExtractedBankStatementData | null>(null);
  const [transactionsList, setTransactionsList] = useState<ScannedBankStatementTransaction[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Record<number, boolean>>({});
  const [shouldUpdateBalance, setShouldUpdateBalance] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [pageFilter, setPageFilter] = useState<'all' | number>('all');

  // Manual Add Missing Row Form State
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<Partial<ScannedBankStatementTransaction>>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    type: 'debit',
    amount: 0,
    category: 'other',
    reference: '',
    pageNumber: 1,
  });

  // Editing existing row state
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ScannedBankStatementTransaction>>({});

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const appendCameraRef = useRef<HTMLInputElement>(null);
  const appendGalleryRef = useRef<HTMLInputElement>(null);
  const appendCsvRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Process newly captured or uploaded files (images, PDFs, or CSV statements)
  const handleProcessFiles = async (fileList: FileList | File[]) => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      // Check if user uploaded a CSV / TSV statement
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const isCSV =
          file.name.toLowerCase().endsWith('.csv') ||
          file.name.toLowerCase().endsWith('.tsv') ||
          (file.name.toLowerCase().endsWith('.txt') && file.type.includes('csv')) ||
          file.type === 'text/csv' ||
          file.type === 'text/comma-separated-values' ||
          file.type === 'application/vnd.ms-excel';

        if (isCSV) {
          const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read CSV bank statement file'));
            reader.readAsText(file);
          });
          handleScanCSVText(text, file.name);
          return;
        }
      }

      const newPages: StatementPage[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        let dataUrl: string;

        if (file.type === 'application/pdf') {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read PDF file'));
            reader.readAsDataURL(file);
          });
        } else {
          try {
            // High resolution (2400x2400 @ 0.90) to capture tiny printed 6pt-8pt table text
            dataUrl = await compressImage(file, 2400, 2400, 0.90);
          } catch {
            dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('Failed to read image file'));
              reader.readAsDataURL(file);
            });
          }
        }

        const pageNum = pages.length + newPages.length + 1;
        newPages.push({
          id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          name: file.name && !file.name.startsWith('image') ? file.name : `Page ${pageNum}`,
          mimeType: file.type || (dataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg'),
          timestamp: Date.now(),
        });
      }

      setPages((prev) => [...prev, ...newPages]);
    } catch (err: any) {
      console.error('File processing error:', err);
      setErrorMessage(err.message || 'Failed to process selected statement pages.');
    } finally {
      setIsProcessing(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (csvInputRef.current) csvInputRef.current.value = '';
      if (appendCameraRef.current) appendCameraRef.current.value = '';
      if (appendGalleryRef.current) appendGalleryRef.current.value = '';
      if (appendCsvRef.current) appendCsvRef.current.value = '';
    }
  };

  const handleRemovePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
    if (pages.length <= 1) {
      setScanResult(null);
      setTransactionsList([]);
      setSelectedIndices({});
    }
  };

  const handleMovePage = (index: number, direction: 'prev' | 'next') => {
    setPages((prev) => {
      const targetIndex = direction === 'prev' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleClearAllPages = () => {
    setPages([]);
    setScanResult(null);
    setTransactionsList([]);
    setErrorMessage(null);
    setSelectedIndices({});
    setEditingRowIdx(null);
    setIsAddingRow(false);
  };

  // Perform AI multimodal exhaustive analysis across ALL sequential pages
  const handleScanWithAI = async (pagesToScan: StatementPage[] = pages) => {
    if (pagesToScan.length === 0) {
      setErrorMessage('Please capture or upload at least one statement page first.');
      return;
    }

    try {
      setIsScanning(true);
      setErrorMessage(null);
      setEditingRowIdx(null);
      setIsAddingRow(false);

      const pageItems: BankStatementPageItem[] = pagesToScan.map((p, idx) => ({
        id: p.id,
        imageBase64: p.dataUrl,
        mimeType: p.mimeType,
        name: p.name || `Page ${idx + 1}`,
      }));

      const result = await scanBankStatementWithAI(pageItems);
      setScanResult(result);

      // Assign pageNumber if missing
      const enrichedTxs = (result.transactions || []).map((tx, idx) => ({
        ...tx,
        pageNumber: tx.pageNumber || (pagesToScan.length > 1 ? Math.floor(idx / Math.max(1, Math.ceil(result.transactions.length / pagesToScan.length))) + 1 : 1),
      }));

      setTransactionsList(enrichedTxs);

      // Select all transactions by default
      const initialSelected: Record<number, boolean> = {};
      enrichedTxs.forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedIndices(initialSelected);

      // Auto-match target bank account if detected in statement name
      if (result.bankName) {
        const lowerName = result.bankName.toLowerCase();
        const matched = bankAccounts.find(
          (acc) =>
            acc.bankName.toLowerCase().includes(lowerName) ||
            lowerName.includes(acc.bankName.toLowerCase()) ||
            acc.name.toLowerCase().includes(lowerName)
        );
        if (matched) {
          setSelectedAccountId(matched.id);
        }
      }
    } catch (err: any) {
      console.error('Bank statement AI multi-page scan failed:', err);
      setErrorMessage(
        err.message ||
          'Failed to scan bank statement with Gemini AI. Please check that all pages are clear and well lit.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Load a realistic multi-page demo statement (CBE 2-Page Statement with 10 exhaustive transactions)
  const handleLoadSampleStatement = () => {
    const today = new Date().toISOString().split('T')[0];
    const sampleTxs: ScannedBankStatementTransaction[] = [
      // Page 1 entries (6 transactions: Deposits, Payouts, RTGS fee, SMS fee)
      {
        pageNumber: 1,
        date: today,
        description: 'CBE Mobile Banking Deposit - Customer Sales Transfer',
        type: 'credit',
        amount: 28450,
        category: 'sale_deposit',
        reference: 'FT26284CBE91',
        balance: 173450,
      },
      {
        pageNumber: 1,
        date: today,
        description: 'Vendor Cheque Payment - Wholesale Building Supplies',
        type: 'debit',
        amount: 25000,
        category: 'vendor_payout',
        reference: 'CHQ-882194',
        balance: 148450,
      },
      {
        pageNumber: 1,
        date: today,
        description: 'CBE Outward RTGS Bank Transfer Service Charge',
        type: 'debit',
        amount: 150,
        category: 'bank_fee',
        reference: 'FEE-RTGS-01',
        balance: 148300,
      },
      {
        pageNumber: 1,
        date: today,
        description: 'Telebirr POS / Merchant Sales Settlement Deposit',
        type: 'credit',
        amount: 50000,
        category: 'sale_deposit',
        reference: 'TB-99481920',
        balance: 198300,
      },
      {
        pageNumber: 1,
        date: today,
        description: 'CBE SMS Notification Alert Fee (Monthly)',
        type: 'debit',
        amount: 25,
        category: 'bank_fee',
        reference: 'SMS-201807',
        balance: 198275,
      },
      // Page 2 entries (5 transactions: Branch Cash, Power Utility, VAT Tax, Maintenance, Retail transfer)
      {
        pageNumber: 2,
        date: today,
        description: 'Direct Cash Deposit - Retail Branch Banking (Arada)',
        type: 'credit',
        amount: 50000,
        category: 'sale_deposit',
        reference: 'TX-CBE-99120',
        balance: 248275,
      },
      {
        pageNumber: 2,
        date: today,
        description: 'Supplier Wire - Ethiopian Electric Utility Power Bill',
        type: 'debit',
        amount: 14600,
        category: 'vendor_payout',
        reference: 'EEU-99218',
        balance: 233675,
      },
      {
        pageNumber: 2,
        date: today,
        description: 'Ministry of Revenues - Monthly VAT Settlement Payout',
        type: 'debit',
        amount: 45000,
        category: 'tax_payment',
        reference: 'MOR-VAT-4819',
        balance: 188675,
      },
      {
        pageNumber: 2,
        date: today,
        description: 'CBE Corporate Ledger Account Maintenance Fee',
        type: 'debit',
        amount: 200,
        category: 'bank_fee',
        reference: 'LEDGER-0718',
        balance: 188475,
      },
      {
        pageNumber: 2,
        date: today,
        description: 'Customer CBE Birr Digital Transfer - Invoice #4812',
        type: 'credit',
        amount: 199975,
        category: 'sale_deposit',
        reference: 'CBEB-881920',
        balance: 388450,
      },
    ];

    const sampleCredits = sampleTxs.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const sampleDebits = sampleTxs.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

    const sampleResult: ExtractedBankStatementData = {
      bankName: 'Commercial Bank of Ethiopia (CBE)',
      accountNumber: '•••• 4821',
      statementPeriod: 'Hamle 1 - Hamle 30, 2018 (Pages 1 & 2)',
      statementDate: today,
      openingBalance: 145000,
      closingBalance: 388450,
      totalCredits: sampleCredits,
      totalDebits: sampleDebits,
      totalTransactionsCount: sampleTxs.length,
      isReconciledCheck: true,
      pageCount: 2,
      transactions: sampleTxs,
      notes:
        'Exhaustive 2-page CBE commercial statement scan. 100% of line-item transactions captured across Pages 1 and 2 including sales deposits, vendor cheques, RTGS fees, and SMS alert charges.',
    };

    setPages([
      {
        id: 'sample_p1',
        dataUrl: '',
        name: 'Page 1 (CBE Statement Front)',
        mimeType: 'image/jpeg',
        timestamp: Date.now(),
      },
      {
        id: 'sample_p2',
        dataUrl: '',
        name: 'Page 2 (CBE Statement Back / Cont.)',
        mimeType: 'image/jpeg',
        timestamp: Date.now(),
      },
    ]);

    setScanResult(sampleResult);
    setTransactionsList(sampleTxs);

    const initialSelected: Record<number, boolean> = {};
    sampleTxs.forEach((_, idx) => {
      initialSelected[idx] = true;
    });
    setSelectedIndices(initialSelected);
  };

  // Directly parse & scan bank statement from .CSV file
  const handleScanCSVText = (csvContent: string, fileName = 'bank_statement.csv') => {
    try {
      setIsScanning(true);
      setErrorMessage(null);
      setEditingRowIdx(null);
      setIsAddingRow(false);

      const result = parseBankStatementCSV(csvContent);
      setScanResult(result);
      setTransactionsList(result.transactions || []);

      // Select all transactions by default
      const initialSelected: Record<number, boolean> = {};
      (result.transactions || []).forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedIndices(initialSelected);

      // Create a visual deck entry for the scanned CSV statement
      setPages([
        {
          id: `csv_${Date.now()}`,
          dataUrl: '',
          name: `${fileName} (${result.transactions.length} rows scanned)`,
          mimeType: 'text/csv',
          timestamp: Date.now(),
        },
      ]);

      // Auto-match target bank account if detected in statement
      if (result.bankName) {
        const lowerName = result.bankName.toLowerCase();
        const matched = bankAccounts.find(
          (acc) =>
            acc.bankName.toLowerCase().includes(lowerName) ||
            lowerName.includes(acc.bankName.toLowerCase()) ||
            acc.name.toLowerCase().includes(lowerName)
        );
        if (matched) {
          setSelectedAccountId(matched.id);
        }
      }
    } catch (err: any) {
      console.error('CSV bank statement scan failed:', err);
      setErrorMessage(err.message || 'Failed to scan transactions from CSV bank statement.');
    } finally {
      setIsScanning(false);
      setIsProcessing(false);
    }
  };

  // Load realistic CBE bank statement CSV demo
  const handleLoadSampleCSV = () => {
    handleScanCSVText(SAMPLE_CBE_CSV_STATEMENT, 'Sample_CBE_Commercial_Statement.csv');
  };

  // 1-Click quick toggle between Bank Deposit and Payment on any transaction row
  const handleToggleRowType = (idx: number) => {
    setTransactionsList((prev) => {
      const copy = [...prev];
      const target = copy[idx];
      if (!target) return prev;
      const newType: 'credit' | 'debit' = target.type === 'credit' ? 'debit' : 'credit';
      const newCategory: BankTransaction['category'] =
        newType === 'credit' ? 'sale_deposit' : 'vendor_payout';
      copy[idx] = {
        ...target,
        type: newType,
        category: newCategory,
      };
      return copy;
    });
  };

  const toggleSelectAll = () => {
    const allSelected =
      transactionsList.length > 0 &&
      transactionsList.every((_, i) => selectedIndices[i]);

    const updated: Record<number, boolean> = {};
    if (!allSelected) {
      transactionsList.forEach((_, i) => {
        updated[i] = true;
      });
    }
    setSelectedIndices(updated);
  };

  const toggleTransaction = (idx: number) => {
    setSelectedIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // Add a manually inserted transaction (e.g. if an ink stain made a line blurry on the paper statement)
  const handleAddCustomTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRow.description?.trim() || !newRow.amount || Number(newRow.amount) <= 0) {
      alert('Please enter a valid transaction description and amount.');
      return;
    }

    const createdTx: ScannedBankStatementTransaction = {
      pageNumber: Number(newRow.pageNumber) || 1,
      date: newRow.date || new Date().toISOString().split('T')[0],
      description: newRow.description.trim(),
      type: newRow.type === 'credit' ? 'credit' : 'debit',
      amount: Number(Number(newRow.amount).toFixed(2)),
      category: newRow.category || (newRow.type === 'credit' ? 'sale_deposit' : 'vendor_payout'),
      reference: newRow.reference?.trim() || undefined,
    };

    setTransactionsList((prev) => {
      const nextList = [...prev, createdTx];
      // Auto-select the newly added row
      setSelectedIndices((sPrev) => ({ ...sPrev, [nextList.length - 1]: true }));
      return nextList;
    });

    // Reset add form
    setNewRow({
      date: new Date().toISOString().split('T')[0],
      description: '',
      type: 'debit',
      amount: 0,
      category: 'other',
      reference: '',
      pageNumber: 1,
    });
    setIsAddingRow(false);
  };

  // Start editing a row
  const handleStartEditRow = (idx: number) => {
    const tx = transactionsList[idx];
    if (!tx) return;
    setEditingRowIdx(idx);
    setEditFormData({ ...tx });
  };

  // Save edited row
  const handleSaveEditRow = (idx: number) => {
    if (!editFormData.description?.trim() || !editFormData.amount || Number(editFormData.amount) <= 0) {
      alert('Please enter a valid description and positive amount.');
      return;
    }

    setTransactionsList((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        ...editFormData,
        amount: Number(Number(editFormData.amount).toFixed(2)),
      };
      return copy;
    });

    setEditingRowIdx(null);
    setEditFormData({});
  };

  // Delete a transaction row
  const handleDeleteRow = (idx: number) => {
    setTransactionsList((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIndices((prev) => {
      const updated: Record<number, boolean> = {};
      Object.keys(prev).forEach((keyStr) => {
        const k = Number(keyStr);
        if (k < idx) updated[k] = prev[k];
        else if (k > idx) updated[k - 1] = prev[k];
      });
      return updated;
    });
    if (editingRowIdx === idx) {
      setEditingRowIdx(null);
    }
  };

  const handleImport = () => {
    if (!scanResult) return;

    let targetId = selectedAccountId;
    if (!targetId || bankAccounts.length === 0) {
      targetId = `acc-stmt-${Date.now().toString(36)}`;
      if (onAddBankAccount) {
        const newAcc: BankAccount = {
          id: targetId,
          name: scanResult.bankName ? `${scanResult.bankName} Account` : 'Primary Business Account',
          bankName: scanResult.bankName || 'Commercial Bank of Ethiopia',
          accountNumberMasked: scanResult.accountNumber || '•••• 4821',
          type: 'checking',
          currentBalance:
            shouldUpdateBalance && typeof scanResult.closingBalance === 'number'
              ? scanResult.closingBalance
              : 0,
          currency: settings.currency || 'ETB',
          color: '#ea580c',
        };
        onAddBankAccount(newAcc);
        setSelectedAccountId(targetId);
      }
    }

    const chosenTxs: Omit<BankTransaction, 'id'>[] = [];
    transactionsList.forEach((tx, idx) => {
      if (selectedIndices[idx]) {
        chosenTxs.push({
          bankAccountId: targetId,
          date: tx.date || new Date().toISOString().split('T')[0],
          description: tx.description || 'Bank Statement Entry',
          type: tx.type,
          amount: Number(tx.amount.toFixed(2)),
          category: tx.category || (tx.type === 'credit' ? 'sale_deposit' : 'vendor_payout'),
          referenceId: tx.reference || undefined,
          isReconciled: true,
          notes: tx.reference ? `Ref: ${tx.reference}` : undefined,
        });
      }
    });

    if (chosenTxs.length === 0) {
      setErrorMessage('Please select at least one transaction to import from the statement.');
      return;
    }

    const newBalance =
      shouldUpdateBalance && typeof scanResult.closingBalance === 'number'
        ? scanResult.closingBalance
        : undefined;

    onImportTransactions(targetId, chosenTxs, newBalance);

    if (
      onApplyBRSBalance &&
      typeof scanResult.closingBalance === 'number' &&
      scanResult.closingBalance > 0
    ) {
      onApplyBRSBalance(scanResult.closingBalance, scanResult.statementDate);
    }

    onClose();
  };

  // Filtered transactions for review based on type, search, and page filters
  const filteredTransactionsWithIndex = transactionsList
    .map((tx, originalIdx) => ({ tx, originalIdx }))
    .filter(({ tx }) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (pageFilter !== 'all' && tx.pageNumber !== pageFilter) return false;
      if (!searchFilter.trim()) return true;
      const query = searchFilter.toLowerCase();
      return (
        tx.description.toLowerCase().includes(query) ||
        (tx.reference && tx.reference.toLowerCase().includes(query)) ||
        tx.amount.toString().includes(query) ||
        tx.date.includes(query)
      );
    });

  const selectedCount = Object.values(selectedIndices).filter(Boolean).length;
  const selectedCredits = transactionsList
    .filter((t, i) => selectedIndices[i] && t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
  const selectedDebits = transactionsList
    .filter((t, i) => selectedIndices[i] && t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  // Available unique page numbers
  const detectedPages = Array.from(
    new Set(transactionsList.map((t) => t.pageNumber || 1))
  ).sort((a, b) => a - b);

  // Reconciliation Integrity Calculation
  const openingBal = scanResult?.openingBalance ?? 0;
  const closingBal = scanResult?.closingBalance ?? 0;
  const expectedClosing = openingBal + selectedCredits - selectedDebits;
  const reconciliationVariance = Math.abs(expectedClosing - closingBal);
  const isFullyReconciled = closingBal > 0 && reconciliationVariance < 1.0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-600 via-stone-900 to-amber-900 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-md shrink-0">
              <Landmark className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-300" />
                  <span>Exhaustive Multi-Page Scanner</span>
                </span>
                <span className="text-[11px] text-stone-300">
                  Gemini 3.8 Flash &middot; 100% Every Transaction &middot; Ethiopian & Global Banks
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                Scan Bank Statement (Every Transaction Scanned)
              </h2>
              <p className="text-xs text-stone-300 mt-0.5">
                Exhaustively reads each and every bank transaction row-by-row, including customer deposits, cheques, ATM withdrawals, and micro-fees (SMS alert charges & ledger fees).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Hidden File Inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleProcessFiles(files);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,application/pdf,.csv,.tsv,.txt,text/csv,text/comma-separated-values,application/vnd.ms-excel"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleProcessFiles(files);
            }}
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/comma-separated-values,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleProcessFiles(files);
            }}
          />
          <input
            ref={appendCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleProcessFiles(files);
            }}
          />
          <input
            ref={appendGalleryRef}
            type="file"
            accept="image/*,application/pdf,.csv,.tsv,.txt,text/csv,text/comma-separated-values,application/vnd.ms-excel"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleProcessFiles(files);
            }}
          />
          <input
            ref={appendCsvRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/comma-separated-values,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handleProcessFiles(files);
            }}
          />

          {/* Initial Capture / Upload Card when no pages added */}
          {pages.length === 0 && (
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-2xl text-center space-y-3 bg-stone-50/50 dark:bg-stone-800/20">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 flex items-center justify-center mx-auto shadow-xs">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Scan Bank Statement (.CSV, Photos, or PDF)
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-lg mx-auto">
                    Upload your digital bank statement <strong>.CSV file</strong> or take high-resolution photos of Page 1, Page 2...
                    Every single transaction is scanned and categorized as a <strong>Bank Deposit</strong> or <strong>Payment</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  {/* CSV Upload (Instant 100% precision scan) */}
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shadow-sm transition cursor-pointer min-h-[42px]"
                    title="Upload bank statement CSV file exported from CBE, Awash, Dashen, or your bank"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                    <span>Upload Bank Statement (.CSV)</span>
                  </button>


                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-semibold text-xs shadow-sm transition cursor-pointer min-h-[42px]"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Photo (Page 1)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs transition cursor-pointer min-h-[42px]"
                  >
                    <ImageIcon className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                    <span>Choose Multiple Pages / PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSampleCSV}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-semibold text-xs hover:bg-emerald-100 transition cursor-pointer min-h-[42px]"
                    title="Try CBE sample .CSV statement with 12 real bank deposits & payments"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Try CBE Sample (.CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSampleStatement}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-semibold text-xs hover:bg-amber-100 dark:hover:bg-amber-900/60 transition cursor-pointer min-h-[42px]"
                    title="Load sample 2-page CBE bank statement photos"
                  >
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Try 2-Page CBE Sample (Photo)</span>
                  </button>
                </div>
              </div>

              {/* Supported Multi-Page Banks Banner */}
              <div className="p-3.5 rounded-xl bg-stone-100/70 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 space-y-1.5">
                <div className="flex items-start sm:items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                  <div className="text-[11px] text-stone-600 dark:text-stone-400">
                    <strong className="text-stone-900 dark:text-stone-200">Exhaustive Multi-Page & CSV Engine:</strong> Covers Commercial Bank of Ethiopia (CBE), Awash, Dashen, Abyssinia, Telebirr merchant exports, and bank PDFs. Automatically parses and maps standard 9-column bank exports with headers:
                  </div>
                </div>
                <div className="pl-8 text-[10px] font-mono text-stone-500 dark:text-stone-400 bg-white/70 dark:bg-stone-900/60 p-2 rounded-lg border border-stone-200/80 dark:border-stone-700/80 overflow-x-auto">
                  Date, Particulars, Reference, Narrative, Sender/Receiver, Value Date, Debit, Credit, Balances
                </div>
              </div>
            </div>
          )}

          {/* Pages Deck / Filmstrip when 1 or more pages are loaded */}
          {pages.length > 0 && (
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-600" />
                  <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                    Statement Pages for Scanning ({pages.length})
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400">
                    Sequential Multi-Page
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Add Next Page via Camera */}
                  <button
                    type="button"
                    onClick={() => appendCameraRef.current?.click()}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-semibold text-[11px] shadow-xs transition cursor-pointer"
                    title="Take photo of the next page"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>+ Snap Next Page</span>
                  </button>

                  {/* Add More from Files */}
                  <button
                    type="button"
                    onClick={() => appendGalleryRef.current?.click()}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-semibold text-[11px] hover:bg-stone-100 transition cursor-pointer"
                    title="Upload more page images or PDFs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Files</span>
                  </button>

                  {/* Add CSV */}
                  <button
                    type="button"
                    onClick={() => appendCsvRef.current?.click()}
                    disabled={isProcessing || isScanning}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-[11px] shadow-xs transition cursor-pointer"
                    title="Upload bank statement CSV file"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                    <span>+ Upload CSV</span>
                  </button>

                  {/* Clear All */}
                  <button
                    type="button"
                    onClick={handleClearAllPages}
                    disabled={isProcessing || isScanning}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                    title="Clear all pages and start over"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Page Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
                {pages.map((page, idx) => (
                  <div
                    key={page.id}
                    className="relative group rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-2 shadow-xs hover:border-orange-500 transition flex flex-col justify-between"
                  >
                    {/* Page Badge & Action Buttons */}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200">
                        Page {idx + 1}
                      </span>

                      <div className="flex items-center gap-0.5">
                        {/* Move Left */}
                        <button
                          type="button"
                          onClick={() => handleMovePage(idx, 'prev')}
                          disabled={idx === 0 || isScanning}
                          className="p-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-30 cursor-pointer"
                          title="Move earlier in sequence"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>

                        {/* Move Right */}
                        <button
                          type="button"
                          onClick={() => handleMovePage(idx, 'next')}
                          disabled={idx === pages.length - 1 || isScanning}
                          className="p-1 rounded text-stone-400 hover:text-stone-700 disabled:opacity-30 cursor-pointer"
                          title="Move later in sequence"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Page */}
                        <button
                          type="button"
                          onClick={() => handleRemovePage(idx)}
                          disabled={isScanning}
                          className="p-1 rounded text-stone-400 hover:text-red-600 cursor-pointer"
                          title="Remove this page"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Thumbnail Preview */}
                    <div
                      onClick={() => setPreviewPage(page)}
                      className="relative h-24 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden border border-stone-200/80 dark:border-stone-700 cursor-pointer flex items-center justify-center group/thumb"
                    >
                      {page.dataUrl ? (
                        <img
                          src={page.dataUrl}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-full object-cover group-hover/thumb:scale-105 transition duration-200"
                        />
                      ) : (
                        <div className="text-center p-2 text-stone-400">
                          <FileText className="w-8 h-8 mx-auto mb-1 text-stone-400" />
                          <span className="text-[10px] block">Sample Document</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition flex items-center justify-center text-white">
                        <Eye className="w-5 h-5 drop-shadow" />
                      </div>
                    </div>

                    <div className="mt-1.5 text-[10px] text-stone-500 dark:text-stone-400 truncate text-center">
                      {page.name}
                    </div>
                  </div>
                ))}

                {/* Add Another Page Quick Trigger Card */}
                <button
                  type="button"
                  onClick={() => appendCameraRef.current?.click()}
                  disabled={isProcessing || isScanning}
                  className="rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-orange-500 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition p-4 flex flex-col items-center justify-center gap-1.5 text-stone-500 hover:text-orange-700 cursor-pointer min-h-[120px]"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-xs font-bold">+ Snap Next Page</span>
                  <span className="text-[10px] text-stone-400">Page {pages.length + 1}</span>
                </button>
              </div>

              {/* Analyze Button when scanResult is null */}
              {!scanResult && (
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200/60 dark:border-stone-700/60">
                  <div className="text-[11px] text-stone-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Ready for 100% exhaustive scan across {pages.length} sequential page{pages.length > 1 ? 's' : ''}.</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleScanWithAI(pages)}
                    disabled={isProcessing || isScanning || pages.length === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-bold text-xs shadow-md transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Scan Every Transaction Across {pages.length} Page{pages.length > 1 ? 's' : ''}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading States */}
          {(isProcessing || isScanning) && (
            <div className="p-8 text-center space-y-3 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-200 dark:border-stone-700">
              <Loader2 className="w-10 h-10 animate-spin text-orange-700 mx-auto" />
              <div>
                <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                  {isProcessing
                    ? 'Optimizing Statement Resolution for High-Precision OCR...'
                    : `Exhaustively Scanning Every Transaction across ${pages.length} Page${pages.length > 1 ? 's' : ''}...`}
                </h4>
                <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                  Extracting every row from top to bottom — including customer deposits, cheques, ATM withdrawals, and all micro-fees (SMS alert fees & ledger maintenance charges)...
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="block font-bold">Scanning Issue:</strong>
                <p>{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="mt-2 text-xs font-bold text-red-700 dark:text-red-300 underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Scan Results & Import Review */}
          {scanResult && !isScanning && (
            <div className="space-y-4">
              {/* Summary Header Card */}
              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm truncate">
                        {scanResult.bankName || 'Detected Bank Statement'}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 shrink-0 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>{transactionsList.length} Total Transactions Scanned</span>
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 shrink-0">
                        {pages.length || scanResult.pageCount || 1} Page{((pages.length || scanResult.pageCount || 1) > 1) ? 's' : ''} Scanned
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 truncate mt-0.5">
                      Account: {scanResult.accountNumber || 'Primary Account'} &middot; Period: {scanResult.statementPeriod || scanResult.statementDate || 'Recent'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleScanWithAI(pages)}
                    className="px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300 font-semibold text-xs hover:bg-orange-100 transition cursor-pointer flex items-center gap-1.5"
                    title="Re-run AI scan across current page sequence"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Re-Scan Pages</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAllPages}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-semibold text-xs hover:bg-stone-100 transition cursor-pointer"
                  >
                    Start Fresh
                  </button>
                </div>
              </div>

              {/* Target Bank Account Selector */}
              <div className="p-4 rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="font-bold text-stone-900 dark:text-stone-100 block">
                      Target Bank Account in TaxGuard:
                    </label>
                    <p className="text-[11px] text-stone-600 dark:text-stone-400">
                      Transactions will be recorded under this business bank account.
                    </p>
                  </div>

                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-semibold text-xs focus:outline-none shrink-0"
                  >
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.bankName} - {acc.accountNumberMasked})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ending Balance Checkbox */}
                {typeof scanResult.closingBalance === 'number' && scanResult.closingBalance > 0 && (
                  <div className="pt-2 border-t border-orange-200/60 dark:border-orange-900/40 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="updateBalanceCheckbox"
                      checked={shouldUpdateBalance}
                      onChange={(e) => setShouldUpdateBalance(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-700 focus:ring-orange-600 cursor-pointer"
                    />
                    <label
                      htmlFor="updateBalanceCheckbox"
                      className="text-xs text-stone-800 dark:text-stone-200 cursor-pointer select-none"
                    >
                      Update account balance to final page ending balance:{' '}
                      <strong className="text-orange-900 dark:text-orange-300 font-tabular">
                        {formatCurrency(scanResult.closingBalance, settings.currencySymbol)}
                      </strong>
                    </label>
                  </div>
                )}
              </div>

              {/* Complete Reconciliation Integrity Audit Card */}
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-orange-700" />
                    <h5 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                      Reconciliation Integrity Audit (Every Row Accounted For)
                    </h5>
                  </div>
                  {isFullyReconciled ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>100% Balanced</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span>Review Variance ({formatCurrency(reconciliationVariance, settings.currencySymbol)})</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                    <span className="text-stone-500 block text-[10px]">Opening Balance</span>
                    <strong className="font-tabular text-stone-900 dark:text-stone-100 font-bold">
                      {formatCurrency(openingBal, settings.currencySymbol)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                    <span className="text-emerald-600 block text-[10px]">Total Credits (+)</span>
                    <strong className="font-tabular text-emerald-700 dark:text-emerald-400 font-bold">
                      +{formatCurrency(selectedCredits, settings.currencySymbol)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                    <span className="text-stone-500 block text-[10px]">Total Debits (-)</span>
                    <strong className="font-tabular text-stone-900 dark:text-stone-100 font-bold">
                      -{formatCurrency(selectedDebits, settings.currencySymbol)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                    <span className="text-orange-600 block text-[10px]">Ending Statement Balance</span>
                    <strong className="font-tabular text-stone-900 dark:text-stone-100 font-bold">
                      {formatCurrency(closingBal, settings.currencySymbol)}
                    </strong>
                  </div>
                </div>

                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {isFullyReconciled ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      ✓ Mathematical match verified: Opening balance + deposits - debits exactly equals final statement closing balance. All transactions accounted for.
                    </span>
                  ) : (
                    <span>
                      Note: Calculated balance is {formatCurrency(expectedClosing, settings.currencySymbol)}. If a row on your statement had a crease or blur, you can add it directly via <strong>"+ Add Missing Row"</strong> below.
                    </span>
                  )}
                </p>
              </div>

              {/* Transactions Header & Filters */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                      Extracted Transactions ({transactionsList.length})
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {selectedCount} Selected for Import
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Add Missing Row Button */}
                    <button
                      type="button"
                      onClick={() => setIsAddingRow((prev) => !prev)}
                      className="px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-800 dark:text-stone-200 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                      title="Add a transaction if a line on the statement was smudged or missed"
                    >
                      <Plus className="w-3.5 h-3.5 text-orange-700" />
                      <span>+ Add Row</span>
                    </button>

                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs font-semibold text-orange-700 hover:text-orange-800 underline cursor-pointer ml-1"
                    >
                      {selectedCount === transactionsList.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </div>

                {/* Filter Controls Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {/* Type Filter Pills */}
                  <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTypeFilter('all')}
                      className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                        typeFilter === 'all'
                          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      All ({transactionsList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('credit')}
                      className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                        typeFilter === 'credit'
                          ? 'bg-white dark:bg-stone-700 text-emerald-700 dark:text-emerald-400 shadow-xs'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      Bank Deposits ({transactionsList.filter((t) => t.type === 'credit').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter('debit')}
                      className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                        typeFilter === 'debit'
                          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                          : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      Payments ({transactionsList.filter((t) => t.type === 'debit').length})
                    </button>
                  </div>

                  {/* Page Filter Selector (if multi-page) */}
                  {detectedPages.length > 1 && (
                    <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg text-[11px]">
                      <span className="px-1.5 text-stone-400 text-[10px]">Page:</span>
                      <button
                        type="button"
                        onClick={() => setPageFilter('all')}
                        className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                          pageFilter === 'all'
                            ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                            : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        All Pages
                      </button>
                      {detectedPages.map((pgNum) => {
                        const countOnPg = transactionsList.filter((t) => (t.pageNumber || 1) === pgNum).length;
                        return (
                          <button
                            key={pgNum}
                            type="button"
                            onClick={() => setPageFilter(pgNum)}
                            className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                              pageFilter === pgNum
                                ? 'bg-white dark:bg-stone-700 text-orange-700 dark:text-orange-400 shadow-xs'
                                : 'text-stone-500 hover:text-stone-800'
                            }`}
                          >
                            Page {pgNum} ({countOnPg})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Search Bar for Long Lists */}
                {transactionsList.length > 4 && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter transactions by description, reference, or amount..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}
              </div>

              {/* Add Missing Row Inline Form Drawer */}
              {isAddingRow && (
                <form
                  onSubmit={handleAddCustomTransaction}
                  className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-stone-900 dark:text-stone-100 text-xs flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-orange-700" />
                      <span>Add Unscanned or Smudged Transaction Row</span>
                    </h5>
                    <button
                      type="button"
                      onClick={() => setIsAddingRow(false)}
                      className="text-stone-400 hover:text-stone-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5">Date</label>
                      <input
                        type="date"
                        value={newRow.date || ''}
                        onChange={(e) => setNewRow({ ...newRow, date: e.target.value })}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-stone-500 block mb-0.5">Description / Payee</label>
                      <input
                        type="text"
                        placeholder="e.g. CBE SMS Alert Charge or Cash Deposit"
                        value={newRow.description || ''}
                        onChange={(e) => setNewRow({ ...newRow, description: e.target.value })}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5">Type</label>
                      <select
                        value={newRow.type}
                        onChange={(e) => setNewRow({ ...newRow, type: e.target.value as 'credit' | 'debit' })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs"
                      >
                        <option value="debit">Debit (Payment / Fee)</option>
                        <option value="credit">Credit (Deposit / Inflow)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5">Amount ({settings.currencySymbol})</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={newRow.amount || ''}
                        onChange={(e) => setNewRow({ ...newRow, amount: parseFloat(e.target.value) || 0 })}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs font-tabular"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5">Category</label>
                      <select
                        value={newRow.category}
                        onChange={(e) => setNewRow({ ...newRow, category: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs"
                      >
                        <option value="sale_deposit">Sale Transfer Deposit</option>
                        <option value="sales_cash_deposit">Sales Cash Deposit</option>
                        <option value="cash_withdraw">Cash Withdraw</option>
                        <option value="vendor_payout">Vendor Payout</option>
                        <option value="bank_fee">Bank Fee / Charge</option>
                        <option value="tax_payment">Tax Payment</option>
                        <option value="card_settlement">Card Settlement</option>
                        <option value="transfer">Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5">Reference / Voucher</label>
                      <input
                        type="text"
                        placeholder="e.g. FT26284CBE"
                        value={newRow.reference || ''}
                        onChange={(e) => setNewRow({ ...newRow, reference: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                      >
                        Save Row
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Transactions List */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden divide-y divide-stone-200 dark:divide-stone-800 max-h-72 overflow-y-auto">
                {filteredTransactionsWithIndex.map(({ tx, originalIdx }) => {
                  const isSelected = !!selectedIndices[originalIdx];
                  const isEditing = editingRowIdx === originalIdx;

                  if (isEditing) {
                    return (
                      <div key={originalIdx} className="p-3 bg-amber-50/70 dark:bg-amber-950/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-amber-900 dark:text-amber-200">
                            Editing Transaction #{originalIdx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEditRow(originalIdx)}
                              className="px-2 py-1 rounded bg-orange-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <Save className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRowIdx(null)}
                              className="px-2 py-1 rounded bg-stone-200 text-stone-700 text-[10px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-xs">
                          <input
                            type="date"
                            value={editFormData.date || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                            className="px-2 py-1 rounded bg-white dark:bg-stone-800 border border-stone-300 text-xs"
                          />
                          <input
                            type="text"
                            value={editFormData.description || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                            className="sm:col-span-2 px-2 py-1 rounded bg-white dark:bg-stone-800 border border-stone-300 text-xs"
                          />
                          <select
                            value={editFormData.type || 'credit'}
                            onChange={(e) => {
                              const newType = e.target.value as 'credit' | 'debit';
                              setEditFormData({
                                ...editFormData,
                                type: newType,
                                category:
                                  newType === 'credit' ? 'sales_cash_deposit' : 'cash_withdraw',
                              });
                            }}
                            className="px-2 py-1 rounded bg-white dark:bg-stone-800 border border-stone-300 text-xs font-semibold"
                          >
                            <option value="credit">Bank Deposit (+)</option>
                            <option value="debit">Payment (-)</option>
                          </select>
                          <select
                            value={editFormData.category || (editFormData.type === 'debit' ? 'cash_withdraw' : 'sales_cash_deposit')}
                            onChange={(e) =>
                              setEditFormData({
                                ...editFormData,
                                category: e.target.value as any,
                              })
                            }
                            className="px-2 py-1 rounded bg-white dark:bg-stone-800 border border-stone-300 text-xs font-medium"
                          >
                            <option value="sales_cash_deposit">Sales Cash Deposit</option>
                            <option value="sale_deposit">Sale Transfer Deposit</option>
                            <option value="cash_withdraw">Cash Withdraw</option>
                            <option value="vendor_payout">Vendor Payout</option>
                            <option value="tax_payment">Tax Payment</option>
                            <option value="bank_fee">Bank Fee</option>
                            <option value="card_settlement">Card Settlement</option>
                            <option value="transfer">Transfer</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            value={editFormData.amount || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, amount: parseFloat(e.target.value) || 0 })}
                            className="px-2 py-1 rounded bg-white dark:bg-stone-800 border border-stone-300 text-xs font-tabular font-bold"
                          />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={originalIdx}
                      className={`p-3 flex items-center justify-between gap-3 text-xs transition ${
                        isSelected
                          ? 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/70'
                          : 'bg-stone-50/60 dark:bg-stone-900/30 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTransaction(originalIdx)}
                          className="w-4 h-4 rounded text-orange-700 focus:ring-orange-600 cursor-pointer shrink-0"
                        />

                        {/* Line Item Number Badge */}
                        <span className="w-6 text-[10px] font-mono text-stone-400 shrink-0 text-center">
                          #{originalIdx + 1}
                        </span>

                        {/* Credit / Debit Icon */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            tx.type === 'credit'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          }`}
                        >
                          {tx.type === 'credit' ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        {/* Transaction Details */}
                        <div className="min-w-0">
                          <p className="font-bold text-stone-900 dark:text-stone-100 truncate">
                            {tx.description || 'Transaction'}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 flex-wrap">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                              Page {tx.pageNumber || 1}
                            </span>
                            <span>&middot;</span>
                            <span>{formatDate(tx.date)}</span>
                            {tx.reference && (
                              <>
                                <span>&middot;</span>
                                <span className="font-mono">Ref: {tx.reference}</span>
                              </>
                            )}
                            <span>&middot;</span>
                            <span className="capitalize">{tx.category.replace('_', ' ')}</span>
                            {typeof tx.balance === 'number' && tx.balance > 0 && (
                              <>
                                <span>&middot;</span>
                                <span className="text-[10px] text-stone-400 font-tabular">Bal: {formatCurrency(tx.balance, settings.currencySymbol)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Amount & Row Actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right flex flex-col items-end gap-1">
                          <span
                            className={`font-bold font-tabular text-xs block ${
                              tx.type === 'credit'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-stone-900 dark:text-stone-100'
                            }`}
                          >
                            {tx.type === 'credit' ? '+' : '-'}
                            {formatCurrency(tx.amount, settings.currencySymbol)}
                          </span>

                          {/* 1-Click Toggle between Bank Deposit & Payment */}
                          <button
                            type="button"
                            onClick={() => handleToggleRowType(originalIdx)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase transition cursor-pointer flex items-center gap-1 border shadow-2xs ${
                              tx.type === 'credit'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
                            }`}
                            title="Click to toggle between Bank Deposit and Payment"
                          >
                            {tx.type === 'credit' ? (
                              <>
                                <ArrowDownRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Bank Deposit</span>
                              </>
                            ) : (
                              <>
                                <ArrowUpRight className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Payment</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Inline Actions */}
                        <div className="flex items-center gap-1 opacity-70 hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handleStartEditRow(originalIdx)}
                            className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                            title="Edit transaction details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(originalIdx)}
                            className="p-1 rounded text-stone-400 hover:text-red-600 cursor-pointer"
                            title="Remove transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredTransactionsWithIndex.length === 0 && (
                  <div className="p-6 text-center text-xs text-stone-500">
                    No transactions match the selected filter.
                  </div>
                )}
              </div>

              {/* Import Summary KPIs */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700 text-xs">
                <div>
                  <span className="text-stone-500 block">Total Bank Deposits (Credits):</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 font-tabular text-sm">
                    +{formatCurrency(selectedCredits, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block">Total Payments (Debits):</span>
                  <span className="font-bold text-stone-900 dark:text-stone-100 font-tabular text-sm">
                    -{formatCurrency(selectedDebits, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-stone-50 dark:bg-stone-800/50 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-semibold hover:bg-stone-100 transition cursor-pointer"
          >
            Cancel
          </button>

          {scanResult && (
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-5 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Import All {selectedCount} Transactions</span>
            </button>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Page Inspection */}
      {previewPage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewPage(null)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-2xl max-w-2xl w-full p-4 space-y-3 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                {previewPage.name} Preview
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPage(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-stone-100 dark:bg-stone-800 rounded-xl p-2 flex items-center justify-center min-h-[300px]">
              {previewPage.dataUrl ? (
                <img
                  src={previewPage.dataUrl}
                  alt={previewPage.name}
                  className="max-h-[70vh] object-contain rounded"
                />
              ) : (
                <div className="text-center p-8 text-stone-400">
                  <FileText className="w-16 h-16 mx-auto mb-2 text-stone-400" />
                  <p className="text-xs">Sample Statement Data (No image file attached)</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewPage(null)}
                className="px-4 py-2 rounded-xl bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
