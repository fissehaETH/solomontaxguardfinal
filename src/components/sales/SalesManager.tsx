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
import {
  getTodayLocalDateString,
  getYesterdayLocalDateString,
  formatCalendarDate,
  normalizeDateString,
} from '../../utils/dateUtils';
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
  CheckCircle2,
  TrendingUp,
  Coins,
  CreditCard,
  ArrowRight,
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
  const today = getTodayLocalDateString();
  const yesterday = getYesterdayLocalDateString();

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
  const [isAppendMode, setIsAppendMode] = useState<boolean>(false);
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

      const tot = typeof parsed.totalAmount === 'number' && parsed.totalAmount > 0 ? parsed.totalAmount : 0;
      const trf = typeof parsed.bankTransferAmount === 'number' ? parsed.bankTransferAmount : 0;
      const autoCash = Math.max(0, tot - trf);

      setTotalDailyAmount(tot);
      setDailyTransferAmount(trf);

      if (parsed.date) {
        setSaleDate(normalizeDateString(parsed.date));
      }
      if (parsed.receiptRange) {
        setReceiptRange(parsed.receiptRange);
      }
      if (parsed.notes) {
        setNotes((prev) => (prev ? `${prev} · ${parsed.notes}` : parsed.notes || ''));
      }
      setAiSaleNotice(
        `AI parsed: Total ${formatCurrency(tot, settings.currencySymbol)}, Transfer ${formatCurrency(trf, settings.currencySymbol)} → Auto Cash: ${formatCurrency(autoCash, settings.currencySymbol)}`
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
    const trf = getSaleBankTransferAmount(sale);
    setDailyTransferAmount(trf);
    setIsAppendMode(false);
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
    setIsAppendMode(false);
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

  // Unique business days and average daily sales metric
  const uniqueRecordedDays = new Set(filteredSales.map((s) => s.date)).size;
  const averageDailySales = uniqueRecordedDays > 0 ? totalSalesAmount / uniqueRecordedDays : 0;

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

  // Amount entry setters: User enters Total Daily Sales and Bank Transfer Sales
  const handleTransferChange = (newTransfer: number) => {
    setDailyTransferAmount(Math.max(0, newTransfer));
  };

  const handleTotalChange = (newTotal: number) => {
    setTotalDailyAmount(Math.max(0, newTotal));
  };

  const handleQuickSetAllCash = () => {
    setDailyTransferAmount(0);
  };

  const handleQuickSetAllTransfer = () => {
    setDailyTransferAmount(calculatedTotal);
  };

  const handleSaveSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (calculatedTotal <= 0) return;

    const currentTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const primaryPaymentMethod: PaymentMethod =
      resolvedTransferAmount > 0 && resolvedCashAmount === 0 ? 'bank_transfer' : 'cash';

    const finalSubtotal = calculatedSubtotal;
    const finalTax = calculatedTax;
    const finalTotal = calculatedTotal;
    const finalCash = resolvedCashAmount;
    const finalTransfer = resolvedTransferAmount;

    if (existingSaleOnSelectedDate && isAppendMode) {
      // Merge new daily sales amounts into the existing record for this date
      const prevCash = getSaleCashAmount(existingSaleOnSelectedDate);
      const prevTransfer = getSaleBankTransferAmount(existingSaleOnSelectedDate);
      const combinedCash = prevCash + finalCash;
      const combinedTransfer = prevTransfer + finalTransfer;
      const combinedTotal = combinedCash + combinedTransfer;
      const combinedSubtotal =
        taxMode === 'inclusive' ? combinedTotal / (1 + rateDecimal) : combinedTotal;
      const combinedTax =
        taxMode === 'inclusive' ? combinedTotal - combinedSubtotal : combinedTotal * rateDecimal;

      const mergedRecord: SaleTransaction = {
        ...existingSaleOnSelectedDate,
        totalAmount: Number(combinedTotal.toFixed(2)),
        cashAmount: Number(combinedCash.toFixed(2)),
        bankTransferAmount: Number(combinedTransfer.toFixed(2)),
        subtotal: Number(combinedSubtotal.toFixed(2)),
        taxAmount: Number(combinedTax.toFixed(2)),
        taxRate: rateDecimal,
        paymentMethod: combinedTransfer > 0 && combinedCash === 0 ? 'bank_transfer' : 'cash',
        bankAccountId:
          combinedTransfer > 0
            ? selectedBankId || existingSaleOnSelectedDate.bankAccountId || bankAccounts[0]?.id
            : undefined,
        notes: notes.trim()
          ? `${existingSaleOnSelectedDate.notes || 'Consolidated daily sales'} · ${notes.trim()}`
          : existingSaleOnSelectedDate.notes || 'Consolidated daily sales entry',
      };
      onUpdateSale(mergedRecord);
    } else if (existingSaleOnSelectedDate && !editingSale) {
      // Direct update / overwrite existing record for this date
      const updatedRecord: SaleTransaction = {
        ...existingSaleOnSelectedDate,
        receiptNumber: receiptRange.trim() || existingSaleOnSelectedDate.receiptNumber,
        time: currentTime,
        subtotal: Number(finalSubtotal.toFixed(2)),
        taxRate: rateDecimal,
        taxAmount: Number(finalTax.toFixed(2)),
        totalAmount: Number(finalTotal.toFixed(2)),
        cashAmount: Number(finalCash.toFixed(2)),
        bankTransferAmount: Number(finalTransfer.toFixed(2)),
        paymentMethod: primaryPaymentMethod,
        bankAccountId:
          finalTransfer > 0
            ? selectedBankId || existingSaleOnSelectedDate.bankAccountId || bankAccounts[0]?.id
            : undefined,
        isReconciledWithBank: finalTransfer > 0,
        notes: notes.trim() || existingSaleOnSelectedDate.notes || 'Daily sales register entry',
      };
      onUpdateSale(updatedRecord);
    } else {
      // Standard create or update
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
            unitPrice: Number(finalSubtotal.toFixed(2)),
          },
        ],
        subtotal: Number(finalSubtotal.toFixed(2)),
        taxRate: rateDecimal,
        taxAmount: Number(finalTax.toFixed(2)),
        totalAmount: Number(finalTotal.toFixed(2)),
        cashAmount: Number(finalCash.toFixed(2)),
        bankTransferAmount: Number(finalTransfer.toFixed(2)),
        paymentMethod: primaryPaymentMethod,
        bankAccountId:
          finalTransfer > 0
            ? selectedBankId || bankAccounts[0]?.id || 'acc-cbe-main'
            : undefined,
        isReconciledWithBank: finalTransfer > 0,
        notes: notes.trim() || 'Daily total sales register entry (Cash + Bank Transfer)',
        createdAt: editingSale ? editingSale.createdAt : Date.now(),
      };

      if (editingSale) {
        onUpdateSale(saleRecord);
      } else {
        onAddSale(saleRecord);
      }
    }

    setEditingSale(null);
    setIsAddSaleOpen(false);
    setTotalDailyAmount(0);
    setDailyTransferAmount(0);
    setIsAppendMode(false);
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

  // Dynamic contextual title and percentages for KPI card
  const kpiTitle =
    filterPeriod === 'today'
      ? "Today's Total Daily Sales"
      : filterPeriod === 'yesterday'
      ? "Yesterday's Daily Sales"
      : filterPeriod === 'this_week'
      ? "This Week's Daily Sales"
      : filterPeriod === 'this_month'
      ? "This Month's Daily Sales"
      : filterPeriod === 'this_year'
      ? "This Year's Total Sales"
      : filterPeriod === 'range'
      ? 'Date Range Total Sales'
      : filterPeriod === 'custom' && selectedDateFilter
      ? `Sales for ${formatCalendarDate(selectedDateFilter)}`
      : 'All-Time Total Daily Sales';

  const cashPercent = totalSalesAmount > 0 ? Math.round((totalCashSales / totalSalesAmount) * 100) : 0;
  const transferPercent = totalSalesAmount > 0 ? Math.round((totalBankTransferSales / totalSalesAmount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-stone-200">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">
            Daily Sales Total <span aria-hidden="true">·</span> 15% Ethiopian Standard VAT Calculation
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

      {/* Today's Daily Sales Status Bar */}
      <div
        className={`p-4 rounded-2xl border transition shadow-xs ${
          existingTodaySale
            ? 'bg-gradient-to-r from-emerald-50/80 via-stone-50 to-white border-emerald-200'
            : 'bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-white border-amber-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                existingTodaySale
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {existingTodaySale ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Today&apos;s Daily Sales Status
                </span>
                <span className="text-xs font-medium text-stone-400">·</span>
                <span className="text-xs font-semibold text-stone-800">
                  {formatCalendarDate(today)}
                </span>
              </div>
              {existingTodaySale ? (
                <div className="mt-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-bold text-stone-900 font-tabular">
                      {formatCurrency(existingTodaySale.totalAmount, settings.currencySymbol)}
                    </span>
                    <span className="text-xs text-stone-600 font-mono font-medium bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                      Ref: {existingTodaySale.receiptNumber}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs text-stone-600">
                    <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded font-medium">
                      Cash: <strong className="font-tabular">{formatCurrency(getSaleCashAmount(existingTodaySale), settings.currencySymbol)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 text-purple-800 bg-purple-100/70 px-2 py-0.5 rounded font-medium">
                      Bank Transfer: <strong className="font-tabular">{formatCurrency(getSaleBankTransferAmount(existingTodaySale), settings.currencySymbol)}</strong>
                    </span>
                    <span className="text-stone-500">
                      15% VAT: <strong className="font-tabular text-emerald-700">{formatCurrency(existingTodaySale.taxAmount, settings.currencySymbol)}</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-1">
                  <p className="text-sm font-bold text-stone-900">
                    Today&apos;s daily sales has not been recorded yet.
                  </p>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Record your daily cash register sales and bank transfers to keep tax books audit-proof.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {existingTodaySale ? (
              <button
                type="button"
                onClick={() => openEditSaleModal(existingTodaySale)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition shadow-xs cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Today&apos;s Sales</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openNewSaleModal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-700 text-white text-xs font-semibold hover:bg-orange-800 transition shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Today&apos;s Sales</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs">
            <span className="text-xs text-stone-500">{kpiTitle}</span>
            <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
              {formatCurrency(totalSalesAmount, settings.currencySymbol)}
            </p>
            <span className="text-xs text-stone-500">
              {filteredSales.length} daily entries {uniqueRecordedDays > 0 && `· ${uniqueRecordedDays} days`}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Cash Sales (Cash Drawer)</span>
              {cashPercent > 0 && (
                <span className="font-semibold text-emerald-800 bg-emerald-100/60 px-1.5 py-0.5 rounded text-[10px]">
                  {cashPercent}%
                </span>
              )}
            </div>
            <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
              {formatCurrency(totalCashSales, settings.currencySymbol)}
            </p>
            <span className="text-xs text-stone-500">Physical currency collected</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Bank Transfer Sales</span>
              {transferPercent > 0 && (
                <span className="font-semibold text-purple-800 bg-purple-100/60 px-1.5 py-0.5 rounded text-[10px]">
                  {transferPercent}%
                </span>
              )}
            </div>
            <p className="text-xl font-bold text-stone-900 font-tabular mt-1">
              {formatCurrency(totalBankTransferSales, settings.currencySymbol)}
            </p>
            <span className="text-xs text-stone-500">Paid via CBE / Telebirr</span>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs">
            <span className="text-xs text-stone-500">15% VAT Output Tax</span>
            <p className="text-xl font-bold text-emerald-700 font-tabular mt-1">
              {formatCurrency(totalTaxAmount, settings.currencySymbol)}
            </p>
            <span className="text-xs text-stone-500">Collected for Tax Authority</span>
          </div>
        </div>

        {uniqueRecordedDays > 1 && (
          <div className="px-3 py-2 rounded-xl bg-stone-100 border border-stone-200 flex flex-wrap items-center justify-between text-xs text-stone-600 gap-2">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-orange-700" />
              <span>
                Average Daily Sales: <strong className="text-stone-900 font-tabular">{formatCurrency(averageDailySales, settings.currencySymbol)}</strong> per business day
              </span>
            </span>
            <span className="text-stone-500 text-[11px]">
              Cash {cashPercent}% · Transfer {transferPercent}%
            </span>
          </div>
        )}
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
            <span className="text-stone-500 font-tabular font-medium">
              · {formatCurrency(totalSalesAmount, settings.currencySymbol)}
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
            const bankAcc = bankAccounts.find((b) => b.id === sale.bankAccountId);
            const saleCashPct =
              sale.totalAmount > 0 ? Math.round((cashPart / sale.totalAmount) * 100) : 0;
            const saleTrfPct =
              sale.totalAmount > 0 ? Math.round((transferPart / sale.totalAmount) * 100) : 0;

            const [y, m, d] = sale.date.split('-').map(Number);
            const dObj = new Date(y, m - 1, d);
            const dayOfWeek = !isNaN(dObj.getTime())
              ? dObj.toLocaleDateString('en-US', { weekday: 'short' })
              : '';

            const isTodaySale = sale.date === today;

            return (
              <div
                key={sale.id}
                className={`p-4 rounded-2xl bg-white border transition space-y-2.5 shadow-xs ${
                  isTodaySale
                    ? 'border-orange-300 ring-1 ring-orange-200'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        {sale.receiptNumber}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                          isTodaySale
                            ? 'bg-orange-100 text-orange-950 border-orange-300'
                            : 'bg-stone-100 text-stone-800 border-stone-200'
                        }`}
                        title="Calendar Date"
                      >
                        <Calendar className="w-3.5 h-3.5 text-orange-700" />
                        <span>
                          {dayOfWeek ? `${dayOfWeek}, ` : ''}
                          {formatCalendarDate(sale.date)}
                        </span>
                        {isTodaySale && (
                          <span className="text-[10px] bg-orange-700 text-white px-1.5 py-0.2 rounded-full font-bold ml-1">
                            Today
                          </span>
                        )}
                      </span>

                      {sale.isReconciledWithBank && transferPart > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Bank Linked</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-stone-900 mt-2">
                      Total Daily Sales — {formatCalendarDate(sale.date)}
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200">
                        <Coins className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          Cash: <strong className="font-tabular">{formatCurrency(cashPart, settings.currencySymbol)}</strong>{' '}
                          <span className="text-emerald-700/80 font-normal">({saleCashPct}%)</span>
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 font-semibold border border-purple-200">
                        <CreditCard className="w-3.5 h-3.5 text-purple-700" />
                        <span>
                          Transfer: <strong className="font-tabular">{formatCurrency(transferPart, settings.currencySymbol)}</strong>{' '}
                          <span className="text-purple-700/80 font-normal">({saleTrfPct}%)</span>
                        </span>
                        {bankAcc && (
                          <span className="text-[11px] font-normal text-purple-700 ml-0.5">
                            · {bankAcc.name}
                          </span>
                        )}
                      </span>
                    </div>

                    <p className="text-xs text-stone-500 mt-1.5">
                      Base Sales Before 15% VAT:{' '}
                      <strong className="font-tabular text-stone-700 font-semibold">
                        {formatCurrency(sale.subtotal, settings.currencySymbol)}
                      </strong>
                    </p>
                  </div>

                  <div className="text-left sm:text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                    <span className="text-xs text-stone-500 block">Gross Daily Total</span>
                    <span className="text-lg sm:text-xl font-bold text-stone-900 font-tabular block">
                      {formatCurrency(sale.totalAmount, settings.currencySymbol)}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700 font-tabular inline-block mt-0.5">
                      15% VAT: +{formatCurrency(sale.taxAmount, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs text-stone-500">
                  <span className="truncate max-w-[70%]">
                    {sale.notes || 'Daily total sales summary'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditSaleModal(sale)}
                      title="Edit daily sales entry"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-stone-700 bg-stone-100 hover:bg-stone-200 font-semibold transition cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-orange-700" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSale(sale.id)}
                      title="Delete daily sales entry"
                      className="p-1.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-semibold text-stone-700">Sales Date *</span>
              <input
                type="date"
                required
                value={saleDate}
                onChange={(e) => {
                  const newD = normalizeDateString(e.target.value);
                  setSaleDate(newD);
                  if (!editingSale) {
                    setReceiptRange(`DS-${newD}`);
                  }
                }}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
              />
            </div>

            <div>
              <span className="text-xs font-semibold text-stone-700">Receipt Book Range / FS Ref # *</span>
              <input
                type="text"
                required
                value={receiptRange}
                onChange={(e) => setReceiptRange(e.target.value)}
                placeholder="e.g. FS 001-045 or DS-2026-10-29"
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs font-mono text-stone-900 font-bold focus:outline-none focus:border-orange-700"
              />
            </div>
          </div>

          {/* Existing Record Notice & Mode Selector (Never locks out the user) */}
          {existingSaleOnSelectedDate && !editingSale && (
            <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs space-y-2.5 animate-fadeIn">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-stone-900">
                    A daily sales entry already exists for {formatCalendarDate(saleDate)}
                  </p>
                  <p className="text-stone-700 leading-relaxed text-[11px]">
                    Current record: <strong className="font-mono">{existingSaleOnSelectedDate.receiptNumber}</strong> —{' '}
                    <strong className="font-tabular">{formatCurrency(existingSaleOnSelectedDate.totalAmount, settings.currencySymbol)}</strong>{' '}
                    (Cash: {formatCurrency(getSaleCashAmount(existingSaleOnSelectedDate), settings.currencySymbol)}, Transfer: {formatCurrency(getSaleBankTransferAmount(existingSaleOnSelectedDate), settings.currencySymbol)})
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/80">
                <span className="text-[11px] font-semibold text-stone-600">Save Action:</span>
                <button
                  type="button"
                  onClick={() => setIsAppendMode(false)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    !isAppendMode
                      ? 'bg-amber-900 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  Update / Overwrite Entry
                </button>
                <button
                  type="button"
                  onClick={() => setIsAppendMode(true)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isAppendMode
                      ? 'bg-amber-900 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  + Add / Append to Existing Amount
                </button>
                <button
                  type="button"
                  onClick={() => openEditSaleModal(existingSaleOnSelectedDate)}
                  className="px-2 py-1 rounded-lg text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 ml-auto cursor-pointer"
                >
                  Load Saved Values
                </button>
              </div>
            </div>
          )}

          {/* Sales Amount Entry: User enters Total Daily Sales and Bank Transfer Sales -> Cash is automatically calculated */}
          <div className="space-y-3.5">
            {/* Input 1: Total Daily Sales */}
            <div className="p-4 rounded-2xl bg-white border-2 border-stone-300 focus-within:border-orange-700 transition space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="total-daily-sales-input"
                  className="text-xs font-bold text-stone-900 flex items-center gap-1.5"
                >
                  <TrendingUp className="w-4 h-4 text-orange-700" />
                  <span>1. Enter Total Daily Sales ({settings.currencySymbol.trim()}) *</span>
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800 bg-orange-100 px-2 py-0.5 rounded-full">
                  Primary Entry
                </span>
              </div>
              <input
                id="total-daily-sales-input"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
                placeholder="e.g. 85000.00"
                value={totalDailyAmount || ''}
                onChange={(e) => handleTotalChange(parseFloat(e.target.value || '0'))}
                className="w-full text-xl sm:text-2xl font-bold text-stone-900 font-tabular placeholder-stone-300 focus:outline-none"
              />
              <p className="text-[11px] text-stone-500">
                Combined daily gross sales (from your register summary or cash register Z-report).
              </p>
            </div>

            {/* Input 2: Bank Transfer Sales */}
            <div className="p-4 rounded-2xl bg-purple-50/40 border border-purple-200 focus-within:border-purple-600 transition space-y-1.5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <label
                  htmlFor="bank-transfer-sales-input"
                  className="text-xs font-bold text-purple-950 flex items-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4 text-purple-700" />
                  <span>2. Enter Bank Transfer Sales ({settings.currencySymbol.trim()})</span>
                </label>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={handleQuickSetAllCash}
                    className="px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-900 hover:bg-purple-100 font-semibold transition cursor-pointer"
                    title="Set bank transfer to 0 (all sales received as cash)"
                  >
                    All Cash (0 Transfer)
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickSetAllTransfer}
                    className="px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-900 hover:bg-purple-100 font-semibold transition cursor-pointer"
                    title="Set bank transfer to full sales amount"
                  >
                    100% Transfer
                  </button>
                </div>
              </div>
              <input
                id="bank-transfer-sales-input"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                value={dailyTransferAmount || ''}
                onChange={(e) => handleTransferChange(parseFloat(e.target.value || '0'))}
                className="w-full text-lg sm:text-xl font-bold text-stone-900 font-tabular placeholder-stone-300 focus:outline-none"
              />
              <p className="text-[11px] text-stone-600">
                Amount received via CBE Birr, Telebirr, Awash, or Card POS. (Leave 0 if all sales were in cash).
              </p>
            </div>

            {/* Automatically Calculated Daily Cash Sales Display Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white border-2 border-emerald-300 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                    <Coins className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Daily Cash Sales (In Cash Drawer)
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-xs">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Automatically Calculated</span>
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-emerald-950 font-tabular">
                    {formatCurrency(resolvedCashAmount, settings.currencySymbol)}
                  </span>
                  <span className="text-xs font-semibold text-emerald-800">
                    physical cash
                  </span>
                </div>
                <span className="text-xs font-semibold text-stone-600 font-tabular bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                  {calculatedTotal > 0
                    ? `${Math.round((resolvedCashAmount / calculatedTotal) * 100)}% of sales`
                    : '100% of sales'}
                </span>
              </div>

              <div className="text-[11px] text-stone-600 pt-2 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-1">
                <span>
                  Calculation formula: Total ({formatCurrency(calculatedTotal, settings.currencySymbol)}) − Transfer ({formatCurrency(resolvedTransferAmount, settings.currencySymbol)})
                </span>
                <span className="font-bold text-emerald-900">
                  = {formatCurrency(resolvedCashAmount, settings.currencySymbol)} Cash
                </span>
              </div>

              {dailyTransferAmount > calculatedTotal && calculatedTotal > 0 && (
                <p className="text-[11px] font-semibold text-amber-800 bg-amber-100 p-2 rounded-lg border border-amber-300">
                  Notice: Bank transfer amount exceeds total daily sales. Cash cannot be negative.
                </p>
              )}
            </div>
          </div>

          {/* 15% VAT Calculation Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <span className="text-xs text-stone-600 block mb-1">How is 15% VAT calculated?</span>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-stone-100 border border-stone-200">
                <button
                  type="button"
                  onClick={() => setTaxMode('inclusive')}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
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

          {/* Bank Account Selection for Transfer Amount */}
          {resolvedTransferAmount > 0 && bankAccounts.length > 0 && (
            <div>
              <span className="text-xs text-stone-600">Which Bank Received the Transfer Amount?</span>
              <select
                value={selectedBankId || bankAccounts[0]?.id || ''}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 font-medium"
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
              placeholder="e.g. Daily sales register summary, shift A & B"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:border-orange-700"
            />
          </div>

          {/* Live Mathematical Breakdown */}
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
              <span>Sales Before VAT (Base Revenue):</span>
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
            {existingSaleOnSelectedDate && isAppendMode && (
              <div className="pt-1.5 border-t border-amber-200 text-amber-900 flex justify-between font-semibold">
                <span>Projected Combined Total for {formatCalendarDate(saleDate)}:</span>
                <span className="font-tabular">
                  {formatCurrency(
                    existingSaleOnSelectedDate.totalAmount + calculatedTotal,
                    settings.currencySymbol
                  )}
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition cursor-pointer shadow-xs"
          >
            {isAppendMode && existingSaleOnSelectedDate
              ? `Append & Consolidate Daily Sales for ${formatCalendarDate(saleDate)}`
              : editingSale || existingSaleOnSelectedDate
              ? `Update Daily Sales Entry (${saleDate})`
              : 'Save Total Daily Sales'}
          </button>
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
