import { splitCsvLine } from "../securities";
import { pad2, addDays } from "../dates";
import type { PriceAdapter, PriceQuote } from "./types";

/** NSE daily bhavcopy (sec_bhavdata_full_DDMMYYYY.csv), EQ series only. */
export function parseBhavcopy(csv: string, wanted?: Set<string>): PriceQuote[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]!).map((h) => h.trim().toUpperCase());
  const iSym = head.indexOf("SYMBOL");
  const iSeries = head.indexOf("SERIES");
  const iClose = head.indexOf("CLOSE_PRICE");
  const iPrev = head.indexOf("PREV_CLOSE");
  const iDate = head.indexOf("DATE1");
  if (iSym < 0 || iClose < 0) return [];
  const out: PriceQuote[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line).map((x) => x.trim());
    if (iSeries >= 0 && c[iSeries] !== "EQ") continue;
    const symbol = c[iSym];
    if (!symbol || (wanted && !wanted.has(symbol))) continue;
    const close = Number(c[iClose]);
    if (!(close > 0)) continue;
    const prev = iPrev >= 0 ? Number(c[iPrev]) : NaN;
    out.push({ symbol, exchange: "NSE", close, prevClose: prev > 0 ? prev : null, date: toIsoDate(c[iDate] ?? ""), currency: "INR", source: "nse-bhavcopy" });
  }
  return out;
}

/** "14-Nov-2026" -> "2026-11-14"; returns "" when it cannot be read. */
export function toIsoDate(s: string): string {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return "";
  const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]!.toLowerCase());
  if (mon < 0) return "";
  return `${m[3]}-${pad2(mon + 1)}-${pad2(Number(m[1]))}`;
}

export const bhavcopyUrl = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-");
  return `https://archives.nseindia.com/products/content/sec_bhavdata_full_${d}${m}${y}.csv`;
};

/** Try today and the previous 5 days until a bhavcopy file exists (weekends and holidays have none). */
export function createNseAdapter(todayISO: string, fetchText: (url: string) => Promise<string | null>): PriceAdapter {
  return {
    id: "nse-bhavcopy",
    exchanges: ["NSE"],
    async fetchLatest(symbols) {
      const wanted = new Set(symbols);
      for (let back = 0; back <= 5; back++) {
        const csv = await fetchText(bhavcopyUrl(addDays(todayISO, -back)));
        if (csv) return parseBhavcopy(csv, wanted);
      }
      throw new Error("NSE bhavcopy is not available right now");
    },
  };
}
