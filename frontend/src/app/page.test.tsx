import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

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

import Home from "./page";

describe("landing page", () => {
  test("every Get Started action points at signup", () => {
    render(<Home />);

    const ctas = screen.getAllByRole("link", { name: /Get Started/ });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/signup");
    }
  });

  test("View Pricing anchors to the pricing section and Sign In to login", () => {
    render(<Home />);

    const pricing = screen.getAllByRole("link", { name: /View Pricing/ });
    expect(pricing.length).toBeGreaterThan(0);
    for (const cta of pricing) {
      expect(cta).toHaveAttribute("href", "#pricing");
    }

    const signIn = screen.getAllByRole("link", { name: /Sign In/ });
    expect(signIn.length).toBeGreaterThan(0);
    for (const cta of signIn) {
      expect(cta).toHaveAttribute("href", "/login");
    }
  });

  test("renders all sections required by plan section 6A", () => {
    render(<Home />);

    for (const id of ["features", "how-it-works", "pricing", "faq"]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  test("shows the seeded Free plan limits from backend-plan", () => {
    render(<Home />);

    expect(screen.getByText("1,000 API calls/month")).toBeInTheDocument();
    expect(screen.getByText("100,000 AI tokens/month")).toBeInTheDocument();
  });
});
