import React, { useState } from 'react';
import { TaxSettings } from '../../types';
import { CURRENCY_OPTIONS } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { RotateCcw, Save, ShieldAlert, Building2, Sun, Moon, FileSpreadsheet, ExternalLink } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TaxSettings;
  onSaveSettings: (settings: TaxSettings) => void;
  onResetData: () => void;
  theme: 'light' | 'dark';
  onSetTheme: (theme: 'light' | 'dark') => void;
  onOpenGoogleSheets?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onResetData,
  theme,
  onSetTheme,
  onOpenGoogleSheets,
}) => {
  const [formData, setFormData] = useState<TaxSettings>({ ...settings });
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  React.useEffect(() => {
    setFormData({ ...settings });
  }, [settings, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    onClose();
  };

  const handleCurrencyChange = (code: string) => {
    const selected = CURRENCY_OPTIONS.find((c) => c.code === code);
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        currency: selected.code,
        currencySymbol: selected.symbol,
      }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Shop & Tax Settings"
      subtitle="Update your shop name, TIN number, currency, and tax percentages"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2 pb-3 border-b border-stone-200">
          <label className="block text-xs font-semibold text-stone-700">
            Appearance (የገጽታ ምርጫ — Light / Dark Mode)
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-stone-100 border border-stone-200">
            <button
              type="button"
              onClick={() => onSetTheme('light')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                theme === 'light'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Light Mode (ብሩህ)</span>
            </button>
            <button
              type="button"
              onClick={() => onSetTheme('dark')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                theme === 'dark'
                  ? 'bg-orange-700 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Dark Mode (ጨለማ)</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-stone-700">
            Shop Details (Shown on Printed Reports)
          </label>

          <div>
            <span className="text-xs text-stone-600">Shop / Business Name</span>
            <div className="relative mt-1">
              <Building2 className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm text-stone-900 focus:outline-none focus:border-orange-700"
                placeholder="e.g. Solomon Building Materials Shop"
              />
            </div>
          </div>

          <div>
            <span className="text-xs text-stone-600">TIN (Taxpayer Identification Number)</span>
            <input
              type="text"
              required
              inputMode="numeric"
              value={formData.taxIdNumber}
              onChange={(e) => setFormData({ ...formData, taxIdNumber: e.target.value })}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm text-stone-900 font-mono focus:outline-none focus:border-orange-700"
              placeholder="0002769494"
            />
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-stone-200">
          <label className="block text-xs font-semibold text-stone-700">
            Currency & Tax Percentages
          </label>

          <div>
            <span className="text-xs text-stone-600">Money Currency</span>
            <select
              value={formData.currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm text-stone-900 focus:outline-none focus:border-orange-700"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-stone-600">Standard VAT Rate (%)</span>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  inputMode="decimal"
                  value={Math.round(formData.defaultSalesTaxRate * 1000) / 10}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultSalesTaxRate: parseFloat(e.target.value || '0') / 100,
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm text-stone-900 font-mono focus:outline-none focus:border-orange-700"
                />
                <span className="absolute right-3 top-2.5 text-xs text-stone-500">%</span>
              </div>
            </div>

            <div>
              <span className="text-xs text-stone-600">Yearly Profit Tax Rate (%)</span>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="60"
                  inputMode="decimal"
                  value={Math.round(formData.corporateTaxRate * 1000) / 10}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      corporateTaxRate: parseFloat(e.target.value || '0') / 100,
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-300 text-sm text-stone-900 font-mono focus:outline-none focus:border-orange-700"
                />
                <span className="absolute right-3 top-2.5 text-xs text-stone-500">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Google Sheets Dual Storage Settings */}
        <div className="space-y-3 pt-3 border-t border-stone-200">
          <label className="block text-xs font-semibold text-stone-700">
            Cloud Spreadsheet Storage (Google Sheets)
          </label>
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                </div>
                <div>
                  <h4 className="font-bold text-stone-900">
                    {formData.googleSheetName || 'Google Sheets Dual Storage'}
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Syncs Sales, Purchases, Bank Accounts, and Cash Audits into Google Drive
                  </p>
                </div>
              </div>
              {formData.googleSheetUrl && (
                <a
                  href={formData.googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold hover:underline shrink-0"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {formData.googleAppsScriptUrl ? (
              <div className="text-[11px] text-stone-600 space-y-2 pt-2 border-t border-emerald-200/60">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Apps Script Web App Connected</span>
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">
                    Apps Script
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="font-medium text-stone-800 block text-xs">
                      Automatic Sync to Sheets
                    </span>
                    <span className="text-[10px] text-stone-500">
                      Syncs records automatically in background
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.autoSyncToGoogleSheets !== false}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          autoSyncToGoogleSheets: e.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {formData.lastGoogleSheetSyncAt && (
                  <div className="flex justify-between text-[10px] text-emerald-700 pt-1 border-t border-emerald-200/40">
                    <span>Last Synced:</span>
                    <span>{new Date(formData.lastGoogleSheetSyncAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            ) : formData.googleSheetId ? (
              <div className="text-[11px] text-stone-600 space-y-0.5 pt-1 border-t border-emerald-200/60">
                <div className="flex justify-between font-mono text-[10px]">
                  <span>Sheet ID:</span>
                  <span className="text-stone-700">{formData.googleSheetId.slice(0, 16)}...</span>
                </div>
                {formData.lastGoogleSheetSyncAt && (
                  <div className="flex justify-between text-[10px] text-emerald-700">
                    <span>Last Synced:</span>
                    <span>{new Date(formData.lastGoogleSheetSyncAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-stone-600">
                Sync all financial records and tax audits directly to your Google Sheet via Google Apps Script Web App.
              </p>
            )}

            {onOpenGoogleSheets && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGoogleSheets();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>
                    {formData.googleAppsScriptUrl || formData.googleSheetId
                      ? 'Manage Google Sheets Sync'
                      : 'Connect Google Sheets'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 transition whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear All Records</span>
          </button>

          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>

        {showConfirmReset && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2 mt-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 text-red-700" />
              <span>Clear all sales, purchases & bank records?</span>
            </div>
            <p className="text-xs text-red-700">
              This permanently clears all recorded entries from your device.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetData();
                  setShowConfirmReset(false);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800"
              >
                Confirm Clear
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};
