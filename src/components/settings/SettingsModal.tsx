import React, { useState } from 'react';
import { TaxSettings } from '../../types';
import { CURRENCY_OPTIONS } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { RotateCcw, Save, ShieldAlert, Building2, Sun, Moon, FileSpreadsheet, ExternalLink, Trash2, Cloud, Database, Download } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TaxSettings;
  onSaveSettings: (settings: TaxSettings) => void;
  onResetData: () => void;
  onClearCloudDatabases?: () => Promise<{
    sheetsSuccess: boolean;
    message: string;
  }>;
  onPullFromCloud?: () => Promise<void> | void;
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
  onClearCloudDatabases,
  onPullFromCloud,
  theme,
  onSetTheme,
  onOpenGoogleSheets,
}) => {
  const [formData, setFormData] = useState<TaxSettings>({ ...settings });
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showConfirmCloudClear, setShowConfirmCloudClear] = useState(false);
  const [isClearingCloud, setIsClearingCloud] = useState(false);
  const [cloudClearResult, setCloudClearResult] = useState<string | null>(null);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);

  const [currentUsername, setCurrentUsername] = useState(() => {
    try {
      return localStorage.getItem('taxguard_username') || 'solomon';
    } catch {
      return 'solomon';
    }
  });
  const [newUsername, setNewUsername] = useState(currentUsername);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  React.useEffect(() => {
    setFormData({ ...settings });
    try {
      const u = localStorage.getItem('taxguard_username') || 'solomon';
      setCurrentUsername(u);
      setNewUsername(u);
    } catch {}
    setAuthError(null);
    setAuthSuccess(null);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
  }, [settings, isOpen]);

  const handleUpdateCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const savedPass = localStorage.getItem('taxguard_password') || 'solomon123';
    if (currentPasswordInput !== savedPass) {
      setAuthError('Current password is incorrect.');
      return;
    }

    if (newPasswordInput && newPasswordInput !== confirmPasswordInput) {
      setAuthError('New passwords do not match.');
      return;
    }

    if (newUsername.trim()) {
      try {
        localStorage.setItem('taxguard_username', newUsername.trim());
        setCurrentUsername(newUsername.trim());
      } catch {}
    }
    if (newPasswordInput.trim()) {
      try {
        localStorage.setItem('taxguard_password', newPasswordInput.trim());
      } catch {}
    }

    setAuthSuccess('Username and password updated successfully!');
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
  };

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

        {/* Username & Password Security Settings */}
        <div className="space-y-3 pt-3 border-t border-stone-200">
          <label className="block text-xs font-semibold text-stone-700">
            Login Credentials (Username &amp; Password)
          </label>
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-3 text-xs">
            {authError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[11px]">
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                {authSuccess}
              </div>
            )}

            <div>
              <span className="text-stone-600 block mb-1">Username</span>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 text-xs focus:outline-none focus:border-orange-700 font-medium"
                placeholder="solomon"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-stone-600 block mb-1">Current Password</span>
                <input
                  type="password"
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 text-xs focus:outline-none focus:border-orange-700 font-mono"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <span className="text-stone-600 block mb-1">New Password (Optional)</span>
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 text-xs focus:outline-none focus:border-orange-700 font-mono"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <span className="text-stone-600 block mb-1">Confirm New Password</span>
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 text-xs focus:outline-none focus:border-orange-700 font-mono"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleUpdateCredentials}
                className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs transition cursor-pointer"
              >
                Update Login Credentials
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone: Database Management & Cloud Purge */}
        <div className="pt-4 border-t border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>Database Management &amp; Data Purge</span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-stone-800 block">
                  Clear Cloud Database (Google Sheets)
                </span>
                <span className="text-[11px] text-stone-500">
                  Wipe remote records from your Google Sheets spreadsheet backup via Apps Script while keeping your device's LocalStorage intact.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmCloudClear(true);
                  setShowConfirmReset(false);
                  setCloudClearResult(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 border border-red-300 text-red-800 text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Clear Cloud Database</span>
              </button>
            </div>

            {/* Cloud Clear Confirmation Box */}
            {showConfirmCloudClear && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-3 animate-fade-in text-xs">
                <div className="flex items-center gap-2 font-bold text-red-900">
                  <Database className="w-4 h-4 text-red-700" />
                  <span>Confirm Remote Data Wipe:</span>
                </div>

                <p className="text-[11px] text-red-800 leading-relaxed">
                  <strong>Warning:</strong> This permanently clears the backup tabs in your connected Google Sheet. Your local device storage (Primary Database) will not be affected.
                </p>

                {cloudClearResult && (
                  <div className="p-2.5 rounded-lg bg-white border border-red-300 text-stone-800 text-[11px] font-mono">
                    {cloudClearResult}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowConfirmCloudClear(false)}
                    disabled={isClearingCloud}
                    className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isClearingCloud}
                    onClick={async () => {
                      if (!onClearCloudDatabases) return;
                      setIsClearingCloud(true);
                      try {
                        const res = await onClearCloudDatabases();
                        setCloudClearResult(res.message);
                        setTimeout(() => {
                          setShowConfirmCloudClear(false);
                          setIsClearingCloud(false);
                        }, 2500);
                      } catch (err) {
                        setCloudClearResult(err instanceof Error ? err.message : String(err));
                        setIsClearingCloud(false);
                      }
                    }}
                    className="px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isClearingCloud ? 'Clearing Remote Data...' : 'Confirm Wipe Google Sheet'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Pull from Database Option */}
            {onPullFromCloud && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-stone-200">
                <div>
                  <span className="text-xs font-semibold text-stone-800 block">
                    Pull from Database
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Update all local records (sales, purchases, bank, reconciliation) with the latest backup data from Google Sheets via Apps Script.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setIsPullingCloud(true);
                    setPullResult(null);
                    try {
                      await onPullFromCloud();
                      setPullResult('Local storage successfully updated from Google Sheets!');
                      setTimeout(() => setPullResult(null), 3000);
                    } catch (err) {
                      setPullResult(err instanceof Error ? err.message : 'Pull failed.');
                    } finally {
                      setIsPullingCloud(false);
                    }
                  }}
                  disabled={isPullingCloud}
                  className="px-3 py-1.5 rounded-lg bg-orange-100 hover:bg-orange-200 border border-orange-300 text-orange-900 text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-3.5 h-3.5 text-orange-700 ${isPullingCloud ? 'animate-bounce' : ''}`} />
                  <span>{isPullingCloud ? 'Pulling Data...' : 'Pull from Database'}</span>
                </button>
              </div>
            )}

            {pullResult && (
              <div className="p-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-900 text-xs font-medium">
                {pullResult}
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setShowConfirmReset(true);
              setShowConfirmCloudClear(false);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 transition whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Local Phone Data</span>
          </button>

          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-700 text-white font-semibold text-xs hover:bg-orange-800 transition whitespace-nowrap cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>

        {showConfirmReset && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2 mt-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 text-red-700" />
              <span>Clear all sales, purchases &amp; bank records from phone?</span>
            </div>
            <p className="text-xs text-red-700">
              This permanently resets all recorded entries in phone LocalStorage to initial demo state.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 cursor-pointer"
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
                className="px-3 py-1.5 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 cursor-pointer"
              >
                Confirm Local Reset
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};
