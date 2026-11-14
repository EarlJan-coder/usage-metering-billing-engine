import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test, vi } from "vitest";

import { createApp, listRoutes } from "../src/app.js";
import { ERROR_CODES } from "../src/codes.js";
import { closeTestDb, db } from "./helpers/db.js";

const h = vi.hoisted(() => ({ getStripe: vi.fn() }));
vi.mock("../src/services/stripe.js", () => ({ getStripe: h.getStripe }));

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const apiMdPath = path.join(repoRoot, "backend", "docs", "API.md");
const readmePath = path.join(repoRoot, "backend", "README.md");
const buildlogPath = path.join(repoRoot, "BUILDLOG.md");
const evidencePath = path.join(repoRoot, "EVIDENCE.md");
const capstonePath = path.join(repoRoot, "capstone.yaml");

const apiMd = readFileSync(apiMdPath, "utf8");
const capstoneYaml = readFileSync(capstonePath, "utf8");

/**
 * Minimal YAML reader for the manifest shape we author: top-level scalars
 * (`key: value`) and top-level block lists (`key:` then `- item` lines).
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentList: string[] | null = null;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const line = raw.trim();

    if (line.startsWith("- ") && currentList) {
      currentList.push(String(parseScalar(line.slice(2).trim())));
      continue;
    }

    const eq = line.indexOf(":");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (value === "") {
      currentList = [];
      root[key] = currentList;
    } else {
      currentList = null;
      root[key] = parseScalar(value);
    }
  }
  return root;
}

function parseScalar(value: string): unknown {
  if (value === "[]") return [];
  if (value === "{}") return {};
  const unquoted = value.replace(/^["']|["']$/g, "");
  if (/^-?\d+$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

const app = createApp(db);

describe("docs deliverables (Task 12)", () => {
  afterAll(closeTestDb);

  test("listRoutes walks the live Express router", () => {
    const routes = listRoutes(app);
    expect(routes).toContainEqual({ method: "GET", path: "/healthz" });
    expect(routes).toContainEqual({
      method: "POST",
      path: "/api/v1/metering/track",
    });
    expect(routes).toContainEqual({ method: "GET", path: "/api/v1/tenants/:id" });
  });

  test("docs/API.md documents exactly the registered routes (both directions)", () => {
    const routes = listRoutes(app);
    const registry = new Set(routes.map((r) => `${r.method} ${r.path}`));

    const documented = new Set<string>();
    const headingRe = /^### (GET|POST|PUT|PATCH|DELETE) (\/\S+)$/gm;
    for (const match of apiMd.matchAll(headingRe)) {
      documented.add(`${match[1]} ${match[2]}`);
    }

    const undocumented = [...registry].filter((r) => !documented.has(r));
    const nonexistent = [...documented].filter((d) => !registry.has(d));
    expect(undocumented, "registered routes missing from docs").toEqual([]);
    expect(nonexistent, "docs describe routes that do not exist").toEqual([]);
  });

  test("every documented error code exists in src/codes.ts (and vice versa)", () => {
    // only the Error codes section is scanned for `code` table rows
    const errorSection = apiMd.split(/^## Error codes\b/m)[1] ?? "";
    const documentedCodes = new Set<string>();
    const codeRowRe = /^\| `([a-z_]+)` \|/gm;
    for (const match of errorSection.matchAll(codeRowRe)) {
      documentedCodes.add(match[1]!);
    }
    expect(documentedCodes.size).toBeGreaterThan(0);

    const missingFromCodes = [...documentedCodes].filter(
      (c) => !ERROR_CODES.includes(c as never),
    );
    expect(missingFromCodes, "documented codes missing from codes.ts").toEqual(
      [],
    );

    const missingFromDocs = ERROR_CODES.filter(
      (c) => !documentedCodes.has(c),
    );
    expect(missingFromDocs, "codes.ts entries missing from docs").toEqual([]);
  });

  test("capstone.yaml parses and lists real endpoints", () => {
    const manifest = parseSimpleYaml(capstoneYaml);
    expect(typeof manifest.name).toBe("string");
    expect(Array.isArray(manifest.stack)).toBe(true);
    expect(Array.isArray(manifest.features)).toBe(true);
    expect(Array.isArray(manifest.endpoints)).toBe(true);
    expect(Array.isArray(manifest.evidence)).toBe(true);

    const registry = new Set(
      listRoutes(app).map((r) => `${r.method} ${r.path}`),
    );
    for (const endpoint of manifest.endpoints as string[]) {
      expect(registry.has(endpoint), `unknown endpoint in capstone.yaml: ${endpoint}`).toBe(true);
    }
  });

  test("required deliverable files exist", () => {
    for (const file of [apiMdPath, readmePath, buildlogPath, evidencePath, capstonePath]) {
      expect(existsSync(file), file).toBe(true);
    }
    expect(readFileSync(readmePath, "utf8")).toMatch(/npm run migrate/);
    expect(readFileSync(readmePath, "utf8")).toMatch(/npm test/);
  });
});
