import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  test("renders active status as a success badge", () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByText("Active");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-emerald-50");
    expect(badge.className).toContain("text-emerald-700");
  });

  test("renders canceled status as an error badge", () => {
    render(<StatusBadge status="canceled" />);
    const badge = screen.getByText("Canceled");
    expect(badge.className).toContain("bg-red-50");
    expect(badge.className).toContain("text-red-700");
  });

  test("renders pending status as a warning badge", () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText("Pending").className).toContain("text-amber-700");
  });

  test("capitalizes unknown statuses and styles them neutrally", () => {
    render(<StatusBadge status="archived" />);
    const badge = screen.getByText("Archived");
    expect(badge.className).toContain("bg-slate-100");
  });
});
