import { describe, expect, it } from "vitest";
import { parseCasText } from "@/lib/cas-parser";
import { redactCasText } from "@/lib/cas-redact";
import { detectSip, importWindow, isFlagged, nextImportDate, valueDiff } from "@/lib/cas-rules";

// Synthetic statement: every name, PAN, email, phone and address below is invented.
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
function sipLines() {
  const out: string[] = [];
  let bal = 0;
  months.forEach((m, i) => {
    const units = 40 + i;
    bal += units;
    const line = `05-${m}-2026 Systematic Investment Purchase - Instalment ${i + 1}/60 4,999.75 ${units.toFixed(3)} 101.250 ${bal.toFixed(3)}`;
    if (i === 3) {
      out.push(`05-${m}-2026 Systematic Investment`);
      out.push(line.replace(`05-${m}-2026 Systematic Investment `, ""));
      out.push("Page 1 of 3", "Consolidated Account Statement", "Date Transaction Amount Units NAV Unit Balance", "(INR) (INR)");
    } else out.push(line);
    out.push(`05-${m}-2026 *** Stamp Duty *** 0.25`);
  });
  bal -= 10;
  out.push(`20-Oct-2026 Redemption (1,050.00) (10.000) 105.000 ${bal.toFixed(3)}`);
  return { out, bal };
}
const sip = sipLines();
const CAMS = [
  "Consolidated Account Statement",
  "RAVI TESTKUMAR 01-Jan-2018 To 14-Nov-2026",
  "Email Id: ravi.test@example.com",
  "Flat 12, Imaginary Apartments, MG Road",
  "Bengaluru - 560001",
  "Mobile: +91 9876543210",
  "PAN: ABCPT1234Z",
  "Test AMC Mutual Fund",
  "Folio No: 1234567 / 89 PAN: ABCPT1234Z KYC: OK PAN: OK",
  "TA12DG-Test AMC Flexi Cap Fund - Direct Plan -",
  "Growth (Non-Demat) - ISIN: INF000T01AB1(Advisor: DIRECT) Registrar : CAMS",
  "RAVI TESTKUMAR",
  "Nominee 1: SITA TESTKUMAR",
  "Opening Unit Balance: 0.000",
  ...sip.out,
  `Closing Unit Balance: ${sip.bal.toFixed(3)} NAV on 13-Nov-2026: INR 120.5000 Total Cost Value: 49,997.50 Market Value on 13-Nov-2026: INR 52,526.95`,
  "Folio No: 9104567890 / 0",
  "PAN: ABCPT1234Z KYC: OK",
  "XYZ1-Sample Bluechip Fund - Direct Growth - ISIN: INF000X01CD2 (Advisor: DIRECT) Registrar : KFINTECH",
  "Opening Unit Balance: 0.000",
  "10-Feb-2021 Purchase 10,000.00 245.123 40.7957 245.123",
  "Closing Unit Balance: 245.123 NAV on 31-Oct-2026: INR 55.1234 Cost Value: INR 10,000.00",
  "Market Value on 31-Oct-2026: INR 13,512.34",
].join("\n");

const SUMMARY = [
  "Consolidated Account Summary",
  "As on 14-Nov-2026",
  "Folio No. Scheme Name Cost Value Unit Balance NAV Date NAV Market Value Registrar",
  "1234567/89 Test AMC Flexi Cap Fund - Direct Growth ISIN: INF000T01AB1 1,00,000.00 500.000 13-Nov-2026 120.5000 60,250.00 CAMS",
].join("\n");

describe("Detailed CAS parser", () => {
  const res = parseCasText(CAMS);
  it("reads both funds with folio, ISIN and statement period", () => {
    expect(res.kind).toBe("detailed");
    if (res.kind !== "detailed") return;
    expect(res.statement_from).toBe("2018-01-01");
    expect(res.statement_to).toBe("2026-11-14");
    expect(res.funds.map((f) => [f.folio, f.isin])).toEqual([["1234567/89", "INF000T01AB1"], ["9104567890/0", "INF000X01CD2"]]);
  });
  it("joins a scheme name split over two lines", () => {
    if (res.kind !== "detailed") throw new Error();
    expect(res.funds[0]!.scheme_name).toBe("Test AMC Flexi Cap Fund - Direct Plan - Growth");
  });
  it("reads every transaction across a page break, skipping stamp duty", () => {
    if (res.kind !== "detailed") throw new Error();
    const f = res.funds[0]!;
    expect(f.transactions).toHaveLength(11);
    expect(f.transactions.filter((t) => t.type === "sip")).toHaveLength(10);
    expect(f.transactions[10]).toMatchObject({ type: "redemption", amount: -1050, units: -10 });
    expect(f.balance_ok).toBe(true);
  });
  it("reads closing units, NAV and value, even when split over lines", () => {
    if (res.kind !== "detailed") throw new Error();
    expect(res.funds[1]).toMatchObject({ closing_units: 245.123, closing_nav: 55.1234, nav_date: "2026-10-31", market_value: 13512.34 });
  });
  it("rejects a Summary statement", () => {
    expect(parseCasText(SUMMARY).kind).toBe("summary");
  });
  it("reports unreadable text so the AI fallback can try", () => {
    expect(parseCasText("random words without any statement content at all").kind).toBe("unreadable");
  });
});

describe("redaction before the AI fallback", () => {
  const out = redactCasText(CAMS, ["Ravi Testkumar"]);
  it("removes name, PAN, email, phone and address", () => {
    for (const s of ["RAVI", "TESTKUMAR", "SITA", "ABCPT1234Z", "ravi.test@example.com", "9876543210", "MG Road", "560001"]) expect(out).not.toContain(s);
  });
  it("keeps everything the parser needs", () => {
    const r = parseCasText(out);
    expect(r.kind).toBe("detailed");
    if (r.kind === "detailed") expect(r.funds.reduce((s, f) => s + f.transactions.length, 0)).toBe(12);
  });
});

describe("import window", () => {
  it("day 1, then day 91, then day 181", () => {
    expect(nextImportDate("2026-01-01")).toBe("2026-04-01");
    expect(nextImportDate("2026-04-01")).toBe("2026-06-30");
  });
  it("is closed until the opening date and open on it", () => {
    expect(importWindow(["2026-01-01"], "2026-03-31")).toMatchObject({ open: false, opensOn: "2026-04-01" });
    expect(importWindow(["2026-01-01"], "2026-04-01").open).toBe(true);
    expect(importWindow([], "2026-01-01").open).toBe(true);
  });
});

describe("reconciliation flag", () => {
  it("flags a difference above 1% only", () => {
    expect(isFlagged(valueDiff(101.5, 100))).toBe(true);
    expect(isFlagged(valueDiff(100.9, 100))).toBe(false);
    expect(isFlagged(valueDiff(null, 100))).toBe(false);
  });
});

describe("SIP detection", () => {
  it("suggests ₹5,000 on the 5th from monthly purchases", () => {
    const r = parseCasText(CAMS);
    if (r.kind !== "detailed") throw new Error();
    expect(detectSip(r.funds[0]!.transactions, "2026-11-14")).toMatchObject({ amount: 5000, day: 5 });
  });
  it("suggests nothing for a single lump sum", () => {
    const r = parseCasText(CAMS);
    if (r.kind !== "detailed") throw new Error();
    expect(detectSip(r.funds[1]!.transactions, "2026-11-14")).toBeNull();
  });
});
