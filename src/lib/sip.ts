import { addMonths, daysBetween, daysInMonth, parseISO, toISO } from "./dates";

export type InstallmentStatus = "pending" | "applied" | "skipped" | "reconciled";

export interface NavPoint {
  date: string;
  nav: number;
}

export interface InstallmentLike {
  id?: string;
  due_date: string;
  amount: number;
  nav: number | null;
  nav_date?: string | null;
  units: number;
  status: InstallmentStatus;
}

/** SIP debit dates from the SIP start up to and including today. */
export function sipDueDates(sipStart: string, sipDay: number, today: string): string[] {
  const out: string[] = [];
  const { y, m } = parseISO(sipStart);
  let date = toISO(y, m, Math.min(sipDay, daysInMonth(y, m)));
  if (date < sipStart) date = addMonths(date, 1, sipDay);
  let guard = 0;
  while (date <= today && guard < 600) {
    out.push(date);
    date = addMonths(date, 1, sipDay);
    guard++;
  }
  return out;
}

/** Next debit date on or after today. */
export function nextSipDate(sipDay: number, today: string) {
  const { y, m, d } = parseISO(today);
  const thisMonth = toISO(y, m, Math.min(sipDay, daysInMonth(y, m)));
  return d <= sipDay ? thisMonth : addMonths(thisMonth, 1, sipDay);
}

/** Units are allotted at the first NAV published on or after the debit date (within a week). */
export function navForDate(history: NavPoint[], date: string): NavPoint | null {
  for (const p of history) {
    if (p.date >= date) return daysBetween(date, p.date) <= 7 ? p : null;
  }
  return null;
}

export function unitsFor(amount: number, nav: number) {
  return Math.round((amount / nav) * 1000) / 1000;
}

export interface SipHolding {
  sip_active: boolean;
  sip_amount: number | null;
  sip_day: number | null;
  sip_start: string | null;
}

/**
 * Work out which installments to create (missing months) and which pending
 * installments can now be priced. History must be sorted by date ascending.
 */
export function planInstallments(
  holding: SipHolding,
  existing: InstallmentLike[],
  history: NavPoint[],
  today: string,
) {
  const inserts: InstallmentLike[] = [];
  const updates: (InstallmentLike & { id: string })[] = [];

  for (const inst of existing) {
    if (inst.status !== "pending" || !inst.id) continue;
    const p = navForDate(history, inst.due_date);
    if (p) {
      updates.push({ ...inst, id: inst.id, nav: p.nav, nav_date: p.date, units: unitsFor(inst.amount, p.nav), status: "applied" });
    }
  }

  if (holding.sip_active && holding.sip_amount && holding.sip_day && holding.sip_start) {
    const have = new Set(existing.map((e) => e.due_date));
    for (const due of sipDueDates(holding.sip_start, holding.sip_day, today)) {
      if (have.has(due)) continue;
      const p = navForDate(history, due);
      inserts.push(
        p
          ? { due_date: due, amount: holding.sip_amount, nav: p.nav, nav_date: p.date, units: unitsFor(holding.sip_amount, p.nav), status: "applied" }
          : { due_date: due, amount: holding.sip_amount, nav: null, nav_date: null, units: 0, status: "pending" },
      );
    }
  }
  return { inserts, updates };
}

/** Units held = units at the statement/entry date plus every auto-added installment not skipped. */
export function totalUnits(baseUnits: number, installments: Pick<InstallmentLike, "status" | "units">[]) {
  return installments.reduce((s, i) => (i.status === "applied" ? s + Number(i.units) : s), Number(baseUnits) || 0);
}
