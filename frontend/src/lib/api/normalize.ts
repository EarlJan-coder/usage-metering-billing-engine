/**
 * Tolerant payload helpers shared by API normalizers.
 *
 * The backend plan lists endpoints but not response bodies, so normalizers
 * read known field aliases instead of assuming one exact envelope. When the
 * backend lands, aliases can be trimmed without touching UI code.
 */

export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** First finite number found under any alias (numbers or numeric strings). */
export function pickNumber(
  source: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/** First non-blank string found under any alias (trimmed). */
export function pickString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

/** First array found under any alias. */
export function pickArray(
  source: Record<string, unknown>,
  ...keys: string[]
): unknown[] | null {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

/** First plain object found under any alias. */
export function pickObject(
  source: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = asObject(source[key]);
    if (value) return value;
  }
  return null;
}

/**
 * Boolean from true/false, "true"/"false", 1/0 — defaults to false.
 * Used for plan flags like isDefault where backends vary in encoding.
 */
export function pickBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return false;
}
