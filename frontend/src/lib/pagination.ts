/**
 * Pagination state helper (frontend-plan §6E — usage history pagination).
 * Pure display math over the backend-reported total; never fetches or
 * recomputes authoritative data.
 */

export type PaginationState = {
  /** 1-based page number, clamped into [1, totalPages]. */
  page: number;
  pageSize: number;
  /** Total rows reported by the backend (0 when unknown). */
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** 1-based index of the first row on this page (0 when empty). */
  from: number;
  /** 1-based index of the last row on this page (0 when empty). */
  to: number;
};

export function getPaginationState(
  page: number,
  pageSize: number,
  total: number,
): PaginationState {
  const safePageSize = pageSize > 0 ? pageSize : 1;
  const safeTotal = total > 0 ? total : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);

  const from = safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const to = Math.min(safePage * safePageSize, safeTotal);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    from,
    to,
  };
}
