import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  Share2,
  PlusSquare,
  CheckCircle2,
  X,
  ExternalLink,
  Laptop,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  onInstall: () => Promise<boolean>;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isInstallable,
  isInstalled,
  isIOS,
  isAndroid,
  onInstall,
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'desktop'>(
    isIOS ? 'ios' : isAndroid ? 'android' : 'android'
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      const success = await onInstall();
      if (success) {
        setInstallSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-600 via-orange-700 to-amber-600 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md p-2 flex items-center justify-center border border-white/20 shadow-md">
              <img
                src="/pwa-192x192.png"
                alt="TaxGuard App Icon"
                className="w-8 h-8 rounded-lg object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/20 uppercase tracking-wider text-white">
                  Add to Home Screen
                </span>
                <span className="text-[11px] text-orange-200">Standalone App</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-white mt-0.5">
                Launch TaxGuard from Home Screen
              </h3>
              <p className="text-xs text-orange-100 mt-0.5">
                Open directly from your phone or tablet with no browser address bar!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Operating System Platform Selector */}
        <div className="bg-stone-100 dark:bg-stone-800/60 p-2 border-b border-stone-200 dark:border-stone-800 flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'android'
                ? 'bg-white dark:bg-stone-800 text-orange-800 dark:text-orange-300 shadow-xs border border-stone-200 dark:border-stone-700'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android / Chrome</span>
          </button>

          <button
            onClick={() => setActiveTab('ios')}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-white dark:bg-stone-800 text-orange-800 dark:text-orange-300 shadow-xs border border-stone-200 dark:border-stone-700'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>iPhone / iPad (iOS)</span>
          </button>

          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-white dark:bg-stone-800 text-orange-800 dark:text-orange-300 shadow-xs border border-stone-200 dark:border-stone-700'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>PC / Mac / Chrome</span>
          </button>
        </div>

        {/* Modal Body Instructions */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-stone-700 dark:text-stone-300 flex-1 leading-relaxed">
          {installSuccess ? (
            <div className="p-6 text-center space-y-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h4 className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                TaxGuard Successfully Installed!
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                The app icon is now on your home screen. You can close your browser and launch TaxGuard directly from your home screen.
              </p>
            </div>
          ) : (
            <>
              {/* Feature Benefit Highlights */}
              <div className="grid grid-cols-2 gap-2 pb-2">
                <div className="p-2.5 rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/40">
                  <span className="font-bold text-orange-900 dark:text-orange-200 block text-[11px]">
                    ✨ No Browser Address Bar
                  </span>
                  <span className="text-[10px] text-stone-600 dark:text-stone-400 mt-0.5 block">
                    Opens full screen just like a native mobile app.
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                  <span className="font-bold text-stone-900 dark:text-stone-100 block text-[11px]">
                    ⚡ Instant 1-Tap Launch
                  </span>
                  <span className="text-[10px] text-stone-600 dark:text-stone-400 mt-0.5 block">
                    Never type the web address again.
                  </span>
                </div>
              </div>

              {/* 1-Tap Install Action for Chrome / Android */}
              {isInstallable && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 dark:from-stone-800 dark:to-orange-950/30 border border-orange-200 dark:border-orange-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                        Ready for 1-Tap Home Screen Installation
                      </h4>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400">
                        Browser is ready to add TaxGuard to your home screen now.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleInstallClick}
                    disabled={isInstalling}
                    className="w-full py-2.5 px-4 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isInstalling ? 'Installing to Home Screen...' : 'Add to Home Screen Now'}</span>
                  </button>
                </div>
              )}

              {/* TAB 1: ANDROID INSTRUCTIONS */}
              {activeTab === 'android' && (
                <div className="space-y-3">
                  <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                    Instructions for Android (Chrome, Samsung Internet, Edge):
                  </h4>
                  <ol className="space-y-2.5">
                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">Tap Browser Menu (⋮)</strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          In Google Chrome or Samsung Internet, tap the <strong>three dots (⋮)</strong> in the top right corner (or bottom right).
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">Tap &quot;Add to Home screen&quot; or &quot;Install app&quot;</strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          Select <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install application&quot;</strong> from the menu options.
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">Confirm &quot;Install / Add&quot;</strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          Confirm the prompt. The <strong>TaxGuard</strong> icon will appear on your phone&apos;s home screen next to your other apps.
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>
              )}

              {/* TAB 2: iOS / SAFARI INSTRUCTIONS */}
              {activeTab === 'ios' && (
                <div className="space-y-3">
                  <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                    Instructions for iPhone &amp; iPad (Safari):
                  </h4>
                  <ol className="space-y-2.5">
                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">Open in Apple Safari</strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          Make sure you are viewing this page in the default Safari browser.
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">
                          Tap the Share Icon (<Share2 className="w-3.5 h-3.5 inline text-blue-600" />)
                        </strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          Tap the square <strong>Share</strong> button with an upward arrow at the bottom of the screen (or top on iPad).
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">
                          Scroll down and tap &quot;Add to Home Screen&quot; (<PlusSquare className="w-3.5 h-3.5 inline text-stone-700 dark:text-stone-300" />)
                        </strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          Scroll through the share options and tap <strong>&quot;Add to Home Screen&quot;</strong>, then tap <strong>&quot;Add&quot;</strong> in the top right.
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>
              )}

              {/* TAB 3: DESKTOP INSTRUCTIONS */}
              {activeTab === 'desktop' && (
                <div className="space-y-3">
                  <h4 className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                    Instructions for Desktop / Laptop (Chrome, Edge, Brave):
                  </h4>
                  <ol className="space-y-2.5">
                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">Look at the Browser Address Bar</strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          On the right side of your address bar (next to the bookmark star), look for the <strong>Install App icon (computer screen with down arrow)</strong>.
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800">
                      <span className="w-5 h-5 rounded-full bg-orange-700 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div>
                        <strong className="text-stone-900 dark:text-stone-100">Click &quot;Install TaxGuard&quot;</strong>
                        <p className="text-stone-600 dark:text-stone-400 text-[11px] mt-0.5">
                          Click <strong>&quot;Install&quot;</strong>. TaxGuard will open in its own clean window without tabs, and create a desktop shortcut.
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-stone-50 dark:bg-stone-800/50 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 text-xs">
          <span className="text-stone-500 text-[11px]">
            Launches in full standalone mode
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold hover:bg-stone-800 dark:hover:bg-white transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
