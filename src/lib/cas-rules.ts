/** Rules for Detailed CAS imports: the 91-day window, reconciliation flags and SIP detection. */
import { addDays, daysBetween, todayIST } from "./dates";
import type { ParsedTxn } from "./cas-parser";

/** Days between imports: importing on day 1 opens again on day 91, then day 181. */
export const CAS_IMPORT_GAP_DAYS = 90;
/** Rows whose app value differs from the statement value by more than this are flagged. */
export const CAS_FLAG_THRESHOLD = 0.01;
/** AI fallback reads allowed per person per day. */
export const CAS_AI_DAILY_LIMIT = 3;

/** Indian calendar date of an import timestamp. */
export function importDateIST(importedAt: string) {
  return todayIST(new Date(importedAt));
}

export function nextImportDate(lastImportDate: string) {
  return addDays(lastImportDate, CAS_IMPORT_GAP_DAYS);
}

/** Whether a profile can import today, given the IST dates of its successful imports. */
export function importWindow(importDates: string[], today: string): { open: boolean; opensOn: string | null; last: string | null } {
  if (importDates.length === 0) return { open: true, opensOn: null, last: null };
  const last = importDates.reduce((m, d) => (d > m ? d : m));
  const opensOn = nextImportDate(last);
  return { open: today >= opensOn, opensOn, last };
}

/** Relative difference between the app's value and the statement value, or null when either is missing. */
export function valueDiff(appValue: number | null, statementValue: number | null): number | null {
  if (appValue === null || statementValue === null || !(statementValue > 0)) return null;
  return (appValue - statementValue) / statementValue;
}

export function isFlagged(diff: number | null) {
  return diff !== null && Math.abs(diff) > CAS_FLAG_THRESHOLD;
}

function roundSip(amount: number) {
  const step = amount >= 1000 ? 50 : 10;
  return Math.round(amount / step) * step;
}

/**
 * Suggest a monthly SIP from the statement: the most frequent recurring purchase
 * amount over the last ~13 months, seen in at least 3 different months, with the
 * latest one within 45 days of the statement date. Returns null if there isn't one.
 */
export function detectSip(txns: ParsedTxn[], statementTo: string): { amount: number; day: number; months: number } | null {
  const buys = txns.filter((t) => (t.type === "sip" || t.type === "purchase") && t.units > 0 && t.amount > 0);
  const sipTyped = buys.filter((t) => t.type === "sip");
  const pool = (sipTyped.length >= 3 ? sipTyped : buys).filter((t) => t.date <= statementTo && daysBetween(t.date, statementTo) <= 400);
  const buckets = new Map<number, ParsedTxn[]>();
  for (const t of pool) {
    const k = roundSip(t.amount);
    buckets.set(k, [...(buckets.get(k) ?? []), t]);
  }
  let best: { amount: number; list: ParsedTxn[]; months: number } | null = null;
  for (const [amount, list] of buckets) {
    const months = new Set(list.map((t) => t.date.slice(0, 7))).size;
    if (months < 3) continue;
    if (!best || months > best.months || (months === best.months && amount > best.amount)) best = { amount, list, months };
  }
  if (!best) return null;
  const sorted = [...best.list].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = sorted[sorted.length - 1]!;
  if (daysBetween(latest.date, statementTo) > 45) return null; // SIP has stopped
  const counts = new Map<number, number>();
  for (const t of sorted) {
    const d = Math.min(28, Number(t.date.slice(8, 10)));
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let day = Math.min(28, Number(latest.date.slice(8, 10)));
  let top = 0;
  for (const [d, c] of counts) if (c > top || (c === top && d === day)) [day, top] = [d, c];
  return { amount: best.amount, day, months: best.months };
}
