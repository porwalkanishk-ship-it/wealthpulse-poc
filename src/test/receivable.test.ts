import { describe, expect, it } from "vitest";
import { receivableState } from "@/lib/receivable";

const base = { principal: 100_000, rate: 12, lendDate: "2024-01-01" };
const near = (a: number, b: number, tol = 1) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("receivables", () => {
  it("simple interest accrues on principal only", () => {
    const s = receivableState({ ...base, interestType: "simple" }, [], "2026-01-01");
    near(s.interest, 100_000 * 0.12 * (731 / 365.25));
    near(s.value, s.principal + s.interest);
  });
  it("compound interest by frequency: monthly > quarterly > annual > simple", () => {
    const v = (c: "monthly" | "quarterly" | "annual") => receivableState({ ...base, interestType: "compound", compounding: c }, [], "2026-01-01").value;
    const simple = receivableState({ ...base, interestType: "simple" }, [], "2026-01-01").value;
    expect(v("monthly")).toBeGreaterThan(v("quarterly"));
    expect(v("quarterly")).toBeGreaterThan(v("annual"));
    expect(v("annual")).toBeGreaterThan(simple);
  });
  it("annual compounding over exactly one 365.25-day year matches the formula", () => {
    const s = receivableState({ ...base, interestType: "compound", compounding: "annual" }, [], "2025-01-01");
    near(s.value, 100_000 * 1.12 ** (366 / 365.25), 2);
  });
  it("a partial repayment goes to interest first, then principal, and accrual continues on what is left", () => {
    const terms = { ...base, interestType: "simple" as const };
    const r = receivableState(terms, [{ repayment_date: "2025-01-01", amount: 20_000 }], "2026-01-01");
    // one year of interest is about 12,000, so 12,000 to interest and the rest to principal
    near(r.paidInterest, 12_000, 40);
    near(r.paidPrincipal, 8_000, 40);
    near(r.principal, 92_000, 40);
    // the next year accrues on the reduced principal
    near(r.interest, r.principal * 0.12 * (365 / 365.25), 5);
  });
  it("a repayment smaller than the accrued interest leaves the rest of the interest owed", () => {
    const r = receivableState({ ...base, interestType: "simple" }, [{ repayment_date: "2025-01-01", amount: 5_000 }], "2025-01-01");
    expect(r.paidPrincipal).toBe(0);
    near(r.interest, 12_000 - 5_000, 40);
  });
  it("ignores repayments after today or before the lend date", () => {
    const r = receivableState({ ...base, interestType: "simple" }, [{ repayment_date: "2030-01-01", amount: 1 }, { repayment_date: "2023-01-01", amount: 1 }], "2025-01-01");
    expect(r.ignored).toBe(2);
    expect(r.paidInterest + r.paidPrincipal).toBe(0);
  });
  it("never goes below zero when overpaid", () => {
    const r = receivableState({ ...base, interestType: "simple" }, [{ repayment_date: "2024-06-01", amount: 999_999 }], "2025-01-01");
    expect(r.principal).toBe(0);
    expect(r.value).toBe(0);
  });
});
