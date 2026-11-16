/** Rules for showing a security's price: staleness and suspicious jumps. */
import { daysBetween } from "./dates";

export const STALE_AFTER_TRADING_DAYS = 3;
export const CORPORATE_ACTION_MOVE = 0.4;

/** Weekdays strictly after `from` up to and including `to` (market holidays are not known, so this errs towards fresh). */
export function tradingDaysBetween(from: string, to: string): number {
  const days = daysBetween(from, to);
  if (days <= 0) return 0;
  let count = 0;
  const start = new Date(from + "T00:00:00Z").getTime();
  for (let i = 1; i <= days; i++) {
    const dow = new Date(start + i * 86_400_000).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function isStalePrice(priceDate: string, today: string): boolean {
  return tradingDaysBetween(priceDate, today) > STALE_AFTER_TRADING_DAYS;
}

/** True when the latest close moved more than 40% from the previous close. */
export function possibleCorporateAction(close: number, prevClose: number | null | undefined): boolean {
  if (!prevClose || prevClose <= 0 || !(close > 0)) return false;
  return Math.abs(close - prevClose) / prevClose > CORPORATE_ACTION_MOVE;
}
