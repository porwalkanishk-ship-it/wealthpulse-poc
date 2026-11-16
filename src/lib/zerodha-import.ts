/**
 * Tolerant reader for broker holdings files (Zerodha Console XLSX/CSV, or our CSV template).
 * Works on a grid of cells, so XLSX and CSV share one path. Pure and browser-safe.
 */
import { splitCsvLine, type SecurityLite } from "./securities";

export type Cell = string | number | boolean | Date | null | undefined;
export type ColumnKey = "symbol" | "isin" | "quantity" | "avgPrice";
export type ColumnMap = Partial<Record<ColumnKey, number>>;

const norm = (v: Cell) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const MATCHERS: Record<ColumnKey, (h: string) => boolean> = {
  isin: (h) => h.includes("isin"),
  symbol: (h) => h === "symbol" || h === "instrument" || h === "scrip" || h.startsWith("symbol") || h.includes("trading symbol") || h === "stock",
  // "quantity available" and the like count; "quantity discrepant"/"pledged" do not.
  quantity: (h) => (h === "qty" || h.includes("quantity")) && !/(discrepan|pledg|long term|t1|collateral|used)/.test(h),
  avgPrice: (h) => /avg|average/.test(h) && /(price|cost|cost price)/.test(h) || h === "average price" || h === "avg cost",
};

export interface HeaderFind {
  headerRow: number;
  map: ColumnMap;
  /** Required columns not found: the caller should show a mapping screen for these. */
  missing: ColumnKey[];
}

/** Finds the header row (within the first 40 rows) with the most recognised columns. */
export function findHeader(grid: Cell[][]): HeaderFind | null {
  let best: { row: number; map: ColumnMap; score: number } | null = null;
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const map: ColumnMap = {};
    (grid[r] ?? []).forEach((cell, c) => {
      const h = norm(cell);
      if (!h) return;
      for (const key of Object.keys(MATCHERS) as ColumnKey[]) {
        if (map[key] === undefined && MATCHERS[key](h)) { map[key] = c; break; }
      }
    });
    const score = Object.keys(map).length + (map.quantity !== undefined ? 1 : 0);
    if (score >= 2 && (!best || score > best.score)) best = { row: r, map, score };
  }
  if (!best) return null;
  const missing: ColumnKey[] = [];
  if (best.map.symbol === undefined && best.map.isin === undefined) missing.push("symbol");
  if (best.map.quantity === undefined) missing.push("quantity");
  return { headerRow: best.row, map: best.map, missing };
}

export interface ImportRow {
  line: number;
  symbol: string | null;
  isin: string | null;
  quantity: number;
  avgPrice: number | null;
  name: string | null;
}

const toNumber = (v: Cell): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const ISIN = /^IN[A-Z0-9]{9}\d$/;

export function readRows(grid: Cell[][], find: { headerRow: number; map: ColumnMap }): { rows: ImportRow[]; skipped: { line: number; reason: string }[] } {
  const rows: ImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const { map } = find;
  for (let r = find.headerRow + 1; r < grid.length; r++) {
    const g = grid[r] ?? [];
    if (g.every((c) => String(c ?? "").trim() === "")) continue;
    const get = (k: ColumnKey) => (map[k] === undefined ? undefined : g[map[k]!]);
    const symbolRaw = String(get("symbol") ?? "").trim();
    const isinRaw = String(get("isin") ?? "").trim().toUpperCase();
    const qty = toNumber(get("quantity"));
    const line = r + 1;
    if (!symbolRaw && !isinRaw) continue;
    if (qty === null || qty <= 0) { skipped.push({ line, reason: "No quantity" }); continue; }
    const symbol = symbolRaw ? symbolRaw.replace(/-(EQ|BE|BZ|SM)$/i, "").toUpperCase() : null;
    rows.push({ line, symbol, isin: ISIN.test(isinRaw) ? isinRaw : null, quantity: qty, avgPrice: toNumber(get("avgPrice")), name: null });
  }
  return { rows, skipped };
}

/** Parses CSV text into a grid. */
export function csvToGrid(text: string): Cell[][] {
  return text.split(/\r?\n/).map((l) => splitCsvLine(l));
}

export type RowKind = "equity" | "mutual_fund" | "gold_bond";

/** Mutual fund units come from the CAS; sovereign gold bonds belong in the Gold category. */
export function classifyRow(row: Pick<ImportRow, "symbol" | "isin">, name?: string | null): RowKind {
  const sym = row.symbol ?? "";
  const label = `${sym} ${name ?? ""}`;
  if (/^SGB/i.test(sym) || /sovereign gold|\bSGB\b/i.test(label)) return "gold_bond";
  if (row.isin && /^INF/.test(row.isin)) return "mutual_fund";
  return "equity";
}

export interface MatchResult {
  row: ImportRow;
  kind: RowKind;
  security: SecurityLite | null;
  by: "isin" | "symbol" | null;
}

/** ISIN first, then symbol. Prefers NSE when a symbol exists on more than one exchange. */
export function matchRows(rows: ImportRow[], securities: SecurityLite[]): MatchResult[] {
  const byIsin = new Map<string, SecurityLite>();
  const bySymbol = new Map<string, SecurityLite>();
  for (const s of securities) {
    if (s.isin && (!byIsin.has(s.isin) || s.exchange === "NSE")) byIsin.set(s.isin, s);
    const k = s.symbol.toUpperCase();
    const cur = bySymbol.get(k);
    if (!cur || (s.exchange === "NSE" && cur.exchange !== "NSE")) bySymbol.set(k, s);
  }
  return rows.map((row) => {
    const kind = classifyRow(row);
    if (kind !== "equity") return { row, kind, security: null, by: null };
    const i = row.isin ? byIsin.get(row.isin) : undefined;
    if (i) return { row, kind, security: i, by: "isin" as const };
    const s = row.symbol ? bySymbol.get(row.symbol) : undefined;
    return { row, kind, security: s ?? null, by: s ? ("symbol" as const) : null };
  });
}

export const TEMPLATE_CSV = "ISIN or symbol,Quantity,Average price\nINE002A01018,10,2450.50\nTCS,5,3300\n";
