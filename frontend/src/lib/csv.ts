/**
 * Minimal CSV export helpers (frontend-plan Phase 6 — CSV export).
 * RFC 4180-style escaping: fields containing commas, quotes, or newlines
 * are wrapped in double quotes with embedded quotes doubled.
 */

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // OWASP CSV injection: a string cell starting with =, +, -, or @ becomes
  // an executable formula in Excel/Sheets. Prefix it with a quote so it is
  // forced to text. Numeric cells are never prefixed (a bare -42 is safe).
  if (typeof value === "string" && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Renders a header row plus data rows as a CSV string (no trailing newline).
 * Rows shorter than the header are padded with empty fields.
 */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = [headers.map(escapeCsvValue).join(",")];
  for (const row of rows) {
    const cells = headers.map((_, index) => escapeCsvValue(row[index]));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
