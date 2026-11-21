import { describe, expect, it } from "vitest";
import { goldValue, inrPerGram24k, pureGrams } from "@/lib/gold";

describe("gold", () => {
  it("converts USD per ounce to INR per gram", () => {
    expect(inrPerGram24k(2000, 83)).toBeCloseTo((2000 / 31.1034768) * 83, 6);
    expect(inrPerGram24k(0, 83)).toBe(0);
  });
  it("adds an optional premium for Indian duty and tax", () => {
    expect(inrPerGram24k(2000, 83, 6)).toBeCloseTo(inrPerGram24k(2000, 83) * 1.06, 6);
  });
  it("22K is 22/24 of the pure gold", () => {
    expect(pureGrams(24, 22)).toBeCloseTo(22, 9);
    expect(pureGrams(10, null)).toBe(10);
  });
  it("values grams at today's price", () => {
    expect(goldValue(10, 24, 7000)).toBe(70000);
    expect(goldValue(10, 22, 7200)).toBe(66000);
  });
});
