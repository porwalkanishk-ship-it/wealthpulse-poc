import { describe, expect, it } from "vitest";
import { addMonths, countGrant, generateSchedule, illustrate, normaliseCompany, unvestedByQuarter } from "@/lib/rsu";

const sum = (r: { shares: number }[]) => Math.round(r.reduce((a, b) => a + b.shares, 0) * 1e4) / 1e4;

describe("schedules", () => {
  it("cliff then monthly: 25% at 12 months then 36 equal months, sums exactly", () => {
    const r = generateSchedule("cliff_monthly", "2024-01-15", 1000, { cliffMonths: 12, cliffPct: 25, totalMonths: 48 });
    expect(r).toHaveLength(37);
    expect(r[0]).toEqual({ vest_date: "2025-01-15", shares: 250 });
    expect(r.at(-1)!.vest_date).toBe("2028-01-15");
    expect(sum(r)).toBe(1000);
  });
  it("cliff then quarterly", () => {
    const r = generateSchedule("cliff_quarterly", "2024-01-31", 1200, { cliffMonths: 12, cliffPct: 25, totalMonths: 48 });
    expect(r).toHaveLength(13);
    expect(r[1]!.vest_date).toBe("2025-04-30");
    expect(sum(r)).toBe(1200);
  });
  it("annual percentages", () => {
    const r = generateSchedule("annual_pct", "2024-03-01", 100, { percents: [40, 30, 20, 10] });
    expect(r.map((x) => x.shares)).toEqual([40, 30, 20, 10]);
    expect(r[3]!.vest_date).toBe("2028-03-01");
  });
  it("custom list is sorted and kept", () => {
    const r = generateSchedule("custom", "2024-01-01", 10, { vests: [{ date: "2026-01-01", shares: 4 }, { date: "2025-01-01", shares: 6 }] });
    expect(r.map((x) => x.vest_date)).toEqual(["2025-01-01", "2026-01-01"]);
  });
  it("clamps month ends", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("counting rules", () => {
  const vests = [
    { vest_date: "2025-01-01", shares: 100, status: "delivered" as const, delivered_shares: 62 },
    { vest_date: "2025-06-01", shares: 100, status: "pending" as const, delivered_shares: null },
    { vest_date: "2026-06-01", shares: 50, status: "pending" as const, delivered_shares: null },
    { vest_date: "2026-09-01", shares: 50, status: "pending" as const, delivered_shares: null },
  ];
  it("delivered uses actual shares, vested-unconfirmed is a net estimate, unvested is excluded", () => {
    const c = countGrant(vests, 30, "2025-12-01");
    expect(c.deliveredShares).toBe(62);
    expect(c.estimatedShares).toBe(70);
    expect(c.unvestedShares).toBe(100);
    expect(c.nextVest).toEqual({ vest_date: "2026-06-01", shares: 50 });
  });
  it("quarters and slider", () => {
    expect(unvestedByQuarter(vests, "2025-12-01")).toEqual({ "2026-Q2": 50, "2026-Q3": 50 });
    expect(illustrate(100, 10, -30)).toBe(700);
  });
});

describe("company names", () => {
  it("normalises for the listing check", () => {
    expect(normaliseCompany("Thoughtspot, Inc.")).toBe(normaliseCompany("THOUGHTSPOT"));
    expect(normaliseCompany("Acme Technologies Ltd")).toBe("acme");
  });
});
