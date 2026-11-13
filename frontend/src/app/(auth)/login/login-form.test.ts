import { describe, expect, test } from "vitest";

import { safeNextPath } from "./login-form";

/**
 * Open-redirect guard for the post-login `next` param (frontend-plan §9 —
 * "open redirect prevented"). String-prefix checks are not enough: the
 * WHATWG URL parser treats `\` as `/`, so `/\evil.com` resolves to
 * `http://evil.com/` and a prefix check would happily hand it to the
 * router. The guard must resolve the input and reject any other origin.
 */
describe("safeNextPath (open-redirect guard)", () => {
  test.each<[string, string | null, string]>([
    ["null input", null, "/overview"],
    ["empty string", "", "/overview"],
    ["plain path", "/overview", "/overview"],
    ["path with query and hash", "/billing?tab=plan#top", "/billing?tab=plan#top"],
    ["nested return path", "/api-keys", "/api-keys"],
    ["protocol-relative URL", "//evil.com", "/overview"],
    ["backslash bypass", "/\\evil.com", "/overview"],
    ["backslash double bypass", "/\\/evil.com", "/overview"],
    ["absolute https URL", "https://evil.com/steal", "/overview"],
    ["absolute http URL", "http://evil.com/steal", "/overview"],
    ["javascript scheme", "javascript:alert(1)", "/overview"],
  ])("%s → safe path", (_label, input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
