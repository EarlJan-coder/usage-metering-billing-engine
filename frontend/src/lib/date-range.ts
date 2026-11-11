/**
 * Date-range helpers for analytics/history filters (frontend-plan Phase 6).
 *
 * Dates are carried as `yyyy-MM-dd` strings (no time component) so they
 * survive URL round-trips and react-query keys without mutation. Conversion
 * helpers are pure — pages never call `new Date()` during render (Next 16
 * static prerender forbids it); defaults are computed in event handlers.
 */

export type DateRange = {
  /** Inclusive lower bound as yyyy-MM-dd, or null for "any time". */
  from: string | null;
  /** Inclusive upper bound as yyyy-MM-dd, or null for "any time". */
  to: string | null;
};

export const EMPTY_DATE_RANGE: DateRange = { from: null, to: null };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Formats a local Date as yyyy-MM-dd (local, not UTC). */
export function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses yyyy-MM-dd as local midnight; returns null for invalid input. */
export function fromIsoDateString(value: string): Date | null {
  if (!ISO_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  // Reject impossible dates like 2026-02-31 (rolls over to March).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month! - 1 ||
    date.getDate() !== day!
  ) {
    return null;
  }
  return date;
}

const LABEL_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatLabelDate(iso: string): string {
  const date = fromIsoDateString(iso);
  return date ? LABEL_DATE_FORMAT.format(date) : iso;
}

/**
 * Human label for a range: "Any time", "Since …", "Until …", or
 * "Nov 1 – Nov 11, 2026" for bounded ranges.
 */
export function formatDateRangeLabel(range: DateRange): string {
  const { from, to } = range;
  if (!from && !to) return "Any time";
  if (from && to) {
    const fromLabel = formatLabelDate(from);
    const toLabel = formatLabelDate(to);
    // Same calendar year: print it once ("Nov 1 – Nov 11, 2026").
    if (from.slice(0, 4) === to.slice(0, 4)) {
      const fromPart = fromLabel.replace(/, \d{4}$/, "");
      return `${fromPart} – ${toLabel}`;
    }
    return `${fromLabel} – ${toLabel}`;
  }
  if (from) return `Since ${formatLabelDate(from)}`;
  return `Until ${formatLabelDate(to!)}`;
}
