import { describe, expect, test } from "vitest";

import { navSections, secondaryNav } from "./nav";

describe("navSections", () => {
  test("lists the workspace section per plan section 5", () => {
    const sections = navSections("member");
    const workspace = sections.find((section) => section.label === "Workspace");

    expect(workspace?.items.map((item) => item.href)).toEqual([
      "/overview",
      "/analytics",
      "/usage",
      "/api-keys",
    ]);
  });

  test("lists Subscription and Costs & Billing without Invoices", () => {
    const billing = navSections("member").find(
      (section) => section.label === "Billing",
    );

    expect(billing?.items.map((item) => item.href)).toEqual([
      "/subscription",
      "/billing",
    ]);
  });

  test("hides Platform Admin from non-admin members", () => {
    const admin = navSections("member").find(
      (section) => section.label === "Administration",
    );

    expect(admin?.items.map((item) => item.href)).toEqual([
      "/team",
      "/settings",
    ]);
  });

  test("shows Platform Admin to admins", () => {
    const admin = navSections("admin").find(
      (section) => section.label === "Administration",
    );

    expect(admin?.items.map((item) => item.href)).toContain("/admin");
  });

  test("never produces duplicate hrefs", () => {
    const hrefs = navSections("admin").flatMap((section) =>
      section.items.map((item) => item.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("secondaryNav", () => {
  test("includes Documentation and Help Center", () => {
    expect(secondaryNav.map((item) => item.href)).toEqual([
      "/docs",
      "/help",
    ]);
  });
});
