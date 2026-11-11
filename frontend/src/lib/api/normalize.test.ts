import { describe, expect, test } from "vitest";

import { asObject, pickArray, pickNumber, pickObject, pickString } from "./normalize";

describe("asObject", () => {
  test("returns plain objects and rejects everything else", () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject([1, 2])).toBeNull();
    expect(asObject("x")).toBeNull();
    expect(asObject(null)).toBeNull();
    expect(asObject(undefined)).toBeNull();
  });
});

describe("pickNumber", () => {
  test("reads numbers and numeric strings across key aliases", () => {
    expect(pickNumber({ total: 42 }, "total")).toBe(42);
    expect(pickNumber({ total: "42" }, "total")).toBe(42);
    expect(pickNumber({ total_api_calls: 7 }, "total", "total_api_calls")).toBe(
      7,
    );
  });

  test("returns null for missing or invalid values", () => {
    expect(pickNumber({}, "total")).toBeNull();
    expect(pickNumber({ total: Number.NaN }, "total")).toBeNull();
    expect(pickNumber({ total: "abc" }, "total")).toBeNull();
    expect(pickNumber({ total: null }, "total")).toBeNull();
  });
});

describe("pickString", () => {
  test("trims non-empty strings", () => {
    expect(pickString({ name: "  Pro  " }, "name")).toBe("Pro");
  });

  test("returns null for empty or non-string values", () => {
    expect(pickString({ name: "" }, "name")).toBeNull();
    expect(pickString({ name: "   " }, "name")).toBeNull();
    expect(pickString({ name: 5 }, "name")).toBeNull();
    expect(pickString({}, "name")).toBeNull();
  });
});

describe("pickArray", () => {
  test("returns arrays found under any alias", () => {
    expect(pickArray({ items: [1] }, "items")).toEqual([1]);
    expect(pickArray({ events: [2] }, "items", "events")).toEqual([2]);
  });

  test("returns null when no alias holds an array", () => {
    expect(pickArray({ items: {} }, "items")).toBeNull();
    expect(pickArray({}, "items")).toBeNull();
  });
});

describe("pickObject", () => {
  test("returns the first object-valued alias", () => {
    expect(pickObject({ quota: { a: 1 } }, "quota")).toEqual({ a: 1 });
    expect(pickObject({ quota: "none" }, "quota")).toBeNull();
    expect(pickObject({}, "quota")).toBeNull();
  });
});
