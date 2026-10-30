import React, { useState, useEffect, useRef } from 'react';
import {
  PurchaseItem,
  ExpenseCategory,
  BankAccount,
  PaymentMethod,
  TaxSettings,
  TaxDeductibility,
} from '../../types';
import {
  formatCurrency,
  formatDate,
  PAYMENT_METHOD_LABELS,
  getPurchaseBankAmount,
  getPurchaseCashAmount,
  getPurchasePaymentType,
  PurchaseTenderType,
} from '../../utils/formatters';
import { compressImage } from '../../utils/imageUtils';
import { scanReceiptWithAI } from '../../utils/aiApi';
import { Modal } from '../common/Modal';
import {
  Plus,
  Search,
  Receipt,
  Trash2,
  Camera,
  Pencil,
  Image as ImageIcon,
  Eye,
  CheckCircle2,
  Loader2,
  X,
  ExternalLink,
  Sparkles,
  Calendar,
  Filter,
  AlertTriangle,
  Landmark,
  Coins,
  Split,
  ArrowRightLeft,
  ShieldCheck,
  Check,
} from 'lucide-react';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'inventory_cogs', label: 'Inventory & Stock for Resale (COGS)' },
  { id: 'rent_lease', label: 'Store / Office Rent & Lease' },
  { id: 'utilities', label: 'Electricity, Water & Utilities' },
  { id: 'packaging_supplies', label: 'Packaging, Bags & Boxes' },
  { id: 'marketing_ads', label: 'Marketing, Ads & Promotions' },
  { id: 'equipment_repairs', label: 'Equipment, Hardware & Repairs' },
  { id: 'logistics_transport', label: 'Transport, Delivery & Fuel' },
  { id: 'professional_fees', label: 'Legal, Accounting & Professional Fees' },
  { id: 'meals_entertainment', label: 'Business Meals & Entertainment (50% Limited)' },
  { id: 'other_operational', label: 'Other Operational Expenses' },
];

interface PurchaseManagerProps {
  purchases: PurchaseItem[];
  bankAccounts: BankAccount[];
  settings: TaxSettings;
  onAddPurchase: (purchase: PurchaseItem) => void;
  onUpdatePurchase: (purchase: PurchaseItem) => void;
  onDeletePurchase: (id: string) => void;
  isAddPurchaseOpen: boolean;
  setIsAddPurchaseOpen: (open: boolean) => void;
  initialEditingPurchase?: PurchaseItem | null;
  onClearInitialEditingPurchase?: () => void;
}

export const PurchaseManager: React.FC<PurchaseManagerProps> = ({
  purchases,
  bankAccounts,
  settings,
  onAddPurchase,
  onUpdatePurchase,
  onDeletePurchase,
  isAddPurchaseOpen,
  setIsAddPurchaseOpen,
  initialEditingPurchase,
  onClearInitialEditingPurchase,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<'all' | 'vendor' | 'tin'>('all');
  const [deductibleFilter, setDeductibleFilter] = useState<string>('all');
  const [tenderFilter, setTenderFilter] = useState<'all' | 'cash' | 'bank' | 'split'>('all');
  const [dateFilterMode, setDateFilterMode] = useState<
    'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'range' | 'custom'
  >('all');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Editing Purchase State
  const [editingPurchase, setEditingPurchase] = useState<PurchaseItem | null>(null);

  // Add / Edit Purchase Form State
  const [invoiceNumber, setInvoiceNumber] = useState(`FS-${Math.floor(10000 + Math.random() * 90000)}`);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [vendorName, setVendorName] = useState('');
  const [vendorTin, setVendorTin] = useState('');
  const [itemName, setItemName] = useState('Stock Materials & Inventory');
  const [category, setCategory] = useState<ExpenseCategory>('inventory_cogs');
  const [totalInputAmount, setTotalInputAmount] = useState<number>(0);
  const [taxRatePercent, setTaxRatePercent] = useState(Math.round(settings.defaultSalesTaxRate * 100));
  const [deductibility, setDeductibility] = useState<TaxDeductibility>('fully_deductible');
  
  // Payment Tender & Bank / Cash Allocation State
  const [paymentTender, setPaymentTender] = useState<PurchaseTenderType>('cash');
  const [bankAmount, setBankAmount] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [selectedBankId, setSelectedBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isExtractingAI, setIsExtractingAI] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [previewReceiptModal, setPreviewReceiptModal] = useState<{
    image: string;
    title: string;
    date: string;
    amount: number;
    invoiceNumber: string;
  } | null>(null);

  // Separate refs for Camera (capture="environment") vs Gallery
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scanOnlyInputRef = useRef<HTMLInputElement>(null);

  const handleTotalAmountChange = (newTotal: number) => {
    setTotalInputAmount(newTotal);
    if (paymentTender === 'cash') {
      setCashAmount(newTotal);
      setBankAmount(0);
    } else if (paymentTender === 'bank') {
      setBankAmount(newTotal);
      setCashAmount(0);
    } else {
      // Split mode: clamp bank portion to new total, remainder to cash
      const clampedBank = Math.min(Math.max(0, bankAmount), newTotal);
      setBankAmount(clampedBank);
      setCashAmount(Math.max(0, newTotal - clampedBank));
    }
  };

  const handleSwitchTender = (newTender: PurchaseTenderType) => {
    setPaymentTender(newTender);
    if (newTender === 'cash') {
      setCashAmount(totalInputAmount);
      setBankAmount(0);
    } else if (newTender === 'bank') {
      setBankAmount(totalInputAmount);
      setCashAmount(0);
    } else {
      // Split mode: intelligent initial distribution
      if (totalInputAmount > 50000) {
        // Under Ethiopian tax rules, single cash purchase > 50k is prohibited. Set Cash to 50k max and Bank to remainder!
        setCashAmount(50000);
        setBankAmount(Math.max(0, totalInputAmount - 50000));
      } else {
        const half = Math.round((totalInputAmount / 2) * 100) / 100;
        setBankAmount(half);
        setCashAmount(Math.max(0, totalInputAmount - half));
      }
    }
  };

  const handleBankAmountChange = (val: number) => {
    const clampedBank = Math.min(Math.max(0, val), totalInputAmount);
    setBankAmount(clampedBank);
    setCashAmount(Math.max(0, totalInputAmount - clampedBank));
  };

  const handleCashAmountChange = (val: number) => {
    const clampedCash = Math.min(Math.max(0, val), totalInputAmount);
    setCashAmount(clampedCash);
    setBankAmount(Math.max(0, totalInputAmount - clampedCash));
  };

  const handleQuick5050 = () => {
    const half = Math.round((totalInputAmount / 2) * 100) / 100;
    setBankAmount(half);
    setCashAmount(Math.max(0, totalInputAmount - half));
  };

  const handleQuickMaxCash = () => {
    const maxCash = Math.min(50000, totalInputAmount);
    setCashAmount(maxCash);
    setBankAmount(Math.max(0, totalInputAmount - maxCash));
  };

  const handleQuickAllBank = () => {
    setBankAmount(totalInputAmount);
    setCashAmount(0);
  };

  const handleQuickAllCash = () => {
    setCashAmount(totalInputAmount);
    setBankAmount(0);
  };

  const openEditPurchaseModal = (pur: PurchaseItem) => {
    setEditingPurchase(pur);
    setInvoiceNumber(pur.invoiceNumber);
    setPurchaseDate(pur.date);
    setVendorName(pur.vendorName);
    setVendorTin(pur.vendorTin || '');
    setItemName(pur.itemName || 'Stock Materials & Inventory');
    setCategory(pur.category || 'inventory_cogs');
    setTotalInputAmount(pur.totalAmount);
    setTaxRatePercent(Math.round((pur.taxRate ?? settings.defaultSalesTaxRate) * 100));
    setDeductibility(pur.deductibility);

    const bAmt = getPurchaseBankAmount(pur);
    const cAmt = getPurchaseCashAmount(pur);
    const pType = getPurchasePaymentType(pur);
    setPaymentTender(pType);
    setBankAmount(bAmt);
    setCashAmount(cAmt);

    setSelectedBankId(pur.bankAccountId || bankAccounts[0]?.id || '');
    setReceiptImage(pur.receiptImage || '');
    setNotes(pur.notes || '');
    setAiNotice(null);
    setIsAddPurchaseOpen(true);
  };

  useEffect(() => {
    if (initialEditingPurchase) {
      openEditPurchaseModal(initialEditingPurchase);
      onClearInitialEditingPurchase?.();
    }
  }, [initialEditingPurchase]);

  const openNewPurchaseModal = () => {
    setEditingPurchase(null);
    setInvoiceNumber(`FS-${Math.floor(10000 + Math.random() * 90000)}`);
    setPurchaseDate(today);
    setVendorName('');
    setVendorTin('');
    setItemName('Stock Materials & Inventory');
    setCategory('inventory_cogs');
    setTotalInputAmount(0);
    setPaymentTender('cash');
    setBankAmount(0);
    setCashAmount(0);
    setTaxRatePercent(Math.round(settings.defaultSalesTaxRate * 100));
    setDeductibility('fully_deductible');
    setSelectedBankId(bankAccounts[0]?.id || '');
    setReceiptImage('');
    setNotes('');
    setAiNotice(null);
    setIsAddPurchaseOpen(true);
  };

  // Math from Total Amount
  const rateDecimal = taxRatePercent / 100;
  const totalAmount = totalInputAmount;
  const subtotal = rateDecimal > 0 ? totalAmount / (1 + rateDecimal) : totalAmount;
  const taxAmount = totalAmount - subtotal;

  const getDeductiblePercent = (ded: TaxDeductibility): number => {
    if (ded === 'non_deductible') return 0;
    if (ded === 'partially_deductible') return 50;
    return 100;
  };

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];
  const currentYearMonth = today.substring(0, 7); // e.g. "2026-10"

  const currentYear = today.substring(0, 4);

  const filteredPurchases = purchases.filter((item) => {
    // 1. Deductibility Filter
    if (deductibleFilter !== 'all' && item.deductibility !== deductibleFilter) return false;

    // 2. Payment Tender Filter (Cash vs Bank vs Split)
    if (tenderFilter === 'cash' && getPurchaseCashAmount(item) <= 0) return false;
    if (tenderFilter === 'bank' && getPurchaseBankAmount(item) <= 0) return false;
    if (tenderFilter === 'split' && getPurchasePaymentType(item) !== 'split') return false;

    // 3. Date Filter
    if (dateFilterMode === 'today' && item.date !== today) return false;
    if (dateFilterMode === 'yesterday' && item.date !== yesterday) return false;
    if (dateFilterMode === 'this_week') {
      const itemTime = new Date(item.date).getTime();
      const nowTime = new Date(today).getTime();
      const diffDays = (nowTime - itemTime) / (1000 * 3600 * 24);
      if (diffDays < 0 || diffDays > 7) return false;
    }
    if (dateFilterMode === 'this_month' && !item.date.startsWith(currentYearMonth)) return false;
    if (dateFilterMode === 'this_year' && !item.date.startsWith(currentYear)) return false;
    if (dateFilterMode === 'custom' && filterDate && item.date !== filterDate) return false;
    if (dateFilterMode === 'range') {
      if (filterStartDate && item.date < filterStartDate) return false;
      if (filterEndDate && item.date > filterEndDate) return false;
    }
    if (filterDate && dateFilterMode === 'custom' && item.date !== filterDate) return false;

    // 4. Search Query (Supplier Name, Supplier TIN, Invoice #, Item, or Date)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchVendor = item.vendorName.toLowerCase().includes(q);
      const matchTin = (item.vendorTin || '').toLowerCase().includes(q);
      const matchInv = item.invoiceNumber.toLowerCase().includes(q);
      const matchItem = (item.itemName || '').toLowerCase().includes(q);
      const matchDate =
        item.date.includes(q) ||
        formatDate(item.date).toLowerCase().includes(q);

      if (searchField === 'vendor') {
        if (!matchVendor) return false;
      } else if (searchField === 'tin') {
        if (!matchTin) return false;
      } else {
        if (!matchVendor && !matchTin && !matchInv && !matchItem && !matchDate) return false;
      }
    }
    return true;
  });

  // Always sorted strictly by date: recent to old
  const sortedPurchases = [...filteredPurchases].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)
  );

  // KPI Calculations
  const totalPurchasedAmount = filteredPurchases.reduce((acc, p) => acc + p.totalAmount, 0);
  const totalPurchasedCash = filteredPurchases.reduce((acc, p) => acc + getPurchaseCashAmount(p), 0);
  const totalPurchasedBank = filteredPurchases.reduce((acc, p) => acc + getPurchaseBankAmount(p), 0);
  const totalDeductibleExpense = filteredPurchases.reduce(
    (acc, p) => acc + p.subtotal * (p.deductiblePercentage / 100),
    0
  );
  const totalInputTaxClaimable = filteredPurchases.reduce((acc, p) => acc + p.taxAmount, 0);

  const handleAIExtractFromReceipt = async (imageSrc?: string) => {
    const targetImage = imageSrc || receiptImage;
    if (!targetImage) return;

    try {
      setIsExtractingAI(true);
      setAiNotice(null);
      const extracted = await scanReceiptWithAI(targetImage);

      if (extracted.vendorName) setVendorName(extracted.vendorName);
      if (extracted.vendorTin) setVendorTin(extracted.vendorTin);
      if (extracted.invoiceNumber) setInvoiceNumber(extracted.invoiceNumber);
      if (extracted.date) setPurchaseDate(extracted.date);
      if (typeof extracted.amount === 'number' && extracted.amount > 0) {
        handleTotalAmountChange(extracted.amount);
      }
      if (extracted.itemName) setItemName(extracted.itemName);
      if (extracted.category) setCategory(extracted.category);
      if (extracted.deductibility) {
        setDeductibility(extracted.deductibility);
      }
      if (extracted.notes) {
        setNotes((prev) => (prev ? `${prev} · ${extracted.notes}` : extracted.notes || ''));
      }
      setAiNotice(
        `AI successfully extracted receipt: ${extracted.vendorName || 'Supplier'} · ${formatCurrency(extracted.amount || 0, settings.currencySymbol)}`
      );
    } catch (err: any) {
      console.warn('AI Extraction notice:', err);
      setAiNotice(`AI scan note: ${err.message || 'Could not parse all receipt fields'}`);
    } finally {
      setIsExtractingAI(false);
    }
  };

  const handleImageFile = async (file: File | null | undefined, autoScanWithAI = false) => {
    if (!file) return;
    try {
      setIsProcessingImage(true);
      const optimized = await compressImage(file, 1280, 1280, 0.82);
      setReceiptImage(optimized);
      if (autoScanWithAI) {
        await handleAIExtractFromReceipt(optimized);
      }
    } catch (err) {
      console.error('Failed to process receipt image:', err);
      // Fallback to FileReader if compression fails
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        setReceiptImage(res);
        if (autoScanWithAI) {
          handleAIExtractFromReceipt(res);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessingImage(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (scanOnlyInputRef.current) scanOnlyInputRef.current.value = '';
    }
  };

  const handleClearReceipt = () => {
    setReceiptImage('');
    setAiNotice(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (scanOnlyInputRef.current) scanOnlyInputRef.current.value = '';
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAmount <= 0) return;

    const deductiblePercentage = getDeductiblePercent(deductibility);

    let resolvedBank = 0;
    let resolvedCash = 0;
    if (paymentTender === 'cash') {
      resolvedCash = totalAmount;
      resolvedBank = 0;
    } else if (paymentTender === 'bank') {
      resolvedBank = totalAmount;
      resolvedCash = 0;
    } else {
      resolvedBank = Math.min(Math.max(0, Number(bankAmount) || 0), totalAmount);
      resolvedCash = Math.max(0, totalAmount - resolvedBank);
    }

    const method: PaymentMethod =
      resolvedBank > 0 && resolvedCash === 0 ? 'bank_transfer' : 'cash';

    const chosenBankId = resolvedBank > 0 ? (selectedBankId || bankAccounts[0]?.id) : undefined;

    const purchaseRecord: PurchaseItem = {
      id: editingPurchase ? editingPurchase.id : `pur-${Date.now()}`,
      invoiceNumber: invoiceNumber.trim() || `FS-${Math.floor(10000 + Math.random() * 90000)}`,
      date: purchaseDate,
      vendorName: vendorName.trim() || 'Supplier',
      vendorTin: vendorTin.trim() || undefined,
      itemName: itemName.trim() || 'Purchase / Expense',
      category,
      quantity: editingPurchase?.quantity || 1,
      unitCost: Number(subtotal.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      taxRate: rateDecimal,
      taxAmount: Number(taxAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      cashAmount: Number(resolvedCash.toFixed(2)),
      bankAmount: Number(resolvedBank.toFixed(2)),
      deductibility,
      deductiblePercentage,
      paymentMethod: method,
      bankAccountId: chosenBankId,
      isReconciledWithBank: resolvedBank > 0 && !!chosenBankId,
      receiptImage: receiptImage || undefined,
      notes,
      createdAt: editingPurchase ? editingPurchase.createdAt : Date.now(),
    };

    if (editingPurchase) {
      onUpdatePurchase(purchaseRecord);
    } else {
      onAddPurchase(purchaseRecord);
    }

    setEditingPurchase(null);
    setIsAddPurchaseOpen(false);

    setInvoiceNumber(`FS-${Math.floor(10000 + Math.random() * 90000)}`);
    setVendorName('');
    setVendorTin('');
    setItemName('Stock Materials & Inventory');
    setCategory('inventory_cogs');
    setTotalInputAmount(0);
    setPaymentTender('cash');
    setBankAmount(0);
    setCashAmount(0);
    setReceiptImage('');
    setNotes('');
    setAiNotice(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-stone-200">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">
            Wholesale Building Materials & Expenses <span aria-hidden="true">·</span> Input VAT Credit Tracking
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Purchased Items & COGS Register
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={scanOnlyInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                openNewPurchaseModal();
                handleImageFile(file, true);
              }
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => scanOnlyInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-semibold hover:brightness-105 transition shadow-sm whitespace-nowrap min-h-[40px] cursor-pointer"
            title="Snap a photo or select receipt to auto-extract with Free Gemini 3.8 Flash AI"
          >
            <Sparkles className="w-4 h-4 text-amber-200 shrink-0" />
            <span>Scan Receipt (Free AI)</span>
          </button>

          <button
            onClick={openNewPurchaseModal}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Log Purchase</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Total Purchased Outflow</span>
            <span className="font-semibold text-stone-700">{filteredPurchases.length} invoices</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-stone-900 font-tabular">
            {formatCurrency(totalPurchasedAmount, settings.currencySymbol)}
          </p>
          <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-600 font-tabular">
            <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
              <Coins className="w-3 h-3" />
              <span>Cash: {formatCurrency(totalPurchasedCash, settings.currencySymbol)}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-purple-900 font-semibold">
              <Landmark className="w-3 h-3" />
              <span>Bank: {formatCurrency(totalPurchasedBank, settings.currencySymbol)}</span>
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-stone-200">
          <span className="text-xs text-stone-500">Allowable Tax Deduction</span>
          <p className="text-xl font-bold text-emerald-700 font-tabular mt-1">
            {formatCurrency(totalDeductibleExpense, settings.currencySymbol)}
          </p>
          <span className="text-xs text-stone-500">Reduces net taxable business profit</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-stone-200">
          <span className="text-xs text-stone-500">Claimable Input VAT Credits</span>
          <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
            {formatCurrency(totalInputTaxClaimable, settings.currencySymbol)}
          </p>
          <span className="text-xs text-stone-500">Offsets Output VAT on sales</span>
        </div>
      </div>

      {/* Search and Date & Deductibility Filter Toolbar */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
        {/* Row 1: Search Input & Target Scope Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchField === 'vendor'
                  ? 'Search by supplier / vendor name (e.g. Dangote Cement)...'
                  : searchField === 'tin'
                  ? 'Search by supplier TIN number (e.g. 0002847192)...'
                  : 'Search by supplier name, supplier TIN, invoice #, or date...'
              }
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-orange-700 focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Scope Filter Buttons */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200 shrink-0">
            <button
              type="button"
              onClick={() => setSearchField('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                searchField === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All Fields
            </button>
            <button
              type="button"
              onClick={() => setSearchField('vendor')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                searchField === 'vendor'
                  ? 'bg-white text-orange-900 shadow-xs border border-orange-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              title="Search strictly by supplier / vendor name"
            >
              Supplier Name
            </button>
            <button
              type="button"
              onClick={() => setSearchField('tin')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                searchField === 'tin'
                  ? 'bg-white text-orange-900 shadow-xs border border-orange-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              title="Search strictly by supplier TIN number"
            >
              Supplier TIN
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Tender Filter: All / Cash / Bank / Split */}
            <select
              value={tenderFilter}
              onChange={(e) => setTenderFilter(e.target.value as any)}
              className="bg-white border border-stone-300 text-stone-800 text-xs rounded-xl px-3 py-2.5 focus:outline-none shrink-0 font-medium"
              title="Filter by payment source: Cash, Bank, or Split"
            >
              <option value="all">All Tenders (Cash &amp; Bank)</option>
              <option value="cash">Cash Outflows (Drawer)</option>
              <option value="bank">Bank Transfers / Cheques</option>
              <option value="split">Split (Bank &amp; Cash)</option>
            </select>

            <select
              value={deductibleFilter}
              onChange={(e) => setDeductibleFilter(e.target.value)}
              className="bg-white border border-stone-300 text-stone-800 text-xs rounded-xl px-3 py-2.5 focus:outline-none shrink-0"
            >
              <option value="all">All Deductibility</option>
              <option value="fully_deductible">100% Deductible</option>
              <option value="partially_deductible">50% Meals Limit</option>
              <option value="non_deductible">Non-Deductible</option>
            </select>
          </div>
        </div>

        {/* Row 2: Date Filter Bar with Presets & Range */}
        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-stone-500 font-semibold shrink-0">
            <Calendar className="w-3.5 h-3.5 text-orange-700" />
            <span>Filter by Date:</span>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('all');
                setFilterDate('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'all' && !filterDate && !filterStartDate
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('today');
                setFilterDate(today);
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'today'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('yesterday');
                setFilterDate(yesterday);
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'yesterday'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('this_week');
                setFilterDate('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'this_week'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('this_month');
                setFilterDate('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'this_month'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('this_year');
                setFilterDate('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'this_year'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              This Year
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('range');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                dateFilterMode === 'range'
                  ? 'bg-white text-orange-950 shadow-xs border border-orange-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Date Range
            </button>
          </div>

          {/* Range Inputs or Single Date Picker */}
          {dateFilterMode === 'range' ? (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 bg-orange-50/60 p-1 rounded-lg border border-orange-200">
              <span className="text-[11px] text-stone-600 font-medium">From:</span>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="bg-white border border-stone-300 text-stone-800 text-xs rounded-md px-2 py-0.5 focus:outline-none"
              />
              <span className="text-[11px] text-stone-600 font-medium">To:</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="bg-white border border-stone-300 text-stone-800 text-xs rounded-md px-2 py-0.5 focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setDateFilterMode(e.target.value ? 'custom' : 'all');
                }}
                title="Pick a specific date to filter purchases"
                className="bg-white border border-stone-300 text-stone-800 text-xs rounded-lg px-2.5 py-1 focus:outline-none"
              />
            </div>
          )}

          {/* Active Filter Reset */}
          {(dateFilterMode !== 'all' ||
            filterDate ||
            filterStartDate ||
            filterEndDate ||
            searchQuery ||
            searchField !== 'all' ||
            tenderFilter !== 'all' ||
            deductibleFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('all');
                setFilterDate('');
                setFilterStartDate('');
                setFilterEndDate('');
                setSearchQuery('');
                setSearchField('all');
                setTenderFilter('all');
                setDeductibleFilter('all');
              }}
              className="px-2.5 py-1 text-xs text-orange-800 hover:text-orange-950 bg-orange-50 hover:bg-orange-100 rounded-md border border-orange-200 transition cursor-pointer flex items-center gap-1 ml-auto"
            >
              <X className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        {/* Active Filter Indicators */}
        {(searchQuery || dateFilterMode !== 'all' || filterDate || filterStartDate || tenderFilter !== 'all') && (
          <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
            <span className="font-semibold text-stone-700">Active Criteria:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-medium">
                {searchField === 'vendor'
                  ? `Supplier: "${searchQuery}"`
                  : searchField === 'tin'
                  ? `TIN: "${searchQuery}"`
                  : `Search: "${searchQuery}"`}
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="hover:text-amber-950 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}
            {tenderFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 font-medium">
                Tender: {tenderFilter === 'cash' ? 'Cash Only' : tenderFilter === 'bank' ? 'Bank Only' : 'Split Payments'}
              </span>
            )}
            {dateFilterMode === 'range' && (filterStartDate || filterEndDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 font-medium">
                {filterStartDate || 'Start'} to {filterEndDate || 'Latest'}
              </span>
            )}
            {dateFilterMode !== 'range' && (filterDate || dateFilterMode !== 'all') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 font-medium">
                Date: {filterDate || dateFilterMode.replace('_', ' ')}
              </span>
            )}
            <span className="text-stone-400">·</span>
            <span className="font-bold text-stone-800">
              {filteredPurchases.length} invoices matching
            </span>
            <span className="text-stone-500 font-tabular font-medium">
              · {formatCurrency(totalPurchasedAmount, settings.currencySymbol)}
            </span>
          </div>
        )}
      </div>

      {/* Purchases List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-stone-500 font-medium px-1">
          <span>{sortedPurchases.length} supplier invoices</span>
          <span>Sorted: Most Recent First</span>
        </div>
        {sortedPurchases.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-stone-200 text-center space-y-2">
            <Receipt className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="text-sm font-semibold text-stone-800">No Purchases Found</p>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Click &quot;Log Purchase&quot; to register supplier purchases and receipts.
            </p>
          </div>
        ) : (
          sortedPurchases.map((pur) => {
            const bankAmt = getPurchaseBankAmount(pur);
            const cashAmt = getPurchaseCashAmount(pur);
            const payType = getPurchasePaymentType(pur);
            const bankAcc = pur.bankAccountId ? bankAccounts.find((a) => a.id === pur.bankAccountId) : null;

            return (
              <div
                key={pur.id}
                className="p-4 rounded-2xl bg-white border border-stone-200 hover:border-stone-300 transition space-y-2.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span className="font-mono font-bold text-stone-900 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                        {pur.invoiceNumber}
                      </span>
                      {pur.vendorTin && (
                        <span
                          className={`font-mono px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            searchQuery &&
                            pur.vendorTin.toLowerCase().includes(searchQuery.toLowerCase().trim())
                              ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300'
                              : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                          title="Supplier Tax Identification Number (TIN)"
                        >
                          TIN: {pur.vendorTin}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-stone-400" />
                        <span>{formatDate(pur.date)}</span>
                      </span>
                      <span aria-hidden="true">·</span>

                      {/* Payment Tender Badge with Cash and/or Bank breakdown */}
                      {payType === 'split' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          <Split className="w-3 h-3 text-purple-700" />
                          <span>
                            Bank: {formatCurrency(bankAmt, settings.currencySymbol)}{bankAcc ? ` (${bankAcc.name})` : ''} · Cash: {formatCurrency(cashAmt, settings.currencySymbol)}
                          </span>
                        </span>
                      ) : payType === 'bank' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          <Landmark className="w-3 h-3 text-purple-700" />
                          <span>Bank: {formatCurrency(bankAmt, settings.currencySymbol)}{bankAcc ? ` (${bankAcc.name})` : ''}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Coins className="w-3 h-3 text-emerald-700" />
                          <span>Cash: {formatCurrency(cashAmt, settings.currencySymbol)}</span>
                        </span>
                      )}

                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-medium">{pur.deductiblePercentage}% Deductible</span>

                      {/* Statutory Single Cash Purchase Audit Warning (> 50k ETB on Cash portion) */}
                      {cashAmt > 50000 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className="inline-flex items-center gap-1 font-mono px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300"
                            title="Audit Flag: Single cash purchase portion exceeds ETB 50,000 threshold. Under Ethiopian banking & tax regulations, cash transactions over ETB 50,000 must be settled via bank transfer."
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Flagged: Cash Portion ({formatCurrency(cashAmt, settings.currencySymbol)}) &gt; 50k ETB
                          </span>
                        </>
                      )}

                      {/* Compliant Split Badge if invoice > 50k but cash <= 50k */}
                      {payType === 'split' && cashAmt <= 50000 && pur.totalAmount > 50000 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className="inline-flex items-center gap-1 font-mono px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                            title="Compliant: Invoice total exceeds ETB 50k, but cash payment was kept under 50k and remainder settled via banking channels."
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Compliant Split (Cash ≤ 50k)
                          </span>
                        </>
                      )}
                    </div>

                    <h3
                      className={`text-sm font-bold mt-1 ${
                        searchQuery &&
                        pur.vendorName.toLowerCase().includes(searchQuery.toLowerCase().trim())
                          ? 'text-orange-950 underline decoration-amber-400 decoration-2'
                          : 'text-stone-900'
                      }`}
                    >
                      {pur.vendorName}
                    </h3>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base font-bold text-stone-900 font-tabular block">
                      {formatCurrency(pur.totalAmount, settings.currencySymbol)}
                    </span>
                    <span className="text-xs text-stone-500 font-tabular">
                      Input VAT: +{formatCurrency(pur.taxAmount, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs text-stone-500">
                  <div className="flex items-center gap-2 min-w-0">
                    {pur.receiptImage ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewReceiptModal({
                            image: pur.receiptImage!,
                            title: pur.vendorName,
                            invoiceNumber: pur.invoiceNumber,
                            date: pur.date,
                            amount: pur.totalAmount,
                          })
                        }
                        title="Click to view attached receipt photo"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-xs font-semibold transition cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-orange-700 shrink-0" />
                        <span>View Attached Receipt</span>
                      </button>
                    ) : (
                      <span className="text-stone-400 text-xs">
                        {pur.notes ? pur.notes : 'No receipt photo attached (Optional)'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEditPurchaseModal(pur)}
                      title="Edit purchase entry"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 font-semibold transition"
                    >
                      <Pencil className="w-3.5 h-3.5 text-orange-700" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDeletePurchase(pur.id)}
                      className="p-1.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition"
                      title="Delete purchase entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Purchase Modal */}
      <Modal
        isOpen={isAddPurchaseOpen}
        onClose={() => {
          setEditingPurchase(null);
          setIsAddPurchaseOpen(false);
        }}
        title={editingPurchase ? 'Edit Purchase Entry' : 'Log Purchase'}
        subtitle="Register supplier name, supplier TIN, invoice / FS number, and total amount"
      >
        <form onSubmit={handleSavePurchase} className="space-y-3.5">
          {aiNotice && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 text-orange-950 text-xs flex items-center justify-between gap-2 animate-fadeIn">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-orange-700 shrink-0" />
                <span className="font-medium truncate">{aiNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiNotice(null)}
                className="text-stone-400 hover:text-stone-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Item Description / Expense Name *</span>
              <input
                type="text"
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Stock Cement / Inventory"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
              />
            </div>
            <div>
              <span className="text-xs text-stone-600">Expense Category *</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Vendor / Supplier Name *</span>
              <input
                type="text"
                required
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Mugher Cement Enterprise"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
              />
            </div>
            <div>
              <span className="text-xs text-stone-600">Supplier TIN *</span>
              <input
                type="text"
                required
                inputMode="numeric"
                value={vendorTin}
                onChange={(e) => setVendorTin(e.target.value)}
                placeholder="e.g. 0004192831"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-900 font-bold focus:outline-none focus:border-orange-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Invoice Number / FS Number *</span>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. FS-00048291"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-900 font-bold focus:outline-none focus:border-orange-700"
              />
            </div>
            <div>
              <span className="text-xs text-stone-600">Purchase Date</span>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1 w-full px-2.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Total Purchase Amount ({settings.currencySymbol.trim()}) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                required
                value={totalInputAmount || ''}
                onChange={(e) => handleTotalAmountChange(parseFloat(e.target.value || '0'))}
                placeholder="0.00"
                className="mt-1 w-full px-2.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 font-bold font-tabular focus:outline-none focus:border-orange-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-stone-600">Input Tax (%)</span>
                <input
                  type="number"
                  min="0"
                  max="40"
                  inputMode="numeric"
                  value={taxRatePercent}
                  onChange={(e) => setTaxRatePercent(parseInt(e.target.value || '0', 10))}
                  className="mt-1 w-full px-2.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 font-tabular"
                />
              </div>

              <div>
                <span className="text-xs text-stone-600">Deductibility</span>
                <select
                  value={deductibility}
                  onChange={(e) => setDeductibility(e.target.value as TaxDeductibility)}
                  className="mt-1 w-full px-2 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 truncate"
                >
                  <option value="fully_deductible">100% Tax Deductible</option>
                  <option value="partially_deductible">50% Meals Limit</option>
                  <option value="non_deductible">Non-Deductible</option>
                </select>
              </div>
            </div>
          </div>

          {/* Payment Tender: Cash, Bank Transfer, or Split Bank & Cash */}
          <div className="p-4 rounded-2xl bg-white border-2 border-stone-200 focus-within:border-orange-600 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-orange-700" />
                <span>How was this expense paid? (Bank and/or Cash) *</span>
              </label>
              <span className="text-[11px] font-semibold text-stone-500">
                {paymentTender === 'cash'
                  ? 'Paid 100% Cash'
                  : paymentTender === 'bank'
                  ? 'Paid 100% Bank'
                  : 'Paid via Bank & Cash (Split)'}
              </span>
            </div>

            {/* 3-Way Segment Switcher */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-stone-100 border border-stone-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleSwitchTender('cash')}
                className={`py-2 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  paymentTender === 'cash'
                    ? 'bg-white text-emerald-800 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Coins className="w-3.5 h-3.5 text-emerald-700" />
                <span>Cash Only</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTender('bank')}
                className={`py-2 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  paymentTender === 'bank'
                    ? 'bg-white text-purple-900 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Landmark className="w-3.5 h-3.5 text-purple-700" />
                <span>Bank Only</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTender('split')}
                className={`py-2 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  paymentTender === 'split'
                    ? 'bg-white text-orange-950 shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Split className="w-3.5 h-3.5 text-orange-700" />
                <span>Bank &amp; Cash</span>
              </button>
            </div>

            {/* Bank Only Mode: Select Bank Account */}
            {paymentTender === 'bank' && (
              <div className="space-y-2 pt-1 animate-fadeIn">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-purple-950 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-purple-700" />
                    <span>Paid From Business Bank Account:</span>
                  </span>
                  <span className="font-bold text-purple-900 font-tabular">
                    {formatCurrency(totalAmount, settings.currencySymbol)}
                  </span>
                </div>
                {bankAccounts.length > 0 ? (
                  <select
                    value={selectedBankId || bankAccounts[0]?.id || ''}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-purple-50/50 border border-purple-200 text-xs text-stone-900 focus:outline-none focus:border-purple-600 font-medium"
                  >
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — {acc.bankName} (Balance: {formatCurrency(acc.currentBalance, settings.currencySymbol)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-stone-500 italic">
                    Primary CBE checking account will be linked automatically.
                  </p>
                )}
                <p className="text-[11px] text-stone-500">
                  Transferred via CBE Birr, Telebirr, Awash, or Cheque. Deducts directly from your bank ledger.
                </p>
              </div>
            )}

            {/* Cash Only Mode: Drawer Notice */}
            {paymentTender === 'cash' && (
              <div className="space-y-1 pt-1 animate-fadeIn">
                <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Deducted from Cash Register Drawer:</span>
                  </span>
                  <span className="font-bold text-emerald-950 font-tabular text-sm">
                    {formatCurrency(totalAmount, settings.currencySymbol)}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Physical cash paid out of daily retail register or petty cash safe.
                </p>
              </div>
            )}

            {/* Split Mode: Bank & Cash Breakdown */}
            {paymentTender === 'split' && (
              <div className="space-y-3 pt-1 animate-fadeIn">
                {/* Quick Split Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                  <span className="font-semibold text-stone-600">Quick Split:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleQuick5050}
                      className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium border border-stone-200 transition cursor-pointer"
                    >
                      50 / 50 Split
                    </button>
                    {totalAmount > 50000 && (
                      <button
                        type="button"
                        onClick={handleQuickMaxCash}
                        className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold border border-amber-300 transition cursor-pointer"
                        title="Set Cash to ETB 50,000 legal ceiling and Bank to remainder"
                      >
                        Max Cash (50k Limit)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleQuickAllBank}
                      className="px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-900 font-medium border border-purple-200 transition cursor-pointer"
                    >
                      All Bank
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAllCash}
                      className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-medium border border-emerald-200 transition cursor-pointer"
                    >
                      All Cash
                    </button>
                  </div>
                </div>

                {/* Input 1: Bank Portion */}
                <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-purple-700" />
                      <span>Amount Paid via Bank Transfer ({settings.currencySymbol.trim()})</span>
                    </label>
                    <span className="text-[11px] font-bold text-purple-900 font-tabular">
                      {totalAmount > 0 ? `${Math.round((bankAmount / totalAmount) * 100)}%` : '0%'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totalAmount}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={bankAmount || ''}
                    onChange={(e) => handleBankAmountChange(parseFloat(e.target.value || '0'))}
                    className="w-full text-lg font-bold text-stone-900 font-tabular bg-white px-3 py-1.5 rounded-lg border border-purple-200 focus:outline-none focus:border-purple-600"
                  />
                  {bankAccounts.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] text-stone-600 block mb-1">Deduct from account:</span>
                      <select
                        value={selectedBankId || bankAccounts[0]?.id || ''}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-purple-200 text-xs text-stone-900 focus:outline-none font-medium"
                      >
                        {bankAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} — {acc.bankName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Input 2: Cash Portion (Automatically synced) */}
                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Amount Paid via Physical Cash ({settings.currencySymbol.trim()})</span>
                    </label>
                    <span className="text-[11px] font-bold text-emerald-900 font-tabular">
                      {totalAmount > 0 ? `${Math.round((cashAmount / totalAmount) * 100)}%` : '0%'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totalAmount}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={cashAmount || ''}
                    onChange={(e) => handleCashAmountChange(parseFloat(e.target.value || '0'))}
                    className="w-full text-lg font-bold text-stone-900 font-tabular bg-white px-3 py-1.5 rounded-lg border border-emerald-200 focus:outline-none focus:border-emerald-600"
                  />
                  <div className="flex items-center justify-between text-[11px] text-stone-500 pt-0.5">
                    <span>Deducted from cash register drawer count</span>
                    <span className="font-semibold text-emerald-900">
                      Auto-balances with Total
                    </span>
                  </div>
                </div>

                {/* Visual Ratio Bar */}
                {totalAmount > 0 && (
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${Math.min(100, (bankAmount / totalAmount) * 100)}%` }}
                        className="bg-purple-600 transition-all duration-300"
                        title={`Bank: ${formatCurrency(bankAmount, settings.currencySymbol)}`}
                      />
                      <div
                        style={{ width: `${Math.min(100, (cashAmount / totalAmount) * 100)}%` }}
                        className="bg-emerald-600 transition-all duration-300"
                        title={`Cash: ${formatCurrency(cashAmount, settings.currencySymbol)}`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-stone-500 font-tabular">
                      <span className="text-purple-800 font-semibold">
                        Bank: {formatCurrency(bankAmount, settings.currencySymbol)}
                      </span>
                      <span className="text-emerald-800 font-semibold">
                        Cash: {formatCurrency(cashAmount, settings.currencySymbol)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Statutory Single Cash Purchase Audit Rule (> 50k ETB on Cash portion) */}
            {cashAmount > 50000 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-2.5 text-xs text-rose-950 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    MoR Audit Flag: Cash Portion ({formatCurrency(cashAmount, settings.currencySymbol)}) Exceeds ETB 50,000 Limit
                  </p>
                  <p className="text-[11px] text-rose-900 leading-relaxed">
                    Under Ethiopian tax directives (Proc. 979/2016 &amp; NBE directives), only single cash purchases exceeding ETB 50,000 are disallowed.
                    Increase the Bank Transfer portion to at least {formatCurrency(totalAmount - 50000, settings.currencySymbol)} so cash stays within the ETB 50,000 ceiling.
                  </p>
                  <button
                    type="button"
                    onClick={handleQuickMaxCash}
                    className="mt-1 px-2.5 py-1 rounded-md bg-rose-800 text-white font-semibold text-[11px] hover:bg-rose-900 transition cursor-pointer"
                  >
                    Auto-Adjust to ETB 50,000 Cash Limit
                  </button>
                </div>
              </div>
            )}

            {cashAmount > 0 && cashAmount <= 50000 && totalAmount > 50000 && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center gap-2 text-xs text-emerald-950 animate-fadeIn">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  <strong>Compliant Split:</strong> Cash portion ({formatCurrency(cashAmount, settings.currencySymbol)}) is within the statutory ETB 50,000 limit. Input VAT deduction is safeguarded.
                </span>
              </div>
            )}
          </div>

          {/* Receipt Image / Scanned Invoice Attachment (Optional) */}
          <div className="space-y-2 pt-1 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-orange-700" />
                <span>Attach Receipt Photo / Scanned Invoice</span>
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Optional
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-normal">
              Receipt photos are optional. On mobile or tablet, snap directly with your camera or choose from your photo gallery.
            </p>

            {/* Hidden Inputs for Direct Camera vs Photo Gallery */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleImageFile(e.target.files?.[0])}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageFile(e.target.files?.[0])}
              className="hidden"
            />

            {/* Display when receipt image is attached */}
            {receiptImage ? (
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewReceiptModal({
                          image: receiptImage,
                          title: vendorName ? `${vendorName} Receipt` : 'Receipt Preview',
                          invoiceNumber,
                          date: purchaseDate,
                          amount: totalAmount,
                        })
                      }
                      title="Click to view full receipt image"
                      className="relative w-14 h-14 rounded-lg overflow-hidden border border-stone-300 shadow-sm shrink-0 group cursor-pointer bg-white"
                    >
                      <img
                        src={receiptImage}
                        alt="Receipt Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                        <Eye className="w-4 h-4" />
                      </div>
                    </button>
                    <div className="min-w-0 text-xs">
                      <div className="flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Receipt photo attached</span>
                      </div>
                      <p className="text-[11px] text-stone-500 truncate">
                        Tap preview to view full image
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearReceipt}
                    title="Remove receipt photo (make entry receipt-free)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                {/* AI Extraction Button */}
                <div className="pt-2 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isExtractingAI}
                    onClick={() => handleAIExtractFromReceipt(receiptImage)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-105 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isExtractingAI ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>AI Scanning Receipt...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                        <span>Auto-Fill Details with AI</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={isProcessingImage || isExtractingAI}
                      className="inline-flex items-center gap-1 py-1 px-2 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 font-medium transition cursor-pointer"
                    >
                      <Camera className="w-3 h-3 text-orange-700 shrink-0" />
                      <span>Retake</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={isProcessingImage || isExtractingAI}
                      className="inline-flex items-center gap-1 py-1 px-2 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 font-medium transition cursor-pointer"
                    >
                      <ImageIcon className="w-3 h-3 text-stone-600 shrink-0" />
                      <span>Change</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Action buttons for Camera vs Gallery vs AI Scan */
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isProcessingImage}
                    className="flex items-center justify-center sm:justify-start gap-2.5 p-3 rounded-xl border border-stone-300 bg-stone-50 hover:bg-orange-50/50 hover:border-orange-300 text-stone-800 transition text-left cursor-pointer active:scale-[0.99]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 flex items-center gap-1">
                        <span>Take Photo</span>
                        <span className="text-[10px] text-orange-700 font-medium">(Camera)</span>
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Snap receipt on phone / tablet
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isProcessingImage}
                    className="flex items-center justify-center sm:justify-start gap-2.5 p-3 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 hover:border-stone-400 text-stone-800 transition text-left cursor-pointer active:scale-[0.99]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-stone-200 text-stone-700 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 flex items-center gap-1">
                        <span>Choose Gallery</span>
                        <span className="text-[10px] text-stone-500 font-medium">(Photos)</span>
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Pick from saved images
                      </div>
                    </div>
                  </button>
                </div>

                {/* Direct AI Scan Prompt */}
                <button
                  type="button"
                  onClick={() => scanOnlyInputRef.current?.click()}
                  disabled={isProcessingImage || isExtractingAI}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border border-orange-200 hover:border-orange-300 text-orange-950 text-xs font-semibold transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-orange-700 shrink-0" />
                  <span>Snap &amp; Auto-Extract All Details with Gemini AI</span>
                </button>

                {isProcessingImage && (
                  <div className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-700 shrink-0" />
                    <span>Compressing & preparing receipt photo...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <span className="text-xs text-stone-600">Note (Optional)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid on delivery"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1 text-xs">
            <div className="flex justify-between text-stone-600">
              <span>Amount Before Tax:</span>
              <span className="font-tabular font-medium text-stone-900">
                {formatCurrency(subtotal, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Claimable Input VAT ({taxRatePercent}%):</span>
              <span className="font-tabular font-medium text-emerald-700">
                +{formatCurrency(taxAmount, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-stone-900 pt-1.5 border-t border-stone-200">
              <span>Total Purchase Amount:</span>
              <span className="font-tabular text-stone-900">
                {formatCurrency(totalAmount, settings.currencySymbol)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
          >
            {editingPurchase ? 'Update Purchase Entry' : 'Save to Purchase Register'}
          </button>
        </form>
      </Modal>

      {/* Attached Receipt Image Full Viewer Modal */}
      {previewReceiptModal && (
        <Modal
          isOpen={!!previewReceiptModal}
          onClose={() => setPreviewReceiptModal(null)}
          title="Attached Tax Receipt / Invoice"
          subtitle={`${previewReceiptModal.title} (${previewReceiptModal.invoiceNumber}) · ${previewReceiptModal.date} · ${formatCurrency(previewReceiptModal.amount, settings.currencySymbol)}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="max-h-[65vh] overflow-auto rounded-xl border border-stone-300 bg-stone-100 flex items-center justify-center p-2">
              <img
                src={previewReceiptModal.image}
                alt="Full receipt"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
              />
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-stone-200">
              <span className="text-xs text-stone-500 text-center sm:text-left">
                Attached invoice proof for tax deductibility & VAT compliance
              </span>
              <button
                type="button"
                onClick={() => setPreviewReceiptModal(null)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
