import { formatDate } from './date';

const MONEY_KEY_PATTERN = /(spent|salary|amount|charge|rate|expense)/i;
const PERCENTAGE_KEY_PATTERN = /percent/i;
const DATE_KEY_PATTERN = /date/i;
const EMPTY_CELL_LABEL = 'N/A';

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
};

const parseDecimalString = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Turns a raw report value into a display string based on what the column means.
 * Currency only applies to money columns, so counts like Total_Bookings stay plain.
 */
export const formatReportCell = (columnKey: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return EMPTY_CELL_LABEL;

  if (PERCENTAGE_KEY_PATTERN.test(columnKey)) {
    const percentage = toFiniteNumber(value) ?? parseDecimalString(value);
    return percentage === null ? String(value) : `${percentage}%`;
  }

  if (DATE_KEY_PATTERN.test(columnKey) && typeof value === 'string') {
    return formatDate(value);
  }

  if (MONEY_KEY_PATTERN.test(columnKey)) {
    const amount = toFiniteNumber(value) ?? parseDecimalString(value);
    if (amount !== null) return `BDT ৳${amount.toLocaleString('en-US')}`;
  }

  // Only real numbers are grouped; numeric-looking strings (phone numbers, room codes)
  // are printed verbatim so they never turn into thousands-separated digits.
  const numeric = toFiniteNumber(value);
  return numeric === null ? String(value) : numeric.toLocaleString('en-US');
};
