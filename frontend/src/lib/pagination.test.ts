import { describe, expect, test } from "vitest";

import { getPaginationState } from "./pagination";

describe("getPaginationState", () => {
  test("describes an empty result set", () => {
    expect(getPaginationState(1, 10, 0)).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      hasPrev: false,
      hasNext: false,
      from: 0,
      to: 0,
    });
  });

  test("describes the first page of a partial result set", () => {
    expect(getPaginationState(1, 10, 25)).toEqual({
      page: 1,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      hasPrev: false,
      hasNext: true,
      from: 1,
      to: 10,
    });
  });

  test("describes the last page with a partial row count", () => {
    const state = getPaginationState(3, 10, 25);
    expect(state.totalPages).toBe(3);
    expect(state.hasPrev).toBe(true);
    expect(state.hasNext).toBe(false);
    expect(state.from).toBe(21);
    expect(state.to).toBe(25);
  });

  test("clamps out-of-range pages", () => {
    expect(getPaginationState(99, 10, 25).page).toBe(3);
    expect(getPaginationState(0, 10, 25).page).toBe(1);
    expect(getPaginationState(-5, 10, 25).page).toBe(1);
  });
});
