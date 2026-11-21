import { describe, expect, it } from "vitest";
import { inrPerGramPure, metalValue, pureGrams } from "@/lib/metals";

describe("metals", () => {
  it("converts USD per ounce to INR per gram", () => {
    expect(inrPerGramPure(2000, 83)).toBeCloseTo((2000 / 31.1034768) * 83, 6);
    expect(inrPerGramPure(0, 83)).toBe(0);
    expect(inrPerGramPure(30, 0)).toBe(0);
  });
  it("adds an optional premium for Indian duty and tax", () => {
    expect(inrPerGramPure(2000, 83, 6)).toBeCloseTo(inrPerGramPure(2000, 83) * 1.06, 6);
  });
  it("purity scales against 999 fine", () => {
    expect(pureGrams(10, 999)).toBeCloseTo(10, 9);
    expect(pureGrams(999, 916)).toBeCloseTo(916, 9);
    expect(pureGrams(10, null)).toBe(10);
  });
  it("values gold and silver grams", () => {
    expect(metalValue(10, 999, 7000)).toBe(70000);
    expect(metalValue(10, 916, 7000)).toBe(Math.round((10 * 916 / 999) * 7000));
    expect(metalValue(100, 925, 90)).toBe(Math.round((100 * 925 / 999) * 90));
  });
});
