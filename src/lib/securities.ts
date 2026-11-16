/** Pure helpers for the shared securities list: search ranking and list parsers. */

export interface SecurityLite {
  id?: string;
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  isin: string | null;
}

/** Lower rank is better. Prefix matches come first, then word-start, then anywhere. */
export function searchRank(s: Pick<SecurityLite, "symbol" | "name">, q: string): number | null {
  const query = q.trim().toLowerCase();
  if (!query) return null;
  const sym = s.symbol.toLowerCase();
  const name = s.name.toLowerCase();
  if (sym === query) return 0;
  if (name === query) return 1;
  if (sym.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (name.split(/[\s.&,-]+/).some((w) => w.startsWith(query))) return 4;
  if (sym.includes(query) || name.includes(query)) return 5;
  return null;
}

/** Up to `limit` matches, best first, ties broken by shorter name then alphabetically. */
export function searchSecurities<T extends Pick<SecurityLite, "symbol" | "name">>(list: T[], q: string, limit = 10): T[] {
  return list
    .map((s) => ({ s, r: searchRank(s, q) }))
    .filter((x): x is { s: T; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.s.name.length - b.s.name.length || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}

/** NSE EQUITY_L.csv: SYMBOL, NAME OF COMPANY, SERIES, ..., ISIN NUMBER, ... Only the EQ series is kept. */
export function parseNseEquityList(csv: string): SecurityLite[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]!).map((h) => h.trim().toUpperCase());
  const iSym = head.indexOf("SYMBOL");
  const iName = head.findIndex((h) => h.startsWith("NAME OF"));
  const iSeries = head.findIndex((h) => h === "SERIES");
  const iIsin = head.findIndex((h) => h.includes("ISIN"));
  if (iSym < 0 || iName < 0) return [];
  const out: SecurityLite[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line).map((x) => x.trim());
    if (iSeries >= 0 && c[iSeries] !== "EQ") continue;
    const symbol = c[iSym];
    const name = c[iName];
    if (!symbol || !name) continue;
    out.push({ symbol, name, exchange: "NSE", country: "IN", currency: "INR", isin: iIsin >= 0 && c[iIsin] ? c[iIsin]! : null });
  }
  return out;
}

/** SEC company_tickers_exchange.json: { fields: [cik, name, ticker, exchange], data: [[...]] }. */
export function parseSecTickers(json: unknown): SecurityLite[] {
  const j = json as { fields?: string[]; data?: unknown[][] };
  if (!j?.fields || !Array.isArray(j.data)) return [];
  const iName = j.fields.indexOf("name");
  const iTicker = j.fields.indexOf("ticker");
  const iEx = j.fields.indexOf("exchange");
  if (iName < 0 || iTicker < 0 || iEx < 0) return [];
  const out: SecurityLite[] = [];
  for (const row of j.data) {
    const exchange = String(row[iEx] ?? "");
    if (exchange !== "Nasdaq" && exchange !== "NYSE") continue;
    const symbol = String(row[iTicker] ?? "").trim();
    const name = String(row[iName] ?? "").trim();
    if (!symbol || !name) continue;
    out.push({ symbol, name, exchange: exchange === "Nasdaq" ? "NASDAQ" : "NYSE", country: "US", currency: "USD", isin: null });
  }
  return out;
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
