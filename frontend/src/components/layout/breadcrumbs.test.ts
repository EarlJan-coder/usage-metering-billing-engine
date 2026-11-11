import { describe, expect, test } from "vitest";

import { breadcrumbTrail } from "./breadcrumbs";

describe("breadcrumbTrail", () => {
  test("maps dashboard routes to their page labels", () => {
    expect(breadcrumbTrail("/usage")).toEqual([
      { label: "Usage History", href: "/usage" },
    ]);
    expect(breadcrumbTrail("/api-keys")).toEqual([
      { label: "API Keys", href: "/api-keys" },
    ]);
    expect(breadcrumbTrail("/billing")).toEqual([
      { label: "Costs & Billing", href: "/billing" },
    ]);
  });

  test("returns Home for the root path", () => {
    expect(breadcrumbTrail("/")).toEqual([{ label: "Home", href: "/" }]);
  });

  test("humanizes unknown paths from their last segment", () => {
    expect(breadcrumbTrail("/some/unknown-route")).toEqual([
      { label: "Unknown route", href: "/some/unknown-route" },
    ]);
  });
});
