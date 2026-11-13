import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Security hygiene scan (frontend-plan §9 — "no sensitive billing logic /
 * auth info in browser storage", §10 integration rules).
 *
 * These are source-level guards over production code: they fail the build
 * if a future change reintroduces browser-storage auth tokens, hard-coded
 * Stripe secret material, non-public environment reads, or raw cookie
 * access. Test fixtures are allowed to contain masked key strings
 * (`sk_live_••••`), so `*.test.*` files are excluded.
 */

/** src/ — vitest runs with cwd = frontend/ (project root). */
const SRC_DIR = path.resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** Strips block and line comments so documented bans don't self-match.
 *  `://` in URLs is preserved (lookbehind). */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/[^\n]*/g, "");
}

function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file) || file.includes(`${path.sep}__tests__${path.sep}`);
}

const productionFiles = walk(SRC_DIR).filter((f) => !isTestFile(f));
const authFiles = productionFiles.filter(
  (f) =>
    f.includes(path.join("lib", "api")) ||
    f.includes(path.join("lib", "auth")),
);

/** Returns `file:line` for every banned match, for precise failures. */
function findMatches(
  files: string[],
  pattern: RegExp,
): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        hits.push(`${path.relative(SRC_DIR, file)}:${index + 1} — ${line.trim()}`);
      }
    });
  }
  return hits;
}

describe("security hygiene (source scan)", () => {
  test("production files exist to scan (guards against a broken scan)", () => {
    expect(productionFiles.length).toBeGreaterThan(20);
    expect(authFiles.length).toBeGreaterThan(5);
  });

  test("auth and API layers never touch localStorage/sessionStorage/document.cookie", () => {
    const hits = findMatches(
      authFiles,
      /\blocalStorage\b|\bsessionStorage\b|\bdocument\.cookie\b/,
    );
    expect(hits).toEqual([]);
  });

  test("no hard-coded Stripe secret material in production source", () => {
    const hits = findMatches(productionFiles, /\bsk_live_|\bsk_test_|\bwhsec_/);
    expect(hits).toEqual([]);
  });

  test("only NEXT_PUBLIC_* environment variables are read", () => {
    const hits: string[] = [];
    for (const file of productionFiles) {
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, index) => {
        const match = line.match(/process\.env\.([A-Za-z0-9_]+)/);
        if (match && !match[1]!.startsWith("NEXT_PUBLIC_")) {
          hits.push(
            `${path.relative(SRC_DIR, file)}:${index + 1} — ${match[0]}`,
          );
        }
      });
    }
    expect(hits).toEqual([]);
  });

  test("no Stripe secret-key-shaped environment variable names anywhere", () => {
    // Belt-and-braces: even a NEXT_PUBLIC_-prefixed secret would leak to
    // the browser bundle, so secret-shaped names are banned outright.
    const hits = findMatches(
      productionFiles,
      /STRIPE_SECRET|SECRET_KEY|WEBHOOK_SECRET/,
    );
    expect(hits).toEqual([]);
  });
});
