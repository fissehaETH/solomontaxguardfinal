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
  unreconciledBankCount: number;
  auditIssuesCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Home',
      icon: LayoutDashboard,
    },
    {
      id: 'sales' as ActiveTab,
      label: 'Sales',
      icon: TrendingUp,
    },
    {
      id: 'purchases' as ActiveTab,
      label: 'Purchases',
      icon: Receipt,
    },
    {
      id: 'bank' as ActiveTab,
      label: 'Bank',
      icon: Landmark,
    },
    {
      id: 'audit' as ActiveTab,
      label: 'Tax Check',
      icon: ShieldCheck,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 pb-safe no-print">
      <div className="max-w-md mx-auto grid grid-cols-5 items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
                isActive ? 'text-orange-700 font-semibold' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
