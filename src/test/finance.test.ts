import { describe, expect, it } from "vitest";
import { emiSplit, monthsToPayoff, prepaymentImpact, projectLoan } from "@/lib/finance";
import { planInstallments, totalUnits } from "@/lib/sip";

const loan = { outstanding: 4850000, rate: 8.5, emi: 48200, emi_day: 5, as_of: "2026-11-05" };

describe("home loan", () => {
  it("splits this month's EMI into interest on the balance and principal", () => {
    const s = emiSplit(4850000, 8.5, 48200);
    expect(Math.round(s.interest)).toBe(34354);
    expect(Math.round(s.principal)).toBe(13846);
  });
  it("computes months to payoff with diminishing balance", () => {
    expect(monthsToPayoff(4850000, 8.5, 48200)).toBe(177);
  });
  it("returns null when the EMI doesn't cover interest", () => {
    expect(monthsToPayoff(4850000, 8.5, 30000)).toBeNull();
  });
  it("a monthly top-up pays off sooner and saves interest", () => {
    const base = projectLoan(loan, "2026-11-14");
    const imp = prepaymentImpact(loan, "2026-11-14", { monthly: 10000 });
    expect(imp.months).toBeLessThan(base.schedule.length);
    expect(imp.interestSaved).toBeGreaterThan(0);
  });
});

describe("SIP auto-projection", () => {
  const holding = { sip_active: true, sip_amount: 25000, sip_day: 5, sip_start: "2026-09-01" };
  const history = [
    { date: "2026-09-05", nav: 100 },
    { date: "2026-10-06", nav: 125 },
  ];
  it("adds units at the debit-day NAV and leaves unpriced months pending", () => {
    const { inserts } = planInstallments(holding, [], history, "2026-11-14");
    expect(inserts.map((i) => [i.due_date, i.status, i.units])).toEqual([
      ["2026-09-05", "applied", 250],
      ["2026-10-05", "applied", 200],
      ["2026-11-05", "pending", 0],
    ]);
  });
  it("paused SIPs add nothing", () => {
    expect(planInstallments({ ...holding, sip_active: false }, [], history, "2026-11-14").inserts).toHaveLength(0);
  });
  it("skipped installments don't count toward units", () => {
    expect(totalUnits(1000, [{ status: "applied", units: 250 }, { status: "skipped", units: 200 }])).toBe(1250);
  });
});
