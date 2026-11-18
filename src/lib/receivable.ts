/** Money lent: principal plus accrued interest, with repayments applied to interest first, then principal. */
import { yearsBetween } from "./dates";

export type InterestType = "simple" | "compound";
export type Compounding = "monthly" | "quarterly" | "annual";
export const PERIODS_PER_YEAR: Record<Compounding, number> = { monthly: 12, quarterly: 4, annual: 1 };

export interface ReceivableTerms {
  principal: number;
  /** Annual rate in percent. */
  rate: number;
  lendDate: string;
  interestType: InterestType;
  compounding?: Compounding | null;
}
export interface Repayment {
  repayment_date: string;
  amount: number;
}
export interface ReceivableState {
  principal: number;
  interest: number;
  /** Total value owed today: principal plus unpaid interest. */
  value: number;
  /** Money received so far that went to interest and to principal. */
  paidInterest: number;
  paidPrincipal: number;
  /** Repayments dated before the lend date or after today are ignored. */
  ignored: number;
}

/** Interest added over `years` on `principal` with `interest` already accrued and unpaid. */
function grow(principal: number, interest: number, rate: number, years: number, t: ReceivableTerms): number {
  if (years <= 0 || rate <= 0 || principal + interest <= 0) return interest;
  if (t.interestType === "compound") {
    const n = PERIODS_PER_YEAR[t.compounding ?? "annual"];
    const factor = (1 + rate / 100 / n) ** (n * years);
    return (principal + interest) * factor - principal;
  }
  return interest + principal * (rate / 100) * years;
}

export function receivableState(terms: ReceivableTerms, repayments: Repayment[], today: string): ReceivableState {
  let principal = terms.principal;
  let interest = 0;
  let paidInterest = 0;
  let paidPrincipal = 0;
  let ignored = 0;
  let from = terms.lendDate;
  const sorted = [...repayments].sort((a, b) => a.repayment_date.localeCompare(b.repayment_date));
  for (const r of sorted) {
    if (r.repayment_date < terms.lendDate || r.repayment_date > today) {
      ignored++;
      continue;
    }
    interest = grow(principal, interest, terms.rate, yearsBetween(from, r.repayment_date), terms);
    from = r.repayment_date;
    const toInterest = Math.min(r.amount, interest);
    interest -= toInterest;
    paidInterest += toInterest;
    const toPrincipal = Math.min(r.amount - toInterest, principal);
    principal -= toPrincipal;
    paidPrincipal += toPrincipal;
  }
  interest = grow(principal, interest, terms.rate, yearsBetween(from, today), terms);
  return { principal, interest, value: principal + interest, paidInterest, paidPrincipal, ignored };
}
