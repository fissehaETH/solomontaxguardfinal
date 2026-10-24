import React, { useState, useEffect } from 'react';
import {
  SaleTransaction,
  BankAccount,
  TaxSettings,
  DailyRegisterClose,
  PaymentMethod,
} from '../../types';
import {
  formatCurrency,
  formatDate,
  getSaleCashAmount,
  getSaleBankTransferAmount,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { parseSaleWithAI } from '../../utils/aiApi';
import {
  Plus,
  Search,
  Receipt,
  Trash2,
  Lock,
  Pencil,
  AlertCircle,
  Sparkles,
  Loader2,
  X,
  Calendar,
} from 'lucide-react';

interface SalesManagerProps {
  sales: SaleTransaction[];
  bankAccounts: BankAccount[];
  dailyCloses: DailyRegisterClose[];
  settings: TaxSettings;
  onAddSale: (sale: SaleTransaction) => void;
  onUpdateSale: (sale: SaleTransaction) => void;
  onDeleteSale: (id: string) => void;
  onAddDailyClose: (close: DailyRegisterClose) => void;
  onDeleteDailyClose: (id: string) => void;
  isAddSaleOpen: boolean;
  setIsAddSaleOpen: (open: boolean) => void;
  isDailyCloseOpen: boolean;
  setIsDailyCloseOpen: (open: boolean) => void;
  initialEditingSale?: SaleTransaction | null;
  onClearInitialEditingSale?: () => void;
}

export const SalesManager: React.FC<SalesManagerProps> = ({
  sales,
  bankAccounts,
  dailyCloses,
  settings,
  onAddSale,
  onUpdateSale,
  onDeleteSale,
  onAddDailyClose,
  onDeleteDailyClose,
  isAddSaleOpen,
  setIsAddSaleOpen,
  isDailyCloseOpen,
  setIsDailyCloseOpen,
  initialEditingSale,
  onClearInitialEditingSale,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [filterPeriod, setFilterPeriod] = useState<
    'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_year' | 'range' | 'custom'
  >('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  // Editing Sale State
  const [editingSale, setEditingSale] = useState<SaleTransaction | null>(null);

  // Form State for Registering / Editing Total Daily Sales
  const [saleDate, setSaleDate] = useState(today);
  const [receiptRange, setReceiptRange] = useState(`DS-${today}`);
  const [totalDailyAmount, setTotalDailyAmount] = useState<number>(0);
  const [dailyTransferAmount, setDailyTransferAmount] = useState<number>(0);
  const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [taxRatePercent, setTaxRatePercent] = useState(Math.round(settings.defaultSalesTaxRate * 100));
  const [selectedBankId, setSelectedBankId] = useState<string>(bankAccounts[0]?.id || '');
  const [notes, setNotes] = useState('');

  // Auto-sync default bank account if not selected
  useEffect(() => {
    if (!selectedBankId && bankAccounts[0]?.id) {
      setSelectedBankId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankId]);

  // AI Smart Fill State
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aiPromptInput, setAiPromptInput] = useState('');
  const [isAIParsingSale, setIsAIParsingSale] = useState(false);
  const [aiSaleNotice, setAiSaleNotice] = useState<string | null>(null);

  const handleParseWithAI = async () => {
    if (!aiPromptInput.trim() || isAIParsingSale) return;
    try {
      setIsAIParsingSale(true);
      setAiSaleNotice(null);
      const parsed = await parseSaleWithAI(aiPromptInput.trim());

      if (typeof parsed.totalAmount === 'number' && parsed.totalAmount > 0) {
        setTotalDailyAmount(parsed.totalAmount);
      }
      if (typeof parsed.bankTransferAmount === 'number') {
        setDailyTransferAmount(parsed.bankTransferAmount);
      }
      if (parsed.date) {
        setSaleDate(parsed.date);
      }
      if (parsed.receiptRange) {
        setReceiptRange(parsed.receiptRange);
      }
      if (parsed.notes) {
        setNotes((prev) => (prev ? `${prev} · ${parsed.notes}` : parsed.notes || ''));
      }
      setAiSaleNotice(
        `AI successfully parsed: Total ${formatCurrency(parsed.totalAmount, settings.currencySymbol)} (Cash: ${formatCurrency(parsed.cashAmount, settings.currencySymbol)}, Transfer: ${formatCurrency(parsed.bankTransferAmount, settings.currencySymbol)})`
      );
      setAiPromptInput('');
      setIsAIPanelOpen(false);
    } catch (err: any) {
      setAiSaleNotice(`AI parsing notice: ${err.message || 'Could not parse notes'}`);
    } finally {
      setIsAIParsingSale(false);
    }
  };

  // Editing Daily Close State
  const [editingClose, setEditingClose] = useState<DailyRegisterClose | null>(null);

  // Daily Z-Report Form State
  const [closeDate, setCloseDate] = useState(today);
  const [openingFloat, setOpeningFloat] = useState(5000.0);
  const [actualCashCounted, setActualCashCounted] = useState(0);
  const [bankDepositAmount, setBankDepositAmount] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');

  const openEditSaleModal = (sale: SaleTransaction) => {
    setEditingSale(sale);
    setSaleDate(sale.date);
    setReceiptRange(sale.receiptNumber);
    setTotalDailyAmount(sale.totalAmount);
    setDailyTransferAmount(getSaleBankTransferAmount(sale));
    setTaxMode('inclusive');
    setTaxRatePercent(Math.round((sale.taxRate || settings.defaultSalesTaxRate) * 100));
    setSelectedBankId(sale.bankAccountId || bankAccounts[0]?.id || '');
    setNotes(sale.notes || '');
    setIsAddSaleOpen(true);
  };

  useEffect(() => {
    if (initialEditingSale) {
      openEditSaleModal(initialEditingSale);
      onClearInitialEditingSale?.();
    }
  }, [initialEditingSale]);

  const openNewSaleModal = () => {
    setEditingSale(null);
    setSaleDate(today);
    setReceiptRange(`DS-${today}`);
    setTotalDailyAmount(0);
    setDailyTransferAmount(0);
    setTaxMode('inclusive');
    setTaxRatePercent(Math.round(settings.defaultSalesTaxRate * 100));
    setSelectedBankId(bankAccounts[0]?.id || '');
    setNotes('');
    setIsAddSaleOpen(true);
  };

  const openEditCloseModal = (close: DailyRegisterClose) => {
    setEditingClose(close);
    setCloseDate(close.date);
    setOpeningFloat(close.openingFloat);
    setActualCashCounted(close.actualCashCounted);
    setBankDepositAmount(close.bankDepositAmount);
    setCloseNotes(close.notes || '');
    setIsDailyCloseOpen(true);
  };

  const openNewCloseModal = () => {
    const existingToday = dailyCloses.find((c) => c.date === today);
    if (existingToday) {
      openEditCloseModal(existingToday);
      return;
    }
    setEditingClose(null);
    setCloseDate(today);
    setOpeningFloat(5000.0);
    setActualCashCounted(0);
    setBankDepositAmount(0);
    setCloseNotes('');
    setIsDailyCloseOpen(true);
  };

  // Helper to get cash and bank transfer amounts from any sale (every sale other than bank transfer is cash)
  const getSaleTransferAmount = (s: SaleTransaction): number => getSaleBankTransferAmount(s);

  // Filtering
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  const currentYearMonth = today.substring(0, 7); // e.g. "2026-10"

  const currentYear = today.substring(0, 4);

  const filteredSales = sales.filter((sale) => {
    // 1. Date Period Filter
    if (filterPeriod === 'today' && sale.date !== today) return false;
    if (filterPeriod === 'yesterday' && sale.date !== yesterday) return false;
    if (filterPeriod === 'this_week') {
      const saleTime = new Date(sale.date).getTime();
      const nowTime = new Date(today).getTime();
      const diffDays = (nowTime - saleTime) / (1000 * 3600 * 24);
      if (diffDays < 0 || diffDays > 7) return false;
    }
    if (filterPeriod === 'this_month' && !sale.date.startsWith(currentYearMonth)) return false;
    if (filterPeriod === 'this_year' && !sale.date.startsWith(currentYear)) return false;
    if (filterPeriod === 'custom' && selectedDateFilter && sale.date !== selectedDateFilter) return false;
    if (filterPeriod === 'range') {
      if (filterStartDate && sale.date < filterStartDate) return false;
      if (filterEndDate && sale.date > filterEndDate) return false;
    }
    if (selectedDateFilter && filterPeriod === 'custom' && sale.date !== selectedDateFilter) return false;

    // 2. Payment Method Filter
    if (paymentFilter === 'cash' && getSaleCashAmount(sale) <= 0) return false;
    if (paymentFilter === 'bank_transfer' && getSaleTransferAmount(sale) <= 0) return false;

    // 3. Search Query (Date, Receipt #, Notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchRec = sale.receiptNumber.toLowerCase().includes(q);
      const matchNotes = (sale.notes || '').toLowerCase().includes(q);

      // Smart Date Matcher
      const rawDate = sale.date; // e.g. "2026-10-14"
      const formattedDate = formatDate(sale.date).toLowerCase();
      const dateParts = rawDate.split('-');
      const monthDayDash = dateParts.length === 3 ? `${dateParts[1]}-${dateParts[2]}` : '';
      const dayMonthDash = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}` : '';
      const monthDaySlash = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : '';
      const dayMonthSlash = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : '';

      const dObj = new Date(sale.date);
      const dayOfWeek = isNaN(dObj.getTime())
        ? ''
        : dObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const monthName = isNaN(dObj.getTime())
        ? ''
        : dObj.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
      const monthShort = isNaN(dObj.getTime())
        ? ''
        : dObj.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();

      const matchDateRelative =
        (q === 'today' && sale.date === today) ||
        (q === 'yesterday' && sale.date === yesterday);

      const matchDate =
        rawDate.includes(q) ||
        formattedDate.includes(q) ||
        monthDayDash.includes(q) ||
        dayMonthDash.includes(q) ||
        monthDaySlash.includes(q) ||
        dayMonthSlash.includes(q) ||
        dayOfWeek.includes(q) ||
        monthName.includes(q) ||
        monthShort.includes(q) ||
        matchDateRelative;

      if (!matchRec && !matchNotes && !matchDate) return false;
    }
    return true;
  });

  // Always sorted strictly by date: recent to old
  const sortedSales = [...filteredSales].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)
  );

  const sortedDailyCloses = [...dailyCloses].sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  // Calculate totals for currently filtered sales
  const totalSalesAmount = filteredSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const totalTaxAmount = filteredSales.reduce((acc, s) => acc + s.taxAmount, 0);
  const totalCashSales = filteredSales.reduce((acc, s) => acc + getSaleCashAmount(s), 0);
  const totalBankTransferSales = filteredSales.reduce((acc, s) => acc + getSaleTransferAmount(s), 0);

  // Math for Total Daily Sales modal (supports VAT Inclusive or Exclusive)
  const rateDecimal = taxRatePercent / 100;
  const calculatedSubtotal =
    taxMode === 'inclusive'
      ? totalDailyAmount / (1 + rateDecimal)
      : totalDailyAmount;
  const calculatedTax =
    taxMode === 'inclusive'
      ? totalDailyAmount - calculatedSubtotal
      : totalDailyAmount * rateDecimal;
  const calculatedTotal =
    taxMode === 'inclusive'
      ? totalDailyAmount
      : calculatedSubtotal + calculatedTax;

  // Clamp transfer amount so it does not exceed calculated total daily sales
  const resolvedTransferAmount = Math.min(Math.max(0, dailyTransferAmount), calculatedTotal);
  const resolvedCashAmount = Math.max(0, calculatedTotal - resolvedTransferAmount);

  // Check if a daily sales record already exists on the selected date (excluding the entry currently being edited)
  const existingSaleOnSelectedDate = sales.find(
    (s) => s.date === saleDate && (!editingSale || s.id !== editingSale.id)
  );
  const existingTodaySale = sales.find((s) => s.date === today);

  const handleSaveSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (existingSaleOnSelectedDate) return;
    if (calculatedTotal <= 0) return;

    const currentTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const primaryPaymentMethod: PaymentMethod =
      resolvedTransferAmount > 0 && resolvedCashAmount === 0 ? 'bank_transfer' : 'cash';

    const saleRecord: SaleTransaction = {
      id: editingSale ? editingSale.id : `sale-${Date.now()}`,
      receiptNumber: receiptRange.trim() || `DS-${saleDate}`,
      date: saleDate,
      time: editingSale ? editingSale.time : currentTime,
      customerName: editingSale?.customerName || 'Total Daily Sales Summary',
      items: [
        {
          id: editingSale?.items?.[0]?.id || `item-${Date.now()}`,
          name: `Total Daily Sales (${saleDate})`,
          quantity: 1,
          unitPrice: Number(calculatedSubtotal.toFixed(2)),
        },
      ],
      subtotal: Number(calculatedSubtotal.toFixed(2)),
      taxRate: rateDecimal,
      taxAmount: Number(calculatedTax.toFixed(2)),
      totalAmount: Number(calculatedTotal.toFixed(2)),
      cashAmount: Number(resolvedCashAmount.toFixed(2)),
      bankTransferAmount: Number(resolvedTransferAmount.toFixed(2)),
      paymentMethod: primaryPaymentMethod,
      bankAccountId:
        resolvedTransferAmount > 0
          ? selectedBankId || bankAccounts[0]?.id || 'acc-cbe-main'
          : undefined,
      isReconciledWithBank: resolvedTransferAmount > 0,
      notes: notes.trim() || 'Daily total sales register entry (Cash + Bank Transfer)',
      createdAt: editingSale ? editingSale.createdAt : Date.now(),
    };

    if (editingSale) {
      onUpdateSale(saleRecord);
    } else {
      onAddSale(saleRecord);
    }

    setEditingSale(null);
    setIsAddSaleOpen(false);
    setTotalDailyAmount(0);
    setDailyTransferAmount(0);
    setReceiptRange(`DS-${saleDate}`);
    setNotes('');
  };

  // Math for Daily Close
  const salesOnCloseDate = sales.filter((s) => s.date === closeDate);
  const closeCashSales = salesOnCloseDate.reduce((acc, s) => acc + getSaleCashAmount(s), 0);
  const closeBankTransferSales = salesOnCloseDate.reduce((acc, s) => acc + getSaleTransferAmount(s), 0);
  const closeGrossSales = salesOnCloseDate.reduce((acc, s) => acc + s.totalAmount, 0);
  const closeTaxCollected = salesOnCloseDate.reduce((acc, s) => acc + s.taxAmount, 0);
  const expectedCashInDrawer = openingFloat + closeCashSales;
  const cashVariance = actualCashCounted - expectedCashInDrawer;

  const handleSaveDailyClose = (e: React.FormEvent) => {
    e.preventDefault();

    const newClose: DailyRegisterClose = {
      id: editingClose ? editingClose.id : `close-${closeDate}-${Date.now()}`,
      date: closeDate,
      openingFloat,
      cashSales: closeCashSales,
      cardSales: 0,
      bankTransferSales: closeBankTransferSales,
      totalGrossSales: closeGrossSales,
      totalTaxCollected: closeTaxCollected,
      cashPaidOutForPurchases: 0,
      actualCashCounted,
      cashVariance,
      bankDepositAmount,
      closedBy: editingClose?.closedBy || 'Authorized Cashier / Business Owner',
      status: Math.abs(cashVariance) < 0.05 ? 'balanced' : 'variance_flagged',
      notes:
        closeNotes.trim() ||
        (Math.abs(cashVariance) < 0.05
          ? 'Audited register zero variance'
          : `Discrepancy of ${formatCurrency(cashVariance, settings.currencySymbol)} reported`),
    };

    onAddDailyClose(newClose);
    setEditingClose(null);
    setIsDailyCloseOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-stone-200">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">
            Daily Sales Total <span aria-hidden="true">·</span> Automatic 15% VAT Calculation
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Daily Sales Book
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={openNewCloseModal}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap min-h-[40px]"
          >
            <Lock className="w-3.5 h-3.5 text-stone-600 shrink-0" />
            <span>End-of-Day Cash Count</span>
          </button>

          <button
            onClick={openNewSaleModal}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition whitespace-nowrap min-h-[40px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>
              {existingTodaySale ? 'Record / Edit Daily Sales' : 'Record Daily Sales'}
            </span>
          </button>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-stone-200">
          <span className="text-xs text-stone-500">Total Daily Sales (Incl. VAT)</span>
          <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
            {formatCurrency(totalSalesAmount, settings.currencySymbol)}
          </p>
          <span className="text-xs text-stone-500">{filteredSales.length} daily sales entries</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-stone-200">
          <span className="text-xs text-stone-500">Cash Sales (In Shop Cash Box)</span>
          <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
            {formatCurrency(totalCashSales, settings.currencySymbol)}
          </p>
          <span className="text-xs text-stone-500">Physical cash collected</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-stone-200">
          <span className="text-xs text-stone-500">Bank Transfer Sales</span>
          <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
            {formatCurrency(totalBankTransferSales, settings.currencySymbol)}
          </p>
          <span className="text-xs text-stone-500">Paid via bank transfer</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-stone-200">
          <span className="text-xs text-stone-500">15% VAT Collected on Sales</span>
          <p className="text-xl font-bold text-emerald-700 font-tabular mt-1">
            {formatCurrency(totalTaxAmount, settings.currencySymbol)}
          </p>
          <span className="text-xs text-stone-500">Collected for Tax Office</span>
        </div>
      </div>

      {/* Filter and Date Search Bar */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sales by date (e.g. 2026-10-14, Oct 14, Wednesday, today), receipt #, or note..."
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

          <div className="flex items-center gap-2 overflow-x-auto">
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-white border border-stone-300 text-stone-800 text-xs rounded-xl px-3 py-2.5 focus:outline-none shrink-0"
            >
              <option value="all">All Payment Types</option>
              <option value="cash">Includes Cash</option>
              <option value="bank_transfer">Includes Bank Transfer</option>
            </select>
          </div>
        </div>

        {/* Date Filter & Search Row */}
        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-stone-500 font-semibold shrink-0">
            <Calendar className="w-3.5 h-3.5 text-orange-700" />
            <span>Search / Filter by Date:</span>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('all');
                setSelectedDateFilter('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'all' && !selectedDateFilter && !filterStartDate
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('today');
                setSelectedDateFilter(today);
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'today'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('yesterday');
                setSelectedDateFilter(yesterday);
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'yesterday'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('this_week');
                setSelectedDateFilter('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'this_week'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('this_month');
                setSelectedDateFilter('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'this_month'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('this_year');
                setSelectedDateFilter('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'this_year'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              This Year
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('range');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                filterPeriod === 'range'
                  ? 'bg-white text-orange-950 shadow-xs border border-orange-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Date Range
            </button>
          </div>

          {/* Range Inputs or Date Picker Input */}
          {filterPeriod === 'range' ? (
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
                value={selectedDateFilter}
                onChange={(e) => {
                  setSelectedDateFilter(e.target.value);
                  setFilterPeriod(e.target.value ? 'custom' : 'all');
                }}
                title="Pick a specific date to filter daily sales"
                className="bg-white border border-stone-300 text-stone-800 text-xs rounded-lg px-2.5 py-1 focus:outline-none"
              />
            </div>
          )}

          {(filterPeriod !== 'all' ||
            selectedDateFilter ||
            filterStartDate ||
            filterEndDate ||
            searchQuery ||
            paymentFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setFilterPeriod('all');
                setSelectedDateFilter('');
                setFilterStartDate('');
                setFilterEndDate('');
                setSearchQuery('');
                setPaymentFilter('all');
              }}
              className="px-2.5 py-1 text-xs text-orange-800 hover:text-orange-950 bg-orange-50 hover:bg-orange-100 rounded-md border border-orange-200 transition cursor-pointer flex items-center gap-1 ml-auto"
            >
              <X className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Active Criteria Indicator */}
        {(searchQuery || filterPeriod !== 'all' || selectedDateFilter || filterStartDate) && (
          <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
            <span className="font-semibold text-stone-700">Active Criteria:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-medium">
                Search: &quot;{searchQuery}&quot;
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="hover:text-amber-950 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}
            {filterPeriod === 'range' && (filterStartDate || filterEndDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 font-medium">
                Date Range: {filterStartDate || 'Start'} to {filterEndDate || 'Latest'}
              </span>
            )}
            {filterPeriod !== 'range' && (selectedDateFilter || filterPeriod !== 'all') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 font-medium">
                Date: {selectedDateFilter || filterPeriod.replace('_', ' ')}
              </span>
            )}
            <span className="text-stone-400">·</span>
            <span className="font-bold text-stone-800">
              {filteredSales.length} daily entries matching
            </span>
            <span className="text-stone-500 font-tabular">
              ({formatCurrency(totalSalesAmount, settings.currencySymbol)})
            </span>
          </div>
        )}
      </div>

      {/* Daily Sales Entries List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-stone-500 font-medium px-1">
          <span>{sortedSales.length} daily entries</span>
          <span>Sorted: Most Recent First</span>
        </div>
        {sortedSales.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-stone-200 text-center space-y-2">
            <Receipt className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="text-sm font-semibold text-stone-800">No Daily Sales Recorded Yet</p>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Click &quot;Record Daily Sales&quot; to enter the total sales amount and daily bank transfer amount.
            </p>
          </div>
        ) : (
          sortedSales.map((sale) => {
            const cashPart = getSaleCashAmount(sale);
            const transferPart = getSaleTransferAmount(sale);
            return (
              <div
                key={sale.id}
                className="p-4 rounded-2xl bg-white border border-stone-200 hover:border-stone-300 transition space-y-2.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span className="font-mono font-bold text-stone-900 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                        {sale.receiptNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
                          (searchQuery &&
                            (sale.date.includes(searchQuery.toLowerCase().trim()) ||
                              formatDate(sale.date).toLowerCase().includes(searchQuery.toLowerCase().trim()))) ||
                          selectedDateFilter === sale.date
                            ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                        title="Daily Sales Date"
                      >
                        <Calendar className="w-3 h-3 text-orange-700" />
                        <span>{formatDate(sale.date)}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Cash: <strong className="font-tabular text-stone-800">{formatCurrency(cashPart, settings.currencySymbol)}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Bank Transfer: <strong className="font-tabular text-stone-800">{formatCurrency(transferPart, settings.currencySymbol)}</strong>
                      </span>
                      {sale.isReconciledWithBank && transferPart > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 font-medium">Transfer Added to Bank</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-stone-900 mt-1">
                      Total Daily Sales — {formatDate(sale.date)}
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Sales Before 15% VAT: {formatCurrency(sale.subtotal, settings.currencySymbol)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base font-bold text-stone-900 font-tabular block">
                      {formatCurrency(sale.totalAmount, settings.currencySymbol)}
                    </span>
                    <span className="text-xs text-emerald-700 font-tabular font-medium">
                      15% VAT: {formatCurrency(sale.taxAmount, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs text-stone-500">
                  <span>{sale.notes || 'Daily total sales summary'}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditSaleModal(sale)}
                      title="Edit daily sales entry"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 font-semibold transition"
                    >
                      <Pencil className="w-3.5 h-3.5 text-orange-700" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDeleteSale(sale.id)}
                      title="Delete daily sales entry"
                      className="p-1.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition"
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

      {/* Saved End-of-Day Cash Counts Section */}
      {dailyCloses.length > 0 && (
        <div className="p-5 rounded-2xl bg-white border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
              Saved End-of-Day Cash Counts ({sortedDailyCloses.length})
            </h3>
            <span className="text-xs text-stone-500 font-medium">Sorted: Recent to Old</span>
          </div>

          <div className="divide-y divide-stone-100">
            {sortedDailyCloses.map((close) => (
              <div
                key={close.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-900">{formatDate(close.date)}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        close.status === 'balanced' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {close.status === 'balanced' ? 'Cash Matched' : 'Cash Difference'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-stone-600">
                      Counted: <strong className="font-tabular text-stone-900">{formatCurrency(close.actualCashCounted, settings.currencySymbol)}</strong>
                    </span>
                    {close.bankDepositAmount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-stone-600">
                          Deposited to Bank: <strong className="font-tabular text-stone-900">{formatCurrency(close.bankDepositAmount, settings.currencySymbol)}</strong>
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {close.notes || 'End-of-day cash drawer count'}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => openEditCloseModal(close)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 font-semibold transition"
                  >
                    <Pencil className="w-3.5 h-3.5 text-orange-700" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => onDeleteDailyClose(close.id)}
                    title="Delete end-of-day cash count"
                    className="p-1.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record / Edit Total Daily Sales Modal */}
      <Modal
        isOpen={isAddSaleOpen}
        onClose={() => {
          setEditingSale(null);
          setIsAddSaleOpen(false);
        }}
        title={editingSale ? 'Edit Daily Sales Entry' : 'Record Total Daily Sales'}
        subtitle="Enter total daily sales and the amount received through bank transfer (cash is calculated automatically)"
      >
        <form onSubmit={handleSaveSale} className="space-y-4">
          {/* AI Parsing Notice Banner */}
          {aiSaleNotice && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 text-orange-950 text-xs flex items-center justify-between gap-2 animate-fadeIn">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-orange-700 shrink-0" />
                <span className="font-medium truncate">{aiSaleNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiSaleNotice(null)}
                className="text-stone-400 hover:text-stone-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* AI Quick Dictate / Smart Fill Expander */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-700" />
                <span>AI Quick Fill (Dictate or Paste Register Notes)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAIPanelOpen(!isAIPanelOpen)}
                className="text-xs font-semibold text-orange-700 hover:underline cursor-pointer"
              >
                {isAIPanelOpen ? 'Hide' : 'Open'}
              </button>
            </div>

            {isAIPanelOpen && (
              <div className="space-y-2 pt-2 border-t border-stone-200 animate-fadeIn">
                <textarea
                  rows={2}
                  value={aiPromptInput}
                  onChange={(e) => setAiPromptInput(e.target.value)}
                  placeholder="e.g. Today register total was 85,000 birr, 55,000 cash and 30,000 CBE transfer, receipts DS-201 to 240"
                  className="w-full p-2.5 rounded-lg bg-white border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
                />
                <button
                  type="button"
                  disabled={isAIParsingSale || !aiPromptInput.trim()}
                  onClick={handleParseWithAI}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-105 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isAIParsingSale ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Parsing with Gemini AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <span>Parse &amp; Auto-Fill Form</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Sales Date *</span>
              <input
                type="date"
                required
                value={saleDate}
                onChange={(e) => {
                  setSaleDate(e.target.value);
                  if (!editingSale) {
                    setReceiptRange(`DS-${e.target.value}`);
                  }
                }}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
              />
            </div>

            <div>
              <span className="text-xs text-stone-600">Receipt Book Range / FS Ref #</span>
              <input
                type="text"
                required
                disabled={Boolean(existingSaleOnSelectedDate)}
                value={receiptRange}
                onChange={(e) => setReceiptRange(e.target.value)}
                placeholder="e.g. FS 001-045"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-900 font-bold focus:outline-none focus:border-orange-700 disabled:opacity-50"
              />
            </div>
          </div>

          {existingSaleOnSelectedDate ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-stone-900">
                    Daily sales for {formatDate(saleDate)} is already recorded ({existingSaleOnSelectedDate.receiptNumber} — {formatCurrency(existingSaleOnSelectedDate.totalAmount, settings.currencySymbol)}).
                  </p>
                  <p className="text-stone-700 leading-relaxed">
                    Another daily sales entry on the same day cannot be recorded. You can <strong>edit</strong> the existing entry, or <strong>delete it and record it again</strong>, or choose a different date above.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openEditSaleModal(existingSaleOnSelectedDate)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-700 text-white font-semibold hover:bg-orange-800 transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Existing Entry</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSale(existingSaleOnSelectedDate.id);
                    setReceiptRange(`DS-${saleDate}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-red-300 text-red-700 font-semibold hover:bg-red-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete &amp; Record Again</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-xs font-semibold text-stone-700">
                    Total Daily Sales Amount ({settings.currencySymbol.trim()}) *
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    required
                    placeholder="e.g. 85000.00"
                    value={totalDailyAmount || ''}
                    onChange={(e) => setTotalDailyAmount(parseFloat(e.target.value || '0'))}
                    className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular focus:outline-none focus:border-orange-700"
                  />
                  <span className="text-[11px] text-stone-500 mt-0.5 block">
                    Combined Cash + Bank Transfer sales
                  </span>
                </div>

                <div>
                  <span className="text-xs font-semibold text-stone-700">
                    Total Daily Bank Transfer Amount ({settings.currencySymbol.trim()})
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    max={calculatedTotal > 0 ? calculatedTotal : undefined}
                    placeholder="e.g. 30000.00"
                    value={dailyTransferAmount || ''}
                    onChange={(e) => setDailyTransferAmount(parseFloat(e.target.value || '0'))}
                    className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular focus:outline-none focus:border-orange-700"
                  />
                  <span className="text-[11px] text-stone-500 mt-0.5 block">
                    Every sale other than bank transfer is Cash: <strong className="text-stone-800 font-tabular">{formatCurrency(resolvedCashAmount, settings.currencySymbol)}</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <span className="text-xs text-stone-600 block mb-1">How is 15% VAT calculated?</span>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-stone-100 border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setTaxMode('inclusive')}
                      className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition ${
                        taxMode === 'inclusive'
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Includes 15% VAT
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxMode('exclusive')}
                      className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition ${
                        taxMode === 'exclusive'
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Add 15% VAT on Top
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-stone-600">VAT Rate (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={taxRatePercent}
                    onChange={(e) => setTaxRatePercent(parseInt(e.target.value || '0', 10))}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 font-mono"
                  />
                </div>
              </div>

              {resolvedTransferAmount > 0 && bankAccounts.length > 0 && (
                <div>
                  <span className="text-xs text-stone-600">Which Bank Received the Transfer Amount?</span>
                  <select
                    value={selectedBankId || bankAccounts[0]?.id || ''}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
                  >
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.bankName})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <span className="text-xs text-stone-600">Note (Optional)</span>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Daily cash + bank transfer summary"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-stone-700">
                  <span>Daily Cash Sales (In Shop Cash Box):</span>
                  <span className="font-tabular font-semibold text-stone-900">
                    {formatCurrency(resolvedCashAmount, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-700">
                  <span>Daily Bank Transfer Sales:</span>
                  <span className="font-tabular font-semibold text-stone-900">
                    {formatCurrency(resolvedTransferAmount, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-600 pt-1 border-t border-stone-200">
                  <span>Sales Before VAT:</span>
                  <span className="font-tabular font-medium text-stone-900">
                    {formatCurrency(calculatedSubtotal, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>15% VAT on Sales ({taxRatePercent}%):</span>
                  <span className="font-tabular font-medium text-emerald-700">
                    +{formatCurrency(calculatedTax, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-stone-900 pt-1.5 border-t border-stone-200">
                  <span>Total Daily Sales (Cash + Transfer):</span>
                  <span className="font-tabular text-stone-900">
                    {formatCurrency(calculatedTotal, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition"
              >
                {editingSale ? 'Update Daily Sales Entry' : 'Save Total Daily Sales'}
              </button>
            </>
          )}
        </form>
      </Modal>

      {/* End-of-Day Cash Box Count Modal */}
      <Modal
        isOpen={isDailyCloseOpen}
        onClose={() => {
          setEditingClose(null);
          setIsDailyCloseOpen(false);
        }}
        title={editingClose ? 'Edit End-of-Day Cash Count' : 'End-of-Day Cash Count'}
        subtitle="Check that the physical cash in your shop drawer matches your recorded cash sales"
      >
        <form onSubmit={handleSaveDailyClose} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Date</span>
              <input
                type="date"
                required
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
              />
            </div>
            <div>
              <span className="text-xs text-stone-600">Starting Cash in Box (Morning Change)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                required
                value={openingFloat}
                onChange={(e) => setOpeningFloat(parseFloat(e.target.value || '0'))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 font-mono"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
            <div className="flex justify-between text-stone-600">
              <span>Total Sales Recorded Today:</span>
              <span className="font-tabular font-bold text-stone-900">
                {formatCurrency(closeGrossSales, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Paid by Bank Transfer:</span>
              <span className="font-tabular text-stone-800">
                {formatCurrency(closeBankTransferSales, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-stone-200">
              <span>Cash Received from Sales Today:</span>
              <span className="font-tabular">
                +{formatCurrency(closeCashSales, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between font-bold text-stone-900 pt-1 border-t border-stone-200">
              <span>Expected Cash in Box (Starting Cash + Cash Sales):</span>
              <span className="font-tabular">
                {formatCurrency(expectedCashInDrawer, settings.currencySymbol)}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-stone-700">
              Actual Cash You Counted in Hand ({settings.currencySymbol})
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              placeholder="e.g. 41395.00"
              value={actualCashCounted || ''}
              onChange={(e) => setActualCashCounted(parseFloat(e.target.value || '0'))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm font-bold text-stone-900 font-tabular focus:outline-none focus:border-orange-700"
            />
          </div>

          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              Math.abs(cashVariance) < 0.05
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <span>
              {Math.abs(cashVariance) < 0.05
                ? 'Cash Matches Exactly (No Difference)'
                : `Cash Difference (${cashVariance > 0 ? 'Extra Cash' : 'Missing Cash'})`}
            </span>
            <span className="font-bold font-tabular">
              {formatCurrency(cashVariance, settings.currencySymbol)}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-700">Cash Taken to Deposit in Bank Today (Sales Cash Deposit)</span>
              {closeBankTransferSales > 0 && (
                <span className="text-purple-700 font-medium text-[11px]">
                  Bank Transfer Sales ({formatCurrency(closeBankTransferSales, settings.currencySymbol)}) already in bank
                </span>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="e.g. 25000.00 cash taken to bank"
              value={bankDepositAmount || ''}
              onChange={(e) => setBankDepositAmount(parseFloat(e.target.value || '0'))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 font-mono"
            />
            <p className="text-[11px] text-stone-500 mt-1">
              Physical cash from register deposited at bank branch. This automatically creates a <strong>Sales Cash Deposit</strong> entry in your Bank Deposits feed.
            </p>
          </div>

          <div>
            <span className="text-xs text-stone-600">Note (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Verified evening drawer count"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-stone-900 text-white font-semibold text-xs hover:bg-stone-800 transition"
          >
            {editingClose ? 'Update End-of-Day Cash Count' : 'Save End-of-Day Cash Count'}
          </button>
        </form>
      </Modal>
    </div>
  );
};
