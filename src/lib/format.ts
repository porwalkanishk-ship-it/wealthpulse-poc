export type Currency = "INR" | "USD";

const MINUS = "\u2212";

const inrFull = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const usdFull = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export interface MoneyOpts {
  /** Show + for positive values. */
  sign?: boolean;
  /** Decimal places for compact output. */
  digits?: number;
  /** Space between figure and unit in compact output ("₹58.1 L"). */
  space?: boolean;
}

function signed(n: number, body: string, opts: MoneyOpts) {
  if (n < 0) return `${MINUS}${body}`;
  if (opts.sign && n > 0) return `+${body}`;
  return body;
}

/** Full figure with Indian grouping: ₹1,92,40,000 (or $231,450 in USD). */
export function moneyFull(inr: number, currency: Currency = "INR", fx = 1, opts: MoneyOpts = {}) {
  const v = currency === "USD" ? inr / (fx || 1) : inr;
  const abs = Math.abs(Math.round(v));
  const body = currency === "USD" ? `$${usdFull.format(abs)}` : `₹${inrFull.format(abs)}`;
  return signed(Math.round(v), body, opts);
}

/** Compact figure: ₹2.06 Cr, ₹42.8L, ₹48,200 — or $2.31M / $51.2K. */
export function moneyCompact(inr: number, currency: Currency = "INR", fx = 1, opts: MoneyOpts = {}) {
  const v = currency === "USD" ? inr / (fx || 1) : inr;
  const abs = Math.abs(v);
  const sp = opts.space ? " " : "";
  let body: string;
  if (currency === "USD") {
    if (abs >= 1e6) body = `$${(abs / 1e6).toFixed(opts.digits ?? 2)}${sp}M`;
    else if (abs >= 1e4) body = `$${(abs / 1e3).toFixed(opts.digits ?? 1)}${sp}K`;
    else body = `$${usdFull.format(Math.round(abs))}`;
  } else {
    if (abs >= 1e7) body = `₹${(abs / 1e7).toFixed(opts.digits ?? 2)}${sp}Cr`;
    else if (abs >= 1e5) body = `₹${(abs / 1e5).toFixed(opts.digits ?? 1)}${sp}L`;
    else body = `₹${inrFull.format(Math.round(abs))}`;
  }
  if (opts.space && currency === "INR" && abs >= 1e7) body = body.replace(" Cr", " Cr");
  return signed(v, body, opts);
}

export function pct(n: number, digits = 1, sign = false) {
  const body = `${Math.abs(n).toFixed(digits)}%`;
  if (n < 0) return `${MINUS}${body}`;
  return sign && n > 0 ? `+${body}` : body;
}

export function num(n: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
