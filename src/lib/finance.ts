import { addMonths, parseISO, toISO, daysInMonth } from "./dates";

export interface ScheduleRow {
  /** Payment date YYYY-MM-DD */
  date: string;
  opening: number;
  interest: number;
  principal: number;
  extra: number;
  closing: number;
}

export interface AmortizeOptions {
  /** First EMI date (YYYY-MM-DD). */
  firstDate: string;
  extraMonthly?: number;
  /** Lump-sum paid once a year, on the anniversary month of the first EMI. */
  annualLump?: number;
  maxMonths?: number;
}

export function monthlyRate(annualPct: number) {
  return annualPct / 12 / 100;
}

/** Interest and principal split of one EMI on the given balance. */
export function emiSplit(balance: number, annualPct: number, emi: number) {
  const interest = balance * monthlyRate(annualPct);
  const principal = Math.max(0, Math.min(balance, emi - interest));
  return { interest, principal };
}

/** Closed-form months to repay a diminishing-balance loan; null if the EMI never covers interest. */
export function monthsToPayoff(balance: number, annualPct: number, emi: number): number | null {
  if (balance <= 0) return 0;
  const r = monthlyRate(annualPct);
  if (r === 0) return Math.ceil(balance / emi);
  if (emi <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (r * balance) / emi) / Math.log(1 + r));
}

/** EMI needed to repay a balance over n months. */
export function emiFor(balance: number, annualPct: number, months: number) {
  const r = monthlyRate(annualPct);
  if (months <= 0) return balance;
  if (r === 0) return balance / months;
  return (balance * r * (1 + r) ** months) / ((1 + r) ** months - 1);
}

/** Month-by-month diminishing-balance schedule until the balance reaches zero. */
export function amortize(balance: number, annualPct: number, emi: number, opts: AmortizeOptions): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const r = monthlyRate(annualPct);
  const max = opts.maxMonths ?? 720;
  const firstMonth = parseISO(opts.firstDate).m;
  let bal = balance;
  if (emi <= bal * r && !(opts.extraMonthly || opts.annualLump)) return rows;
  for (let i = 0; i < max && bal > 0.5; i++) {
    const date = addMonths(opts.firstDate, i);
    const interest = bal * r;
    const principal = Math.min(bal, Math.max(0, emi - interest));
    let extra = opts.extraMonthly ?? 0;
    if (opts.annualLump && i > 0 && parseISO(date).m === firstMonth) extra += opts.annualLump;
    extra = Math.min(extra, bal - principal);
    const closing = bal - principal - extra;
    rows.push({ date, opening: bal, interest, principal, extra, closing: Math.max(0, closing) });
    bal = closing;
  }
  return rows;
}

export function totalInterest(rows: ScheduleRow[]) {
  return rows.reduce((s, r) => s + r.interest, 0);
}

/** Next EMI date strictly after `today` for an EMI on `emiDay`. */
export function nextEmiDate(today: string, emiDay: number) {
  const { y, m, d } = parseISO(today);
  const thisMonth = toISO(y, m, Math.min(emiDay, daysInMonth(y, m)));
  if (d < emiDay) return thisMonth;
  return addMonths(thisMonth, 1, emiDay);
}

export interface LoanTerms {
  outstanding: number;
  rate: number;
  emi: number;
  emi_day: number;
  as_of: string;
}

/** Roll a loan balance forward from its as-of date, paying each EMI due up to `today`. */
export function balanceOn(loan: LoanTerms, today: string) {
  let bal = Number(loan.outstanding);
  let date = nextEmiDate(loan.as_of, loan.emi_day);
  let guard = 0;
  while (date <= today && bal > 0 && guard < 720) {
    const { principal } = emiSplit(bal, Number(loan.rate), Number(loan.emi));
    bal -= principal;
    date = addMonths(date, 1, loan.emi_day);
    guard++;
  }
  return Math.max(0, bal);
}

export interface LoanProjection {
  balance: number;
  months: number | null;
  payoffDate: string | null;
  remainingInterest: number;
  split: { interest: number; principal: number };
  schedule: ScheduleRow[];
}

export function projectLoan(loan: LoanTerms, today: string): LoanProjection {
  const balance = balanceOn(loan, today);
  const firstDate = nextEmiDate(today, loan.emi_day);
  const schedule = amortize(balance, Number(loan.rate), Number(loan.emi), { firstDate });
  const months = schedule.length > 0 ? schedule.length : balance <= 0 ? 0 : null;
  const last = schedule[schedule.length - 1];
  return {
    balance,
    months,
    payoffDate: last ? last.date : balance <= 0 ? today : null,
    remainingInterest: totalInterest(schedule),
    split: emiSplit(balance, Number(loan.rate), Number(loan.emi)),
    schedule,
  };
}

export interface PrepaymentImpact {
  months: number;
  monthsSaved: number;
  interestSaved: number;
  payoffDate: string | null;
}

export function prepaymentImpact(
  loan: LoanTerms,
  today: string,
  extra: { monthly?: number; annual?: number },
): PrepaymentImpact {
  const base = projectLoan(loan, today);
  const firstDate = nextEmiDate(today, loan.emi_day);
  const opts: AmortizeOptions = { firstDate };
  if (extra.monthly) opts.extraMonthly = extra.monthly;
  if (extra.annual) opts.annualLump = extra.annual;
  const rows = amortize(base.balance, Number(loan.rate), Number(loan.emi), opts);
  const last = rows[rows.length - 1];
  return {
    months: rows.length,
    monthsSaved: Math.max(0, base.schedule.length - rows.length),
    interestSaved: Math.max(0, base.remainingInterest - totalInterest(rows)),
    payoffDate: last ? last.date : null,
  };
}

export interface YearRow {
  year: number;
  principal: number;
  interest: number;
  extra: number;
  closing: number;
}

export function yearlySchedule(rows: ScheduleRow[]): YearRow[] {
  const map = new Map<number, YearRow>();
  for (const r of rows) {
    const year = parseISO(r.date).y;
    const row = map.get(year) ?? { year, principal: 0, interest: 0, extra: 0, closing: 0 };
    row.principal += r.principal;
    row.interest += r.interest;
    row.extra += r.extra;
    row.closing = r.closing;
    map.set(year, row);
  }
  return [...map.values()];
}

/** Up to `count` evenly spread year-end balances ending with the payoff year. */
export function projectedBalances(rows: ScheduleRow[], count = 5) {
  const years = yearlySchedule(rows);
  if (years.length <= count) return years.map((y) => ({ year: y.year, balance: y.closing }));
  const picks: number[] = [];
  for (let i = 0; i < count; i++) picks.push(Math.round((i * (years.length - 1)) / (count - 1)));
  return [...new Set(picks)].map((i) => ({ year: years[i]!.year, balance: years[i]!.closing }));
}

/** Weighted average interest rate across loans, weighted by balance. */
export function weightedRate(items: { balance: number; rate: number }[]) {
  const total = items.reduce((s, i) => s + i.balance, 0);
  if (total <= 0) return 0;
  return items.reduce((s, i) => s + i.balance * i.rate, 0) / total;
}

/** Compound growth with an optional monthly contribution (end of month). */
export function growMonthly(amount: number, annualPct: number, monthlyContribution: number, months: number) {
  const r = monthlyRate(annualPct);
  if (months <= 0) return amount;
  if (r === 0) return amount + monthlyContribution * months;
  const f = (1 + r) ** months;
  return amount * f + monthlyContribution * ((f - 1) / r);
}

/** FD value with quarterly compounding. */
export function fdValue(principal: number, annualPct: number, years: number) {
  return principal * (1 + annualPct / 400) ** (4 * Math.max(0, years));
}
