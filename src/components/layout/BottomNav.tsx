import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Landmark,
  ShieldCheck,
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'sales' | 'purchases' | 'bank' | 'audit';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unreconciledBankCount?: number;
  auditIssuesCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  unreconciledBankCount = 0,
  auditIssuesCount = 0,
}) => {
  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore vibration errors if blocked by browser policy
      }
    }
  };

  const navItems: {
    id: ActiveTab;
    label: string;
    amharic: string;
    icon: React.FC<{ className?: string }>;
    badgeCount?: number;
    badgeColor?: string;
  }[] = [
    {
      id: 'dashboard',
      label: 'Home',
      amharic: 'መነሻ',
      icon: LayoutDashboard,
    },
    {
      id: 'sales',
      label: 'Sales',
      amharic: 'ሽያጭ',
      icon: TrendingUp,
    },
    {
      id: 'purchases',
      label: 'Purchases',
      amharic: 'ግዢ',
      icon: Receipt,
    },
    {
      id: 'bank',
      label: 'Bank',
      amharic: 'ባንክ',
      icon: Landmark,
      badgeCount: unreconciledBankCount,
      badgeColor: 'bg-amber-500 text-white',
    },
    {
      id: 'audit',
      label: 'Tax Check',
      amharic: 'ግብር',
      icon: ShieldCheck,
      badgeCount: auditIssuesCount,
      badgeColor: 'bg-rose-500 text-white',
    },
  ];

  return (
    <nav
      aria-label="Android Bottom Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] no-print transition-colors"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 items-center h-16 px-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => {
                triggerHaptic();
                setActiveTab(item.id);
              }}
              className="group relative flex flex-col items-center justify-center min-h-[52px] py-1 transition-all focus:outline-hidden"
              aria-label={`${item.label} (${item.amharic})`}
            >
              {/* Material 3 active indicator pill */}
              <div
                className={`relative flex items-center justify-center px-4 py-1 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-400 scale-105'
                    : 'text-stone-500 dark:text-stone-400 group-hover:text-stone-900 dark:group-hover:text-stone-100 hover:bg-stone-100/50 dark:hover:bg-stone-800/50'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />

                {/* Badge notification counter */}
                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-1 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full shadow-xs ${
                      item.badgeColor || 'bg-amber-500 text-white'
                    }`}
                  >
                    {item.badgeCount > 99 ? '99+' : item.badgeCount}
                  </span>
                )}
              </div>

              {/* Label & Amharic Subtitle */}
              <span
                className={`text-[10px] tracking-tight mt-0.5 leading-none transition-colors ${
                  isActive
                    ? 'font-bold text-orange-700 dark:text-orange-400'
                    : 'font-medium text-stone-500 dark:text-stone-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
