const FALLBACK_DATE_LABEL = '—';

/**
 * Formats a date-like value for display. Returns a dash instead of
 * "Invalid Date" when the value is missing or unparseable.
 */
export const formatDate = (value?: string | Date | null): string => {
  if (!value) return FALLBACK_DATE_LABEL;

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) return FALLBACK_DATE_LABEL;

  return parsed.toLocaleDateString();
};

/**
 * Compact label such as "Aug 5, 2026". Same safe fallback as formatDate.
 */
export const formatShortDate = (value?: string | Date | null): string => {
  if (!value) return FALLBACK_DATE_LABEL;

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) return FALLBACK_DATE_LABEL;

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
