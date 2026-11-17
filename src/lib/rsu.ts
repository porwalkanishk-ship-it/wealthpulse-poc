/** RSU vesting schedules and the rules for what counts towards net worth. Pure functions, no I/O. */

export type VestingType = "cliff_monthly" | "cliff_quarterly" | "annual_pct" | "custom";

export type PresetConfig =
  | { cliffMonths: number; cliffPct: number; totalMonths: number } // cliff_monthly / cliff_quarterly
  | { percents: number[] } // annual_pct: one percentage per anniversary
  | { vests: { date: string; shares: number }[] }; // custom

export type VestRow = { vest_date: string; shares: number };

export const DEFAULT_CLIFF: PresetConfig = { cliffMonths: 12, cliffPct: 25, totalMonths: 48 };

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Add whole months to an ISO date, clamping to the month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Split `total` by weights; the last row takes the rounding remainder so the sum is exact. */
function splitByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  const out: number[] = [];
  let used = 0;
  weights.forEach((w, i) => {
    if (i === weights.length - 1) out.push(round4(total - used));
    else {
      const v = round4((total * w) / sum);
      out.push(v);
      used += v;
    }
  });
  return out;
}

export function generateSchedule(
  type: VestingType,
  grantDate: string,
  totalShares: number,
  config: PresetConfig,
): VestRow[] {
  if (!(totalShares > 0)) return [];
  if (type === "custom") {
    const vests = "vests" in config ? config.vests : [];
    return vests.filter((v) => v.shares > 0).map((v) => ({ vest_date: v.date, shares: v.shares })).sort((a, b) => a.vest_date.localeCompare(b.vest_date));
  }
  if (type === "annual_pct") {
    const percents = "percents" in config ? config.percents : [];
    const shares = splitByWeights(totalShares, percents);
    return shares.map((s, i) => ({ vest_date: addMonths(grantDate, 12 * (i + 1)), shares: s })).filter((r) => r.shares > 0);
  }
  const c = "cliffMonths" in config ? config : (DEFAULT_CLIFF as Extract<PresetConfig, { cliffMonths: number }>);
  const step = type === "cliff_monthly" ? 1 : 3;
  const cliffShares = round4((totalShares * c.cliffPct) / 100);
  const rows: VestRow[] = [{ vest_date: addMonths(grantDate, c.cliffMonths), shares: cliffShares }];
  const periods = Math.floor((c.totalMonths - c.cliffMonths) / step);
  if (periods > 0) {
    const rest = splitByWeights(round4(totalShares - cliffShares), Array(periods).fill(1));
    rest.forEach((s, i) => rows.push({ vest_date: addMonths(grantDate, c.cliffMonths + step * (i + 1)), shares: s }));
  } else {
    rows[0]!.shares = totalShares;
  }
  return rows.filter((r) => r.shares > 0);
}

export type VestState = {
  vest_date: string;
  shares: number;
  status: "pending" | "delivered";
  delivered_shares: number | null;
};

export type GrantCounting = {
  /** Delivered shares, counted at the latest close. */
  deliveredShares: number;
  /** Vested on schedule but not yet confirmed: net of withholding, shown as an estimate. */
  estimatedShares: number;
  /** Not vested yet: never counted in net worth. */
  unvestedShares: number;
  nextVest: VestRow | null;
};

export function countGrant(vests: VestState[], withholdingPct: number, today: string): GrantCounting {
  let delivered = 0;
  let estimated = 0;
  let unvested = 0;
  let next: VestRow | null = null;
  const keep = 1 - Math.min(Math.max(withholdingPct, 0), 100) / 100;
  for (const v of [...vests].sort((a, b) => a.vest_date.localeCompare(b.vest_date))) {
    if (v.status === "delivered") delivered += v.delivered_shares ?? v.shares * keep;
    else if (v.vest_date <= today) estimated += v.shares * keep;
    else {
      unvested += v.shares;
      next ??= { vest_date: v.vest_date, shares: v.shares };
    }
  }
  return { deliveredShares: round4(delivered), estimatedShares: round4(estimated), unvestedShares: round4(unvested), nextVest: next };
}

/** Value of unvested shares if the price moved by `pct` percent (the −30..+30 illustration slider). */
export function illustrate(unvestedShares: number, price: number, pct: number): number {
  return unvestedShares * price * (1 + pct / 100);
}

export function quarterKey(iso: string): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** Unvested shares by calendar quarter of vesting. */
export function unvestedByQuarter(vests: VestState[], today: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vests) {
    if (v.status === "pending" && v.vest_date > today) out[quarterKey(v.vest_date)] = round4((out[quarterKey(v.vest_date)] ?? 0) + v.shares);
  }
  return out;
}

const STRIP = /\b(inc|incorporated|corp|corporation|ltd|limited|llc|plc|technologies|holdings)\b/g;
export function normaliseCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(STRIP, " ").replace(/\s+/g, " ").trim();
}
