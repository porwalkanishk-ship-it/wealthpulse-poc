/**
 * Deterministic reader for CAMS and KFintech *Detailed* CAS statement text
 * (as produced by src/lib/pdf-text.ts). Pure and browser-safe.
 * Never include statement text in thrown errors or logs.
 */
import { toISO } from "./dates";

export type TxnType =
  | "purchase"
  | "sip"
  | "redemption"
  | "switch_in"
  | "switch_out"
  | "dividend_reinvest"
  | "dividend_payout"
  | "other";

export interface ParsedTxn {
  date: string;
  type: TxnType;
  amount: number;
  units: number;
  nav: number | null;
  balance_units: number | null;
}

export interface ParsedFund {
  scheme_name: string;
  isin: string | null;
  folio: string | null;
  opening_units: number;
  closing_units: number;
  closing_nav: number | null;
  nav_date: string | null;
  market_value: number | null;
  cost_value: number | null;
  transactions: ParsedTxn[];
  /** True when the last transaction's unit balance matches the closing balance. */
  balance_ok: boolean;
}

export type ParsedStatement =
  | { kind: "detailed"; statement_from: string | null; statement_to: string | null; funds: ParsedFund[] }
  | { kind: "summary" }
  | { kind: "unreadable" };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DATE_SRC = "\\d{1,2}[-/ ](?:[A-Za-z]{3}|\\d{1,2})[-/ ]\\d{4}";
const TXN_START = new RegExp(`^(${DATE_SRC})\\s+(.*)$`);
const PERIOD_RE = new RegExp(`(${DATE_SRC})\\s*(?:to|-|–)\\s*(${DATE_SRC})`, "i");
const NUM_TOKEN = /^\(?-?[\d,]*\d\.\d+\)?$/;
const FOLIO_RE = /Folio\s*(?:No|Number)?\.?\s*:?\s*(\d[\dA-Za-z]*(?:\s*\/\s*[\dA-Za-z]+)?)/i;
const OPENING_RE = /Opening\s+Unit\s+Balance\s*:?\s*\(?(-?[\d,]*\d(?:\.\d+)?)\)?/i;
const CLOSING_RE = /Closing\s+Unit\s+Balance\s*:?\s*\(?(-?[\d,]*\d(?:\.\d+)?)\)?/i;
const CUR = "(?:INR|Rs\\.?|₹)?";
const NAV_ON_RE = new RegExp(`NAV\\s+on\\s+(${DATE_SRC})\\s*:?\\s*${CUR}\\s*([\\d,]*\\d\\.\\d+)`, "i");
const MV_RE = new RegExp(`Market\\s+Value\\s+on\\s+(${DATE_SRC})\\s*:?\\s*${CUR}\\s*([\\d,]*\\d\\.\\d+)`, "i");
const COST_RE = new RegExp(`Cost\\s+Value\\s*:?\\s*${CUR}\\s*([\\d,]*\\d\\.\\d+)`, "i");
const ISIN_RE = /ISIN\s*:?\s*(IN[A-Z0-9]{9}\d)/i;
const CODE_PREFIX = /^[A-Z0-9]{2,10}\s*-\s*(?=[A-Za-z])/;

const JUNK = [
  /^Page\s*\d+(\s*(of|\/)\s*\d+)?$/i,
  /^Date\s+Transaction/i,
  /^\(?INR\)?(\s+\(?INR\)?)*$/i,
  /^Consolidated\s+Account\s+(Statement|Summary)\s*$/i,
];
const SKIP_HEADER = /^(PAN|KYC|Nominee|Joint|Holder|Guardian|Advisor|Mobile|Email|E-mail)\b/i;

export function parseCasDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/);
  let d: number, mo: number, y: number;
  if (m) {
    d = Number(m[1]);
    mo = MONTHS[m[2]!.toLowerCase()] ?? 0;
    y = Number(m[3]);
  } else {
    m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!m) return null;
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
  }
  if (!mo || mo > 12 || d < 1 || d > 31 || y < 1960 || y > 2100) return null;
  return toISO(y, mo, d);
}

export function parseNum(tok: string): number {
  const neg = /^\(.*\)$/.test(tok) || tok.startsWith("-");
  const v = Number(tok.replace(/[(),\s-]/g, ""));
  if (!Number.isFinite(v)) return NaN;
  return neg ? -v : v;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Map a transaction description to a type. Description text is never stored. */
export function classifyTxn(desc: string, units: number): TxnType {
  const d = desc.toLowerCase();
  if (/revers|reject|cancel/.test(d)) return "other";
  if (/switch|\bstp\b|systematic transfer/.test(d)) return units >= 0 ? "switch_in" : "switch_out";
  if (/(dividend|idcw)[^]*reinvest|reinvest[^]*(dividend|idcw)/.test(d)) return "dividend_reinvest";
  if (/dividend|idcw/.test(d)) return units > 0 ? "dividend_reinvest" : "dividend_payout";
  if (/redempt|redeem|withdraw|\bswp\b/.test(d) || units < 0) return "redemption";
  if (/systematic|\bsip\b|instal/.test(d)) return "sip";
  if (/purchase|subscri|\bnfo\b|investment|additional|allot|bonus/.test(d)) return "purchase";
  return units > 0 ? "purchase" : "other";
}

function normFolio(f: string) {
  return f.replace(/\s+/g, "");
}

export function cleanSchemeName(raw: string) {
  return raw
    .replace(/\s*-?\s*ISIN\s*:?.*$/i, "")
    .replace(/\s*Registrar\s*:.*$/i, "")
    .replace(/\((?:Non-Demat|Demat)\)/gi, "")
    .replace(/\(Advisor[^)]*\)?/gi, "")
    .replace(/\(formerly[^)]*\)/gi, "")
    .replace(CODE_PREFIX, "")
    .replace(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim();
}

interface Block {
  folio: string | null;
  header: string[];
  scheme: { name: string; isin: string | null } | null;
  opening: number;
  txns: ParsedTxn[];
  inTxn: boolean;
  pending: string | null;
}

const newBlock = (folio: string | null): Block => ({ folio, header: [], scheme: null, opening: 0, txns: [], inTxn: false, pending: null });

function schemeFromHeader(header: string[]): { name: string; isin: string | null } | null {
  if (header.length === 0) return null;
  const idx = header.findIndex((l) => /ISIN/i.test(l) || /Registrar/i.test(l));
  const end = idx >= 0 ? idx : 0;
  let start = Math.max(0, end - 2);
  for (let k = start; k <= end; k++) {
    if (CODE_PREFIX.test(header[k]!)) {
      start = k;
      break;
    }
  }
  const text = header.slice(start, end + 1).join(" ");
  const name = cleanSchemeName(text);
  if (!name) return null;
  return { name, isin: text.match(ISIN_RE)?.[1]?.toUpperCase() ?? null };
}

function tailNumbers(rest: string) {
  const tokens = rest.split(/\s+/).filter(Boolean);
  const nums: number[] = [];
  while (tokens.length && NUM_TOKEN.test(tokens[tokens.length - 1]!)) nums.unshift(parseNum(tokens.pop()!));
  return { desc: tokens.join(" "), nums };
}

/** Returns true when the line was consumed as a transaction or a charge line. */
function tryTxn(b: Block, line: string): boolean {
  const m = line.match(TXN_START);
  if (!m) return false;
  const date = parseCasDate(m[1]!);
  if (!date) return false;
  const { desc, nums } = tailNumbers(m[2]!);
  if (/\*\*\*/.test(desc)) return true; // stamp duty, STT, TDS and notes: no units
  if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) return false;
  let amount: number, units: number, nav: number, bal: number;
  if (nums.length >= 4) [amount, units, nav, bal] = nums.slice(-4) as [number, number, number, number];
  else {
    [units, nav, bal] = nums as [number, number, number];
    amount = round(units * nav, 2);
  }
  const type = classifyTxn(desc, units);
  if (type === "redemption" || type === "switch_out") {
    units = -Math.abs(units);
    amount = -Math.abs(amount);
  } else if (units < 0 && amount > 0) amount = -amount;
  b.txns.push({ date, type, amount: round(amount, 2), units: round(units, 4), nav: nav ? Math.abs(nav) : null, balance_units: round(bal, 4) });
  return true;
}

function handleTxnLine(b: Block, line: string) {
  if (!TXN_START.test(line)) {
    if (b.pending) {
      const merged = `${b.pending} ${line}`;
      b.pending = null;
      tryTxn(b, merged);
    }
    return;
  }
  b.pending = null;
  if (tryTxn(b, line)) return;
  const { nums } = tailNumbers(line.replace(TXN_START, "$2"));
  if (nums.length === 0) b.pending = line; // description wrapped onto the next line
}

function finalize(b: Block, blob: string): ParsedFund {
  const closing = parseNum(blob.match(CLOSING_RE)?.[1] ?? "0");
  const navM = blob.match(NAV_ON_RE);
  const mvM = blob.match(MV_RE);
  const costM = blob.match(COST_RE);
  const last = b.txns[b.txns.length - 1];
  const lastBal = last?.balance_units ?? b.opening;
  return {
    scheme_name: b.scheme!.name,
    isin: b.scheme!.isin,
    folio: b.folio,
    opening_units: b.opening,
    closing_units: Number.isFinite(closing) ? closing : 0,
    closing_nav: navM ? parseNum(navM[2]!) : null,
    nav_date: navM ? parseCasDate(navM[1]!) : mvM ? parseCasDate(mvM[1]!) : null,
    market_value: mvM ? parseNum(mvM[2]!) : null,
    cost_value: costM ? parseNum(costM[1]!) : null,
    transactions: b.txns,
    balance_ok: Math.abs(lastBal - closing) < 0.011,
  };
}

function looksLikeTxnLine(line: string) {
  const m = line.match(TXN_START);
  return !!m && tailNumbers(m[2]!).nums.length >= 3;
}

export function parseCasText(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const funds: ParsedFund[] = [];
  let folio: string | null = null;
  let cur: Block | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line || JUNK.some((r) => r.test(line))) continue;

    const fm = line.match(FOLIO_RE);
    if (fm) {
      const f = normFolio(fm[1]!);
      if (cur?.inTxn && f === cur.folio) continue; // folio repeated in a page header
      folio = f;
      cur = newBlock(f);
      continue;
    }
    const om = line.match(OPENING_RE);
    if (om) {
      if (!cur) cur = newBlock(folio);
      if (cur.inTxn) continue;
      cur.scheme = schemeFromHeader(cur.header);
      cur.opening = parseNum(om[1]!) || 0;
      cur.inTxn = true;
      continue;
    }
    if (CLOSING_RE.test(line)) {
      if (cur?.inTxn && cur.scheme) {
        const blob = [line];
        for (let k = 1; k <= 2; k++) {
          const next = lines[i + k] ?? "";
          if (!next || TXN_START.test(next) || FOLIO_RE.test(next) || OPENING_RE.test(next) || CLOSING_RE.test(next)) break;
          blob.push(next);
        }
        funds.push(finalize(cur, blob.join(" ")));
      }
      cur = folio ? newBlock(folio) : null; // KFintech can list several schemes under one folio
      continue;
    }
    if (!cur) continue;
    if (cur.inTxn) handleTxnLine(cur, line);
    else if (!SKIP_HEADER.test(line)) {
      cur.header.push(line);
      if (cur.header.length > 8) cur.header.shift();
    }
  }

  const txnCount = funds.reduce((s, f) => s + f.transactions.length, 0);
  const hasOpening = OPENING_RE.test(text);
  const anyTxnLines = lines.some(looksLikeTxnLine);
  if (funds.length === 0 || txnCount === 0) {
    const summarySignals = /Account\s+Summary|Summary\s+Statement|ISIN|Market\s+Value|Unit\s+Balance/i.test(text);
    if (!hasOpening && !anyTxnLines && summarySignals) return { kind: "summary" };
    return { kind: "unreadable" };
  }

  const held = funds.filter((f) => f.closing_units > 0.0005);
  if (held.length === 0) return { kind: "unreadable" };
  const period = text.match(PERIOD_RE);
  let from = period ? parseCasDate(period[1]!) : null;
  let to = period ? parseCasDate(period[2]!) : null;
  if (from && to && from > to) [from, to] = [to, from];
  if (!to) to = held.reduce<string | null>((m, f) => (f.nav_date && (!m || f.nav_date > m) ? f.nav_date : m), null);
  return { kind: "detailed", statement_from: from, statement_to: to, funds: held };
}
