/**
 * Date Standardization & Validation Utilities
 * Ensures zero timezone shift when handling YYYY-MM-DD strings between UI date pickers and storage/backend.
 */

/**
 * Returns today's date in strict local YYYY-MM-DD format without UTC shifts.
 */
export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns yesterday's date in strict local YYYY-MM-DD format.
 */
export function getYesterdayLocalDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a date input or string and normalizes to a strict YYYY-MM-DD format.
 * Prevents timezone offset bugs (e.g. 2026-10-29 shifting to 2026-10-28 in UTC-5).
 */
export function normalizeDateString(input?: string | Date): string {
  if (!input) {
    return getTodayLocalDateString();
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return getTodayLocalDateString();
    const year = input.getFullYear();
    const month = String(input.getMonth() + 1).padStart(2, '0');
    const day = String(input.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const str = String(input).trim();
  // Match YYYY-MM-DD
  const matchYmd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (matchYmd) {
    const [, y, m, d] = matchYmd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Fallback to Date parsing if ISO or other string
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return getTodayLocalDateString();
}

/**
 * Validates whether a date string is a valid calendar date in YYYY-MM-DD format.
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') return false;
  const regex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
  if (!regex.test(dateString)) return false;

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Formats a YYYY-MM-DD date string for friendly UI display (e.g., "Oct 29, 2026").
 */
export function formatCalendarDate(dateString: string): string {
  const normalized = normalizeDateString(dateString);
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
