import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { GUEST_SESSION, SessionProvider } from "@/lib/auth/session";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/usage",
}));

import { AppSidebar } from "./app-sidebar";

function renderSidebar() {
  return render(
    <SessionProvider value={GUEST_SESSION}>
      <AppSidebar />
    </SessionProvider>,
  );
}

describe("AppSidebar", () => {
  test("renders the plan's navigation sections", () => {
    renderSidebar();

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute(
      "href",
      "/overview",
    );
    expect(
      screen.getByRole("link", { name: /Costs & Billing/ }),
    ).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("link", { name: /Help Center/ })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  test("marks the active route", () => {
    renderSidebar();

    expect(
      screen.getByRole("link", { name: /Usage History/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /API Keys/ }),
    ).not.toHaveAttribute("aria-current", "page");
  });
});
