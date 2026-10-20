import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Smartphone, Download, CheckCircle2, Share2, PlusSquare } from 'lucide-react';
import { PWAInstallModal } from './PWAInstallModal';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'button' | 'banner' | 'drawer';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'button',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If already running in standalone mode on home screen, do not clutter UI
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setIsModalOpen(true);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  if (variant === 'banner') {
    return (
      <>
        <div className="bg-gradient-to-r from-orange-900 via-stone-900 to-amber-950 text-white px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs border-b border-orange-800/40 no-print shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-orange-700/80 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-white block truncate">
                Launch from Home Screen
              </span>
              <span className="text-[11px] text-orange-200 block truncate">
                Open directly without typing address in browser
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleClick}
              className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isInstallable ? 'Install App' : 'Add to Home'}</span>
            </button>
          </div>
        </div>

        <PWAInstallModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          isAndroid={isAndroid}
          onInstall={install}
        />
      </>
    );
  }

  if (variant === 'drawer') {
    return (
      <>
        <button
          onClick={handleClick}
          className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 border border-orange-200 dark:border-orange-800 text-stone-900 transition-colors min-h-[48px] cursor-pointer ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-700 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold block text-stone-900 dark:text-stone-100">
                Add to Home Screen
              </span>
              <span className="text-[11px] text-orange-800 dark:text-orange-300 block">
                በስልክዎ መነሻ ገጽ ላይ ይጫኑ (No URL required)
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-700 text-white">
            Install
          </span>
        </button>

        <PWAInstallModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          isAndroid={isAndroid}
          onInstall={install}
        />
      </>
    );
  }

  // Default button variant for top navigation header
  return (
    <>
      <button
        onClick={handleClick}
        title="Add TaxGuard to your home screen (no browser address bar)"
        aria-label="Add TaxGuard to Home Screen"
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 rounded-lg shadow-xs transition whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer ${className}`}
      >
        <Smartphone className="w-3.5 h-3.5 text-amber-200 shrink-0" />
        <span className="hidden sm:inline">Add to Home Screen</span>
        <span className="sm:hidden">Install</span>
      </button>

      <PWAInstallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isIOS={isIOS}
        isAndroid={isAndroid}
        onInstall={install}
      />
    </>
  );
};
