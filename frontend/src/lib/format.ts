/**
 * Presentation helpers for backend-provided values.
 * The backend remains the source of truth: these functions only format
 * values it already calculated (never recompute totals or costs).
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

const numberFormatter = new Intl.NumberFormat("en-US");

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/**
 * Formats integer minor units (e.g. cents) as currency.
 * Backend stores monetary values in exact minor units (backend-plan §4).
 */
export function formatCurrency(minorUnits: number, currency = "USD"): string {
  if (!Number.isFinite(minorUnits)) return "—";
  return getCurrencyFormatter(currency).format(minorUnits / 100);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return numberFormatter.format(value);
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return compactFormatter.format(value);
}

/** Formats a UTC ISO timestamp as e.g. "Nov 11, 2026, 14:30" (always UTC). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/** Shows the API key prefix plus its last characters, hiding the secret. */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 3)}…${key.slice(-2)}`;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}
