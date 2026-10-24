import React, { useState, useEffect } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { BottomNav, ActiveTab } from './BottomNav';
import { OfflineIndicator } from '../common/OfflineIndicator';
import {
  HelpCircle,
  LogOut,
  Settings,
  Menu,
  X,
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Landmark,
  ShieldCheck,
  Download,
  Cloud,
  Sun,
  Moon,
  Sparkles,
  Smartphone,
  Plus,
  Camera,
  LogIn,
  RefreshCw,
  User as UserIcon,
  FileSpreadsheet,
} from 'lucide-react';

interface AndroidShellProps {
  children: React.ReactNode;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onQuickExport: () => void;
  onOpenAICopilot?: () => void;
  onOpenAddSale?: () => void;
  onOpenAddPurchase?: () => void;
  onOpenBankDeposit?: () => void;
  onOpenScanReceipt?: () => void;
  onOpenGoogleSheets?: () => void;
  businessName: string;
  userEmail?: string | null;
  userName?: string | null;
  userPhoto?: string | null;
  onSignInGoogle?: () => void;
  onRefreshFromCloud?: () => void;
  onSignOut?: () => void;
  unreconciledBankCount?: number;
  auditIssuesCount?: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isQuotaExceeded?: boolean;
  pendingSyncCount?: number;
  onOpenSyncModal?: () => void;
  autoSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  lastAutoSyncTime?: string | null;
  hasAppsScriptUrl?: boolean;
}

export const AndroidShell: React.FC<AndroidShellProps> = ({
  children,
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenHelp,
  onQuickExport,
  onOpenAICopilot,
  onOpenAddSale,
  onOpenAddPurchase,
  onOpenBankDeposit,
  onOpenScanReceipt,
  onOpenGoogleSheets,
  businessName,
  userEmail,
  userName,
  userPhoto,
  onSignInGoogle,
  onRefreshFromCloud,
  onSignOut,
  unreconciledBankCount = 0,
  auditIssuesCount = 0,
  theme,
  onToggleTheme,
  isQuotaExceeded = false,
  pendingSyncCount = 0,
  onOpenSyncModal,
  autoSyncStatus = 'idle',
  lastAutoSyncTime,
  hasAppsScriptUrl = false,
}) => {
  const isOnline = useOnlineStatus();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);

  const handleManualCloudRefresh = async () => {
    if (!onRefreshFromCloud || isRefreshingCloud) return;
    setIsRefreshingCloud(true);
    try {
      await onRefreshFromCloud();
    } finally {
      setIsRefreshingCloud(false);
    }
  };

  const triggerHaptic = (duration = 10) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {
        // Ignore
      }
    }
  };

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems: {
    id: ActiveTab;
    label: string;
    amharicLabel: string;
    icon: React.FC<{ className?: string }>;
    badgeCount?: number;
  }[] = [
    {
      id: 'dashboard',
      label: 'Home Summary',
      amharicLabel: 'አጠቃላይ እይታ',
      icon: LayoutDashboard,
    },
    {
      id: 'sales',
      label: 'Daily Sales',
      amharicLabel: 'የዕለት ሽያጭ',
      icon: TrendingUp,
    },
    {
      id: 'purchases',
      label: 'Purchases & Expenses',
      amharicLabel: 'የዕቃ ግዢ እና ወጪ',
      icon: Receipt,
    },
    {
      id: 'bank',
      label: 'Bank & Balance Check',
      amharicLabel: 'ባንክ እና ሂሳብ ማመሳከሪያ',
      icon: Landmark,
      badgeCount: unreconciledBankCount,
    },
    {
      id: 'audit',
      label: 'Tax & Profit Check',
      amharicLabel: 'የግብር እና ትርፍ ማጠቃለያ',
      icon: ShieldCheck,
      badgeCount: auditIssuesCount,
    },
  ];

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-stone-900 flex flex-col antialiased selection:bg-orange-700 selection:text-white">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200 no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Left: Hamburger Button (Mobile & Tablet < 1024px) + Brand Title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden inline-flex items-center justify-center p-2 -ml-1 rounded-xl text-stone-800 hover:bg-stone-100 border border-stone-200 transition-colors shrink-0 min-h-[40px] min-w-[40px]"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <button
                onClick={() => setActiveTab('dashboard')}
                className="text-sm sm:text-base font-bold tracking-tight text-stone-900 text-left block truncate max-w-full"
                title={businessName}
              >
                {businessName}
              </button>
              <p className="text-[11px] text-stone-500 truncate lg:hidden">
                {navItems.find((item) => item.id === activeTab)?.label}
              </p>
            </div>
          </div>

          {/* Center: Desktop Navigation Links (Only >= 1024px) */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600 shrink-0"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-orange-700 text-stone-900 font-semibold'
                      : 'border-transparent text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right: AI Copilot + Theme Toggle + Desktop Utility Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenAICopilot && (
              <button
                onClick={onOpenAICopilot}
                title="TaxGuard AI Auditor & CPA Copilot (Gemini 3.8)"
                aria-label="Open AI Tax Copilot"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-orange-950 dark:text-orange-200 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-950/70 dark:to-amber-950/50 border border-orange-300 dark:border-orange-800 rounded-lg hover:brightness-105 transition shadow-xs whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-700 dark:text-amber-300 shrink-0" />
                <span className="hidden sm:inline">AI Copilot</span>
                <span className="sm:hidden">AI</span>
              </button>
            )}

            {/* Phone Storage & Online Sync Button */}
            {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                title={
                  isQuotaExceeded
                    ? 'Cloud Quota Exceeded — Data safe in Phone Local Storage (Click to manage)'
                    : pendingSyncCount > 0
                    ? `${pendingSyncCount} changes saved in phone storage waiting to sync`
                    : 'Phone Local Storage is Active & Synced'
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer ${
                  isQuotaExceeded
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                    : pendingSyncCount > 0
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-orange-700 dark:text-orange-400 shrink-0" />
                <span className="hidden sm:inline">
                  {isQuotaExceeded
                    ? 'Phone Storage'
                    : pendingSyncCount > 0
                    ? `${pendingSyncCount} pending`
                    : 'Storage & Sync'}
                </span>
                {pendingSyncCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </button>
            )}

            {/* Google Sheets Dual Storage & Auto-Sync Status Button */}
            {onOpenGoogleSheets && (
              <button
                onClick={onOpenGoogleSheets}
                title={
                  hasAppsScriptUrl
                    ? autoSyncStatus === 'syncing'
                      ? 'Syncing latest records to Google Sheets...'
                      : autoSyncStatus === 'error'
                      ? 'Auto-sync issue detected. Click to check settings.'
                      : autoSyncStatus === 'offline'
                      ? 'Offline: Changes queued and will auto-sync to Sheets once online'
                      : `Google Sheets Auto-Sync is Active${
                          lastAutoSyncTime
                            ? ` · Last synced: ${new Date(lastAutoSyncTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''
                        }`
                    : 'Set up Google Sheets for automatic cloud sync'
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer ${
                  autoSyncStatus === 'syncing'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border-emerald-400 dark:border-emerald-600'
                    : autoSyncStatus === 'error'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-400 dark:border-amber-600'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                }`}
              >
                {autoSyncStatus === 'syncing' ? (
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                )}
                <span className="hidden sm:inline">
                  {autoSyncStatus === 'syncing'
                    ? 'Syncing to Sheets...'
                    : autoSyncStatus === 'error'
                    ? 'Sheets Warning'
                    : 'Google Sheets'}
                </span>
                {hasAppsScriptUrl && autoSyncStatus !== 'syncing' && autoSyncStatus !== 'error' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            )}

            <button
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-800 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-stone-700 shrink-0" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </>
              )}
            </button>

            {/* User Profile Chip or Guest Sign In CTA */}
            {userEmail && !userEmail.includes('Phone Local') ? (
              <div className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs shrink-0">
                {userPhoto ? (
                  <img
                    src={userPhoto}
                    alt={userName || 'User'}
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {(userName || userEmail || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden md:inline font-medium text-stone-700 dark:text-stone-300 max-w-[110px] truncate">
                  {userName || userEmail.split('@')[0]}
                </span>
                {onRefreshFromCloud && (
                  <button
                    onClick={handleManualCloudRefresh}
                    title="Refresh local ledger"
                    disabled={isRefreshingCloud}
                    className="p-1 text-stone-500 hover:text-orange-700 transition-colors cursor-pointer rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin text-orange-700' : ''}`} />
                  </button>
                )}
              </div>
            ) : onSignInGoogle ? (
              <button
                onClick={onSignInGoogle}
                title="Sign in with Google"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-orange-700 hover:bg-orange-800 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            ) : null}

            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <button
                onClick={onOpenHelp}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-800 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
              >
                <HelpCircle className="w-3.5 h-3.5 text-orange-700 shrink-0" />
                <span>አጠቃቀም (How to Use)</span>
              </button>

              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>Tax Settings</span>
              </button>

              {onSignOut && (
                <button
                  onClick={onSignOut}
                  title={userEmail ? `Sign out (${userEmail})` : 'Sign out'}
                  className="inline-flex items-center justify-center p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-300 rounded-lg transition-colors shrink-0 min-h-[38px] min-w-[38px]"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quota Exceeded Notice Bar */}
        {isQuotaExceeded && (
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/70 dark:to-orange-950/70 border-t border-amber-300 dark:border-amber-800 px-4 py-2 flex items-center justify-between text-xs text-amber-950 dark:text-amber-200 no-print">
            <div className="flex items-center gap-2 min-w-0">
              <Smartphone className="w-4 h-4 text-orange-700 dark:text-orange-400 shrink-0" />
              <span className="font-medium truncate">
                Cloud database free daily quota exceeded — App is running safely on phone storage. All entries are preserved.
              </span>
            </div>
            {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="ml-3 font-bold text-orange-700 dark:text-orange-400 underline hover:text-orange-900 shrink-0 cursor-pointer"
              >
                Manage Storage & Sync
              </button>
            )}
          </div>
        )}

        {/* Offline Connectivity Notice */}
        {!isOnline && !isQuotaExceeded && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 text-center text-xs text-amber-900">
            Offline mode active — Changes are stored in phone storage and will sync automatically when online.
          </div>
        )}
      </header>

      {/* Mobile & Tablet Slide-Over Sidebar Drawer (< 1024px) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          {/* Backdrop */}
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Sidebar Panel */}
          <aside className="relative z-10 w-80 max-w-[85vw] bg-white h-full shadow-2xl border-r border-stone-200 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Sidebar Header with User Avatar & Cloud Status */}
              <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-start justify-between gap-3 bg-stone-50/80 dark:bg-stone-900/60">
                <div className="min-w-0 flex items-start gap-3">
                  {userPhoto ? (
                    <img
                      src={userPhoto}
                      alt={userName || 'User'}
                      className="w-10 h-10 rounded-full border border-stone-300 dark:border-stone-700 object-cover shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-orange-700/10 border border-orange-700/30 flex items-center justify-center text-orange-700 font-bold shrink-0 mt-0.5">
                      {(userName || userEmail || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                      {businessName}
                    </p>
                    {userName && (
                      <p className="text-xs font-semibold text-stone-700 dark:text-stone-300 truncate">
                        {userName}
                      </p>
                    )}
                    {userEmail && (
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-stone-500 truncate">
                        <Cloud className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">{userEmail}</span>
                      </div>
                    )}
                    {userEmail && !userEmail.includes('Phone Local') ? (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Google Verified • Cloud Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        Phone Local Mode (Offline)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label="Close sidebar"
                  className="p-2 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 transition-colors shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Guest Mode Call-to-action in Drawer */}
              {onSignInGoogle && (!userEmail || userEmail.includes('Phone Local')) && (
                <div className="p-3 bg-orange-50/70 dark:bg-orange-950/40 border-b border-orange-200 dark:border-orange-900/50">
                  <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    Backup to Cloud Firestore
                  </p>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                    Sign in with Google to protect your records with multi-device online sync.
                  </p>
                  <button
                    onClick={() => {
                      setIsSidebarOpen(false);
                      onSignInGoogle();
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign in with Google</span>
                  </button>
                </div>
              )}

              {/* Section 1: Main Shop Sections */}
              <div className="p-3 space-y-1">
                <p className="px-3 py-1.5 text-[11px] font-semibold text-stone-400">
                  Shop Sections (ዋና ክፍሎች)
                </p>

                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left transition-colors min-h-[48px] ${
                        isActive
                          ? 'bg-orange-700 text-white font-semibold shadow-xs'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-5 h-5 shrink-0 ${
                            isActive ? 'text-white' : 'text-stone-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <span className="text-sm block truncate">
                            {item.label}
                          </span>
                          <span
                            className={`text-[11px] block truncate ${
                              isActive ? 'text-orange-100' : 'text-stone-400'
                            }`}
                          >
                            {item.amharicLabel}
                          </span>
                        </div>
                      </div>

                      {item.badgeCount !== undefined && item.badgeCount > 0 && (
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md shrink-0 ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {item.badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Section 2: Tools, Help & Settings */}
              <div className="p-3 pt-2 border-t border-stone-200 space-y-1">
                <p className="px-3 py-1.5 text-[11px] font-semibold text-stone-400">
                  Options &amp; Help (አማራጮች እና መመሪያ)
                </p>

                <button
                  onClick={onToggleTheme}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left text-stone-700 hover:bg-stone-100 transition-colors min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Sun className="w-5 h-5 text-amber-400 shrink-0" />
                    ) : (
                      <Moon className="w-5 h-5 text-stone-600 shrink-0" />
                    )}
                    <div>
                      <span className="text-sm font-medium block text-stone-900">
                        {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                      </span>
                      <span className="text-[11px] text-stone-500 block">
                        {theme === 'dark' ? 'ብሩህ እይታ (Light Theme)' : 'ጨለማ እይታ (Dark Theme)'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-300">
                    {theme === 'dark' ? 'Dark' : 'Light'}
                  </span>
                </button>

                {onOpenGoogleSheets && (
                  <button
                    onClick={() => {
                      setIsSidebarOpen(false);
                      onOpenGoogleSheets();
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-stone-900 transition-colors min-h-[48px] cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                      </div>
                      <div>
                        <span className="text-sm font-bold block text-stone-900 dark:text-stone-100">
                          Google Sheets {hasAppsScriptUrl ? 'Auto-Sync' : 'Cloud Sync'}
                        </span>
                        <span className="text-[11px] text-emerald-800 dark:text-emerald-300 block">
                          {hasAppsScriptUrl
                            ? 'የራስ-ሰር ደመና ማመሳሰል (Active Auto-Sync)'
                            : 'በጉግል ሺት ላይ ማስቀመጫ (Multi-Tab Cloud Sync)'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-900 uppercase">
                      {hasAppsScriptUrl ? 'Auto' : 'Sheets'}
                    </span>
                  </button>
                )}

                {onOpenAICopilot && (
                  <button
                    onClick={() => {
                      setIsSidebarOpen(false);
                      onOpenAICopilot();
                    }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 border border-orange-200 dark:border-orange-800 text-stone-900 transition-colors min-h-[48px]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-700 text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-amber-200" />
                    </div>
                    <div>
                      <span className="text-sm font-bold block text-stone-900 dark:text-stone-100">
                        TaxGuard AI Copilot
                      </span>
                      <span className="text-[11px] text-orange-800 dark:text-orange-300 block">
                        የግብር AI ረዳት (Pre-Audit &amp; CPA Advisor)
                      </span>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenHelp();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-stone-700 hover:bg-stone-100 transition-colors min-h-[48px]"
                >
                  <HelpCircle className="w-5 h-5 text-orange-700 shrink-0" />
                  <div>
                    <span className="text-sm font-medium block text-stone-900">
                      How to Use Guide
                    </span>
                    <span className="text-[11px] text-stone-500 block">
                      የአጠቃቀም መመሪያ (በአማርኛ)
                    </span>
                  </div>
                </button>

                {/* Manual Cloud Sync Option when signed in */}
                {onRefreshFromCloud && userEmail && !userEmail.includes('Phone Local') && (
                  <button
                    onClick={() => {
                      setIsSidebarOpen(false);
                      handleManualCloudRefresh();
                    }}
                    disabled={isRefreshingCloud}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-stone-700 hover:bg-stone-100 transition-colors min-h-[48px] cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <RefreshCw className={`w-5 h-5 text-emerald-600 shrink-0 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
                      <div>
                        <span className="text-sm font-medium block text-stone-900">
                          Sync Cloud Database Now
                        </span>
                        <span className="text-[11px] text-stone-500 block">
                          ወደ ክላውድ አመሳስል (Pull &amp; Push Firestore)
                        </span>
                      </div>
                    </div>
                    {isRefreshingCloud ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 animate-pulse">
                        Syncing...
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                        Active
                      </span>
                    )}
                  </button>
                )}

                {onOpenSyncModal && (
                  <button
                    onClick={() => {
                      setIsSidebarOpen(false);
                      onOpenSyncModal();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-stone-700 hover:bg-stone-100 transition-colors min-h-[48px]"
                  >
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-orange-700 shrink-0" />
                      <div>
                        <span className="text-sm font-medium block text-stone-900">
                          Phone Storage &amp; Sync
                        </span>
                        <span className="text-[11px] text-stone-500 block">
                          የስልክ ማከማቻ እና የክላውድ ማመሳሰያ
                        </span>
                      </div>
                    </div>
                    {pendingSyncCount > 0 ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {pendingSyncCount} pending
                      </span>
                    ) : isQuotaExceeded ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                        Local
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Synced
                      </span>
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-stone-700 hover:bg-stone-100 transition-colors min-h-[48px]"
                >
                  <Settings className="w-5 h-5 text-stone-600 shrink-0" />
                  <div>
                    <span className="text-sm font-medium block text-stone-900">
                      Shop & Tax Settings
                    </span>
                    <span className="text-[11px] text-stone-500 block">
                      TIN (0002769494), 15% VAT & Currency
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onQuickExport();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-stone-700 hover:bg-stone-100 transition-colors min-h-[48px]"
                >
                  <Download className="w-5 h-5 text-stone-600 shrink-0" />
                  <div>
                    <span className="text-sm font-medium block text-stone-900">
                      Download Report (Excel / CSV)
                    </span>
                    <span className="text-[11px] text-stone-500 block">
                      Save all sales, purchases & bank records
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Sidebar Footer: Sign Out */}
            {onSignOut && (
              <div className="p-3 border-t border-stone-200 bg-stone-50/70">
                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors min-h-[42px]"
                >
                  <LogOut className="w-4 h-4 text-stone-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-16">
        {children}
      </main>

      {/* Android Floating Action Button (FAB) & Quick-Action Speed Dial */}
      <div className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-40 no-print flex flex-col items-end">
        {/* Speed Dial Backdrop */}
        {isFabOpen && (
          <div
            onClick={() => setIsFabOpen(false)}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-30 transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* Speed Dial Menu Items */}
        {isFabOpen && (
          <div className="relative z-40 mb-3 flex flex-col items-end gap-2.5">
            {onOpenAddSale && (
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setIsFabOpen(false);
                  onOpenAddSale();
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xl border border-stone-200 dark:border-stone-700 hover:bg-orange-50 dark:hover:bg-orange-950/40 text-xs font-bold transition-transform active:scale-95"
              >
                <span>የዕለት ሽያጭ መዝግብ (Daily Sale)</span>
                <span className="w-8 h-8 rounded-full bg-orange-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <TrendingUp className="w-4 h-4" />
                </span>
              </button>
            )}

            {onOpenAddPurchase && (
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setIsFabOpen(false);
                  onOpenAddPurchase();
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xl border border-stone-200 dark:border-stone-700 hover:bg-orange-50 dark:hover:bg-orange-950/40 text-xs font-bold transition-transform active:scale-95"
              >
                <span>የዕቃ ግዢ / ወጪ (Add Expense)</span>
                <span className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Receipt className="w-4 h-4" />
                </span>
              </button>
            )}

            {onOpenScanReceipt && (
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setIsFabOpen(false);
                  onOpenScanReceipt();
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xl border border-stone-200 dark:border-stone-700 hover:bg-orange-50 dark:hover:bg-orange-950/40 text-xs font-bold transition-transform active:scale-95"
              >
                <span>ደረሰኝ በካሜራ አንሳ (Scan Receipt)</span>
                <span className="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Camera className="w-4 h-4" />
                </span>
              </button>
            )}

            {onOpenBankDeposit && (
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setIsFabOpen(false);
                  onOpenBankDeposit();
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xl border border-stone-200 dark:border-stone-700 hover:bg-orange-50 dark:hover:bg-orange-950/40 text-xs font-bold transition-transform active:scale-95"
              >
                <span>የባንክ ገቢ መዝግብ (Bank Deposit)</span>
                <span className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Landmark className="w-4 h-4" />
                </span>
              </button>
            )}
          </div>
        )}

        {/* Primary FAB Button (Material 3 style) */}
        <button
          onClick={() => {
            triggerHaptic(20);
            setIsFabOpen(!isFabOpen);
          }}
          aria-label={isFabOpen ? 'Close quick actions' : 'Open quick add actions'}
          aria-expanded={isFabOpen}
          className={`relative z-40 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 focus:outline-hidden ${
            isFabOpen
              ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rotate-45 scale-105'
              : 'bg-orange-700 hover:bg-orange-800 text-white active:scale-95'
          }`}
        >
          <Plus className="w-7 h-7 transition-transform duration-200" />
        </button>
      </div>

      {/* Android Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreconciledBankCount={unreconciledBankCount}
        auditIssuesCount={auditIssuesCount}
      />

      {/* Offline Status Indicator */}
      <OfflineIndicator />
    </div>
  );
};
