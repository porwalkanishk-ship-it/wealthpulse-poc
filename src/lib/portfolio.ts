import { receivableState, type Compounding } from "./receivable";
import type { Tables } from "@/integrations/supabase/types";
import { addMonths, daysBetween, monthsBetween, yearsBetween } from "./dates";
import { fdValue, growMonthly, projectLoan, type LoanProjection } from "./finance";
import { totalUnits, type InstallmentStatus } from "./sip";

export type Profile = Tables<"profiles"> & {
  /** True when the signed-in user may edit this profile (own profile or one they manage). */
  writable: boolean;
  /** True for the signed-in user's own profile. */
  isMe: boolean;
};
/** Extra facts for a per-stock row that comes from `equity_holdings` rather than the `holdings` table. */
export interface EquityMeta {
  positionId: string;
  securityId: string;
  symbol: string;
  exchange: string;
  price: number | null;
  priceDate: string | null;
  stale: boolean;
  corporateAction: boolean;
  avgBuy: number | null;
}
/** Extra facts for a row that comes from an RSU grant (`rsu_grants` plus its vests). */
export interface RsuMeta {
  grantId: string;
  company: string;
  listed: boolean;
  securityId: string | null;
  symbol: string | null;
  grantDate: string;
  totalShares: number;
  withholdingPct: number;
  deliveredShares: number;
  estimatedShares: number;
  unvestedShares: number;
  nextVest: { vest_date: string; shares: number } | null;
  byQuarter: Record<string, number>;
  price: number | null;
  priceDate: string | null;
  stale: boolean;
  manual: boolean;
  dueVests: number;
}
export type ReceivableRepaymentRow = Tables<"receivable_repayments">;
export type Holding = Tables<"holdings"> & { equity?: EquityMeta; rsu?: RsuMeta; repayments?: ReceivableRepaymentRow[] };
export type Installment = Tables<"sip_installments">;
export type Loan = Tables<"loans">;
export type LoanEvent = Tables<"loan_events">;
export type Policy = Tables<"policies">;

export interface RawPortfolio {
  profiles: Profile[];
  holdings: Holding[];
  installments: Installment[];
  loans: Loan[];
  loanEvents: LoanEvent[];
  policies: Policy[];
}

export type Category =
  | "mutual_fund" | "equity" | "rsu" | "epfo" | "ppf" | "nps" | "fd" | "life_policy"
  | "real_estate" | "gold" | "cash" | "vehicle" | "private_equity" | "receivable";

export const CATEGORY_LABEL: Record<Category, string> = {
  mutual_fund: "Mutual Funds",
  equity: "Equities / Demat",
  rsu: "RSUs",
  epfo: "EPFO",
  ppf: "PPF",
  nps: "NPS",
  fd: "Fixed Deposits",
  life_policy: "Life Policies",
  real_estate: "Real Estate",
  gold: "Gold & SGBs",
  cash: "Cash & Bank",
  vehicle: "Vehicles",
  private_equity: "Private Equity",
  receivable: "Private Receivables",
};

export const FINANCIAL: Category[] = ["mutual_fund", "equity", "rsu", "epfo", "fd", "ppf", "nps", "life_policy"];
export const MARKET: Category[] = ["mutual_fund", "equity", "rsu"];
export const GUARANTEED: Category[] = ["epfo", "ppf", "nps", "fd", "life_policy"];
export const TANGIBLE: Category[] = ["real_estate", "gold", "cash", "vehicle", "private_equity", "receivable"];

export const LOAN_KIND_LABEL: Record<string, string> = {
  home: "Home Loan",
  vehicle: "Vehicle Loan",
  education: "Education Loan",
  personal: "Personal Loan",
  other: "Other Liability",
};

export interface ValuedHolding extends Holding {
  cat: Category;
  value: number;
  dayChange: number;
  totalUnits: number;
  installments: Installment[];
  /** For real estate linked to a loan: market value minus loan balance. */
  netEquity: number | null;
  unvestedValue: number;
  maturityValue: number | null;
  /** Mutual fund with no matching AMFI scheme, so its NAV does not update. */
  navMissing: boolean;
  /** Mutual fund added by hand that no CAS has covered yet. */
  unverified: boolean;
  /** Units added from projected SIP instalments after the last statement. */
  estimatedUnits: number;
}

export interface ValuedLoan extends Loan {
  projection: LoanProjection;
  events: LoanEvent[];
  repaidPct: number;
}

export interface Totals {
  gross: number;
  liabilities: number;
  net: number;
  sipIn: number;
  emiOut: number;
  dayChange: number;
}

const n = (v: number | null | undefined) => Number(v ?? 0);

export function valueHolding(h: Holding, installments: Installment[], today: string, fx: number) {
  const cat = h.category as Category;
  let value = n(h.amount);
  let dayChange = 0;
  let units = 0;
  let unvestedValue = 0;
  let maturityValue: number | null = null;
  const toInr = (v: number) => (h.price_currency === "USD" ? v * fx : v);

  switch (cat) {
    case "mutual_fund": {
      units = totalUnits(n(h.units), installments as { status: InstallmentStatus; units: number }[]);
      // No matching AMFI scheme: fall back to the NAV printed on the last statement instead of showing ₹0.
      value = units * n(h.nav ?? h.statement_nav);
      if (h.prev_nav && h.nav) dayChange = units * (n(h.nav) - n(h.prev_nav));
      break;
    }
    case "equity":
      if (h.quantity && h.unit_price) value = toInr(n(h.quantity) * n(h.unit_price));
      if (h.quantity && h.unit_price && h.prev_nav) dayChange = toInr(n(h.quantity) * (n(h.unit_price) - n(h.prev_nav)));
      break;
    case "rsu":
      value = toInr(n(h.quantity) * n(h.unit_price));
      unvestedValue = toInr(n(h.unvested_quantity) * n(h.unit_price));
      break;
    case "epfo":
    case "nps":
      value = growMonthly(n(h.amount), n(h.rate), n(h.monthly_contribution), monthsBetween(h.as_of, today));
      break;
    case "ppf": {
      // Interest is credited once a year: compound whole years, simple interest for the running year.
      const years = Math.max(0, yearsBetween(h.as_of, today));
      const whole = Math.floor(years);
      const r = n(h.rate) / 100;
      const months = monthsBetween(h.as_of, today);
      value = n(h.amount) * (1 + r) ** whole * (1 + r * (years - whole)) + n(h.monthly_contribution) * months;
      break;
    }
    case "fd": {
      const start = h.start_date ?? h.as_of;
      const end = h.maturity_date && h.maturity_date < today ? h.maturity_date : today;
      value = fdValue(n(h.amount), n(h.rate), yearsBetween(start, end));
      if (h.maturity_date) maturityValue = fdValue(n(h.amount), n(h.rate), yearsBetween(start, h.maturity_date));
      break;
    }
    case "vehicle":
      value = n(h.amount) * (1 - n(h.rate) / 100) ** Math.max(0, yearsBetween(h.as_of, today));
      break;
    case "receivable": {
      const st = receivableState(
        { principal: n(h.amount), rate: n(h.rate), lendDate: h.as_of, interestType: h.interest_type === "compound" ? "compound" : "simple", compounding: h.compounding_frequency as Compounding | null },
        (h.repayments ?? []).map((r) => ({ repayment_date: r.repayment_date, amount: n(r.amount) })),
        today,
      );
      value = st.value;
      break;
    }
    default:
      break;
  }
  return { cat, value, dayChange, units, unvestedValue, maturityValue };
}

export interface Portfolio {
  profiles: Profile[];
  holdings: ValuedHolding[];
  loans: ValuedLoan[];
  policies: Policy[];
  totals: Totals;
  totalsByProfile: Record<string, Totals>;
  isPrivate: (x: { is_hidden: boolean; owner_profile_id: string | null }) => boolean;
  /** Net value of your own items that are private and so left out of the household view. */
  privateNet: number;
}

export function buildPortfolio(raw: RawPortfolio, today: string, fx: number): Portfolio {
  const instByHolding = new Map<string, Installment[]>();
  for (const i of raw.installments) {
    const list = instByHolding.get(i.holding_id) ?? [];
    list.push(i);
    instByHolding.set(i.holding_id, list);
  }
  for (const list of instByHolding.values()) list.sort((a, b) => (a.due_date < b.due_date ? 1 : -1));

  const loans: ValuedLoan[] = raw.loans.map((l) => {
    const projection = projectLoan(
      { outstanding: n(l.outstanding), rate: n(l.rate), emi: n(l.emi), emi_day: l.emi_day, as_of: l.as_of },
      today,
    );
    const original = n(l.original_principal);
    return {
      ...l,
      projection,
      events: raw.loanEvents.filter((e) => e.loan_id === l.id).sort((a, b) => (a.event_date < b.event_date ? 1 : -1)),
      repaidPct: original > 0 ? Math.max(0, Math.min(100, ((original - projection.balance) / original) * 100)) : 0,
    };
  });
  const loanById = new Map(loans.map((l) => [l.id, l]));

  const holdings: ValuedHolding[] = raw.holdings.map((h) => {
    const installments = instByHolding.get(h.id) ?? [];
    const v = valueHolding(h, installments, today, fx);
    const linked = h.linked_loan_id ? loanById.get(h.linked_loan_id) : undefined;
    return {
      ...h,
      cat: v.cat,
      value: v.value,
      dayChange: v.dayChange,
      totalUnits: v.units,
      installments,
      netEquity: linked ? v.value - linked.projection.balance : null,
      unvestedValue: v.unvestedValue,
      maturityValue: v.maturityValue,
      navMissing: v.cat === "mutual_fund" && !h.scheme_code,
      unverified: v.cat === "mutual_fund" && !h.cas_verified_at,
      estimatedUnits: v.cat === "mutual_fund" ? Math.max(0, v.units - n(h.units)) : 0,
    };
  });

  const profileById = new Map(raw.profiles.map((p) => [p.id, p]));
  const isPrivate = (x: { is_hidden: boolean; owner_profile_id: string | null }) =>
    x.is_hidden || !!(x.owner_profile_id && profileById.get(x.owner_profile_id)?.hide_everything);
  /** Household totals leave out anything marked private; a single person's totals include it. */
  const totalsFor = (profileId: string | null): Totals => {
    const hs = holdings.filter((h) => (profileId ? h.owner_profile_id === profileId : !isPrivate(h)));
    const ls = loans.filter((l) => (profileId ? l.owner_profile_id === profileId : !isPrivate(l)));
    const gross = hs.reduce((s, h) => s + h.value, 0);
    const liabilities = ls.reduce((s, l) => s + l.projection.balance, 0);
    return {
      gross,
      liabilities,
      net: gross - liabilities,
      sipIn: hs.reduce((s, h) => (h.cat === "mutual_fund" && h.sip_active ? s + n(h.sip_amount) : s), 0),
      emiOut: ls.reduce((s, l) => (l.projection.balance > 0 ? s + n(l.emi) : s), 0),
      dayChange: hs.reduce((s, h) => s + h.dayChange, 0),
    };
  };

  const totalsByProfile: Record<string, Totals> = {};
  for (const m of raw.profiles) totalsByProfile[m.id] = totalsFor(m.id);

  return {
    profiles: [...raw.profiles].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.display_name.localeCompare(b.display_name)),
    holdings,
    loans,
    policies: raw.policies,
    totals: totalsFor(null),
    totalsByProfile,
    privateNet:
      holdings.filter((h) => isPrivate(h) && profileById.get(h.owner_profile_id ?? "")?.writable).reduce((s, h) => s + h.value, 0) -
      loans.filter((l) => isPrivate(l) && profileById.get(l.owner_profile_id ?? "")?.writable).reduce((s, l) => s + l.projection.balance, 0),
    isPrivate,
  };
}

/** Narrow a portfolio to one household member ("all" keeps everyone). */
export function scopePortfolio(p: Portfolio, profile: string) {
  if (profile === "all")
    return {
      holdings: p.holdings.filter((h) => !p.isPrivate(h)),
      loans: p.loans.filter((l) => !p.isPrivate(l)),
      policies: p.policies.filter((x) => !p.isPrivate(x)),
      totals: p.totals,
    };
  return {
    holdings: p.holdings.filter((h) => h.owner_profile_id === profile),
    loans: p.loans.filter((l) => l.owner_profile_id === profile),
    policies: p.policies.filter((x) => x.owner_profile_id === profile),
    totals: p.totalsByProfile[profile] ?? p.totals,
  };
}

export type RenewalKind = "policy" | "fd" | "premium" | "maturity";

export interface RenewalItem {
  key: string;
  kind: RenewalKind;
  title: string;
  detail: string;
  date: string;
  days: number;
  amount: number;
  profileId: string;
  sourceId: string;
  /** True for money coming in (maturities). */
  inflow: boolean;
}

export function renewals(holdings: ValuedHolding[], policies: Policy[], today: string): RenewalItem[] {
  const items: RenewalItem[] = [];
  for (const p of policies) {
    items.push({
      key: `p-${p.id}`,
      kind: "policy",
      title: p.name,
      detail: p.kind === "term" ? "Term premium due" : p.kind === "health" ? "Health renewal" : "Premium due",
      date: p.next_due,
      days: daysBetween(today, p.next_due),
      amount: n(p.premium),
      profileId: p.owner_profile_id ?? "",
      sourceId: p.id,
      inflow: false,
    });
  }
  for (const h of holdings) {
    if (h.cat === "fd" && h.maturity_date) {
      items.push({
        key: `fd-${h.id}`,
        kind: "fd",
        title: `${h.name} maturity`,
        detail: `${n(h.rate).toFixed(2)}% p.a.`,
        date: h.maturity_date,
        days: daysBetween(today, h.maturity_date),
        amount: h.maturityValue ?? h.value,
        profileId: h.owner_profile_id ?? "",
        sourceId: h.id,
        inflow: true,
      });
    }
    if (h.cat === "life_policy") {
      if (h.next_due) {
        items.push({
          key: `lp-${h.id}`,
          kind: "premium",
          title: h.name,
          detail: "Premium due",
          date: h.next_due,
          days: daysBetween(today, h.next_due),
          amount: n(h.premium),
          profileId: h.owner_profile_id ?? "",
          sourceId: h.id,
          inflow: false,
        });
      }
      if (h.maturity_date) {
        items.push({
          key: `lm-${h.id}`,
          kind: "maturity",
          title: h.name,
          detail: "Policy maturity",
          date: h.maturity_date,
          days: daysBetween(today, h.maturity_date),
          amount: h.value,
          profileId: h.owner_profile_id ?? "",
          sourceId: h.id,
          inflow: true,
        });
      }
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function advanceDue(date: string, frequency: string) {
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "half_yearly" ? 6 : 12;
  return addMonths(date, step);
}
