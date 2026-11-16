import { describe, expect, it } from "vitest";
import { parseNseEquityList, parseSecTickers, searchRank, searchSecurities } from "@/lib/securities";
import { isStalePrice, possibleCorporateAction, tradingDaysBetween } from "@/lib/price-rules";
import { parseBhavcopy, toIsoDate } from "@/lib/prices/nse-bhavcopy";
import { createTwelveDataAdapter, parseTwelveDataQuotes } from "@/lib/prices/twelve-data";
import { classifyRow, csvToGrid, findHeader, matchRows, readRows } from "@/lib/zerodha-import";

const S = (symbol: string, name: string, exchange = "NSE", isin: string | null = null) => ({ symbol, name, exchange, country: "IN", currency: "INR", isin });

describe("security search", () => {
  const list = [S("INFY", "Infosys Limited"), S("INFIBEAM", "Infibeam Avenues Limited"), S("TCS", "Tata Consultancy Services Limited"), S("TATAMOTORS", "Tata Motors Limited"), S("ZINFO", "Z Info Systems")];
  it("ranks prefix matches before other matches, case-insensitively", () => {
    expect(searchSecurities(list, "inf").map((s) => s.symbol)).toEqual(["INFY", "INFIBEAM", "ZINFO"]);
    expect(searchSecurities(list, "TATA").map((s) => s.symbol)).toEqual(["TATAMOTORS", "TCS"]);
  });
  it("puts an exact symbol first and caps at 10", () => {
    expect(searchRank(list[2]!, "tcs")).toBe(0);
    const many = Array.from({ length: 30 }, (_, i) => S(`AB${i}`, `Alpha Beta ${i}`));
    expect(searchSecurities(many, "ab").length).toBe(10);
  });
  it("returns nothing for an empty query", () => {
    expect(searchSecurities(list, "  ")).toEqual([]);
  });
});

describe("list parsers", () => {
  it("keeps only EQ series from the NSE list", () => {
    const csv = "SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\nINFY,Infosys Limited,EQ,08-FEB-1995,5,1,INE009A01021,5\nXYZ,Some Bond,N1,01-JAN-2020,100,1,INE000000000,100";
    const out = parseNseEquityList(csv);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: "INFY", isin: "INE009A01021", exchange: "NSE" });
  });
  it("keeps Nasdaq and NYSE tickers from the SEC list", () => {
    const j = { fields: ["cik", "name", "ticker", "exchange"], data: [[1, "Salesforce, Inc.", "CRM", "NYSE"], [2, "OTC Co", "OTCX", "OTC"], [3, "Apple Inc.", "AAPL", "Nasdaq"]] };
    expect(parseSecTickers(j).map((s) => `${s.exchange}:${s.symbol}`)).toEqual(["NYSE:CRM", "NASDAQ:AAPL"]);
  });
});

describe("price rules", () => {
  it("counts weekdays only", () => {
    expect(tradingDaysBetween("2026-11-13", "2026-11-16")).toBe(1); // Fri -> Mon
  });
  it("is stale only after more than 3 trading days", () => {
    expect(isStalePrice("2026-11-12", "2026-11-16")).toBe(false); // Thu -> Mon = 2
    expect(isStalePrice("2026-11-09", "2026-11-16")).toBe(true); // Mon -> Mon = 5
    expect(isStalePrice("2026-11-11", "2026-11-16")).toBe(false); // 3
    expect(isStalePrice("2026-11-10", "2026-11-16")).toBe(true); // 4
  });
  it("flags a move above 40% either way", () => {
    expect(possibleCorporateAction(60, 100)).toBe(false);
    expect(possibleCorporateAction(59, 100)).toBe(true);
    expect(possibleCorporateAction(141, 100)).toBe(true);
    expect(possibleCorporateAction(100, null)).toBe(false);
  });
});

describe("price sources", () => {
  it("reads EQ rows from a bhavcopy", () => {
    const csv = "SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE\nINFY, EQ, 13-Nov-2026, 1500.00, 1,1,1,1, 1520.50\nINFY, BE, 13-Nov-2026, 1,1,1,1,1, 9\nTCS, EQ, 13-Nov-2026, 3300, 1,1,1,1, 3310";
    const q = parseBhavcopy(csv, new Set(["INFY"]));
    expect(q).toEqual([{ symbol: "INFY", exchange: "NSE", close: 1520.5, prevClose: 1500, date: "2026-11-13", currency: "INR", source: "nse-bhavcopy" }]);
    expect(toIsoDate("1-Jan-2026")).toBe("2026-01-01");
  });
  it("reads a batch of Twelve Data quotes and skips errors", () => {
    const json = { CRM: { symbol: "CRM", close: "250.10", previous_close: "248", datetime: "2026-11-13", currency: "USD" }, NOPE: { code: 400, status: "error" } };
    expect(parseTwelveDataQuotes(json, ["CRM", "NOPE"]).map((x) => x.symbol)).toEqual(["CRM"]);
  });
  it("stops when the daily quota is used up and throttles between batches", async () => {
    const calls: string[] = [];
    let slept = 0;
    const adapter = createTwelveDataAdapter("k", async (u) => { calls.push(u); return {}; }, async () => { slept++; }, 10);
    await adapter.fetchLatest(Array.from({ length: 20 }, (_, i) => `S${i}`));
    expect(calls).toHaveLength(1); // 8 credits spent, only 2 left, next batch needs 8
    expect(slept).toBe(0);
  });
});

describe("holdings import", () => {
  const zerodha = [
    ["Equity Holdings Statement for XX1234"],
    [],
    ["Symbol", "ISIN", "Sector", "Quantity Available", "Quantity Long Term", "Quantity Pledged (Margin)", "Average Price", "Previous Closing Price", "Unrealized P&L"],
    ["INFY", "INE009A01021", "IT", 10, 5, 0, 1500.5, 1520, 200],
    ["SGBMAR31-GB", "IN0020230044", "", 3, 0, 0, 6000, 6100, 300],
    ["", "", "", "", "", "", "", "", ""],
    ["NIFTYBEES", "INF204KB14I2", "", 20, 0, 0, 250, 252, 40],
  ];
  it("finds the header despite extra columns and a title block", () => {
    const f = findHeader(zerodha)!;
    expect(f.headerRow).toBe(2);
    expect(f.missing).toEqual([]);
    expect(f.map).toMatchObject({ symbol: 0, isin: 1, quantity: 3, avgPrice: 6 });
  });
  it("copes with different header wording", () => {
    const g = csvToGrid("Trading Symbol,ISIN Code,Qty,Avg. Cost\nTCS,INE467B01029,5,\"3,300.00\"");
    const f = findHeader(g)!;
    expect(f.missing).toEqual([]);
    expect(readRows(g, f).rows[0]).toMatchObject({ symbol: "TCS", quantity: 5, avgPrice: 3300 });
  });
  it("asks for a mapping when quantity is not found", () => {
    const f = findHeader([["Symbol", "ISIN", "Holding"], ["TCS", "INE467B01029", 3]])!;
    expect(f.missing).toEqual(["quantity"]);
  });
  it("skips mutual funds and maps gold bonds", () => {
    const f = findHeader(zerodha)!;
    const { rows } = readRows(zerodha, f);
    expect(rows.map((r) => classifyRow(r))).toEqual(["equity", "gold_bond", "mutual_fund"]);
  });
  it("matches on ISIN first, then symbol", () => {
    const secs = [S("INFY", "Infosys Limited", "NSE", "INE009A01021"), S("TCS", "Tata Consultancy", "NSE", null), { ...S("TCS", "TCS NYSE", "NYSE"), country: "US" }];
    const rows = [
      { line: 1, symbol: "WRONG", isin: "INE009A01021", quantity: 1, avgPrice: null, name: null },
      { line: 2, symbol: "TCS", isin: null, quantity: 1, avgPrice: null, name: null },
      { line: 3, symbol: "NOPE", isin: null, quantity: 1, avgPrice: null, name: null },
    ];
    const m = matchRows(rows, secs);
    expect(m.map((x) => [x.by, x.security?.symbol ?? null])).toEqual([["isin", "INFY"], ["symbol", "TCS"], [null, null]]);
    expect(m[1]!.security!.exchange).toBe("NSE");
  });
});
