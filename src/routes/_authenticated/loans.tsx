import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { useAppState } from "@/lib/app-state";
import { fmtDayMonYear, fmtDuration, fmtMonDayYear, fmtMonthLongYear, fmtMonthYear } from "@/lib/dates";
import { prepaymentImpact, projectedBalances, weightedRate, yearlySchedule } from "@/lib/finance";
import { LOAN_KIND_LABEL, type ValuedLoan } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { Badge, Btn, Empty, Panel, ProgressBar, SectionTitle, Segmented, Skeleton } from "@/components/wp/ui";
import { MetricStripSkeleton } from "@/components/wp/MetricStripSkeleton";

export const Route = createFileRoute("/_authenticated/loans")({
  validateSearch: (s: Record<string, unknown>): { loan?: string } =>
    typeof s["loan"] === "string" && /^[0-9a-f-]{36}$/.test(s["loan"]) ? { loan: s["loan"] } : {},
  head: () => ({
    meta: [
      { title: "Home Loan & Debt Tracker — WealthPulse" },
      { name: "description", content: "Outstanding principal, EMI split, debt-free date and prepayment impact for every loan." },
      { property: "og:title", content: "Home Loan & Debt Tracker — WealthPulse" },
      { property: "og:description", content: "Outstanding principal, EMI split, debt-free date and prepayment impact for every loan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoansPage,
});

function durationText(months: number) {
  const { y, m } = fmtDuration(months);
  const parts = [];
  if (y) parts.push(`${y} Year${y === 1 ? "" : "s"}`);
  if (m || !y) parts.push(`${m} Month${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function LoansPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { scoped, portfolio, today, isLoading } = usePortfolio();
  const { full, compact } = useMoney();
  const { open, profile, setProfile } = useAppState();

  if (isLoading || !scoped || !portfolio) {
    return (
      <div className="px-4 md:px-6 pt-5 pb-10 space-y-4">
        <MetricStripSkeleton />
        <div className="grid lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-7 h-80" />
          <Skeleton className="lg:col-span-5 h-80" />
        </div>
      </div>
    );
  }

  const loans = scoped.loans;
  const active = loans.find((l) => l.id === search.loan) ?? loans[0];
  const totalBal = loans.reduce((s, l) => s + l.projection.balance, 0);
  const totalEmi = loans.reduce((s, l) => s + (l.projection.balance > 0 ? Number(l.emi) : 0), 0);
  const wRate = weightedRate(loans.map((l) => ({ balance: l.projection.balance, rate: Number(l.rate) })));
  const lastPayoff = loans.reduce<{ date: string | null; months: number }>(
    (acc, l) => (l.projection.payoffDate && (!acc.date || l.projection.payoffDate > acc.date) ? { date: l.projection.payoffDate, months: l.projection.months ?? 0 } : acc),
    { date: null, months: 0 },
  );

  return (
    <div className="px-4 md:px-6 pt-5 pb-10 text-[13px]">
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-line rounded-[6px] bg-panel overflow-hidden lg:divide-x divide-line max-lg:[&>div:nth-child(-n+2)]:border-b max-lg:[&>div:nth-child(odd)]:border-r [&>div]:border-line">
        <div className="px-4 sm:px-5 py-3.5">
          <SectionTitle className="tracking-[0.12em]">Total Liabilities</SectionTitle>
          <div className="n text-[18px] sm:text-[22px] font-semibold mt-1 text-co">{full(totalBal)}</div>
        </div>
        <div className="px-4 sm:px-5 py-3.5">
          <SectionTitle className="tracking-[0.12em]">Weighted Interest</SectionTitle>
          <div className="n text-[18px] sm:text-[22px] font-semibold mt-1 text-hi">{wRate.toFixed(2)}%</div>
        </div>
        <div className="px-4 sm:px-5 py-3.5">
          <SectionTitle className="tracking-[0.12em]">Total Monthly EMI</SectionTitle>
          <div className="n text-[18px] sm:text-[22px] font-semibold mt-1 text-hi">{full(totalEmi)}</div>
        </div>
        <div className="px-4 sm:px-5 py-3.5">
          <SectionTitle className="tracking-[0.12em]">Debt-Free Date</SectionTitle>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="n text-[18px] sm:text-[22px] font-semibold text-em">{lastPayoff.date ? fmtMonthYear(lastPayoff.date) : loans.length ? "—" : "Today"}</span>
            {lastPayoff.date ? <span className="n text-[11px] text-mut">{lastPayoff.months} mo</span> : null}
          </div>
        </div>
      </div>

      {loans.length > 1 || !active ? (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {loans.length > 1 ? (
            <Segmented
              value={active?.id ?? ""}
              onChange={(id) => void navigate({ search: { loan: id }, replace: true })}
              options={loans.map((l) => ({ value: l.id, label: l.name }))}
              className="overflow-x-auto no-scrollbar max-w-full"
            />
          ) : null}
          {active ? (
            <Btn variant="secondary" className="ml-auto" onClick={() => open({ type: "loan" })}>
              + Add loan
            </Btn>
          ) : null}
        </div>
      ) : null}

      {!active ? (
        <Panel className="mt-4">
          <Empty title="No loans on this profile">
            Add a home, vehicle, education or personal loan to see its debt-free date and how prepayments shorten it.
          </Empty>
          <div className="flex flex-wrap justify-center gap-2 pb-8 px-4">
            {(["home", "vehicle", "education", "personal"] as const).map((k) => (
              <Btn key={k} variant="dashed" className="h-10 px-4" onClick={() => open({ type: "loan", kind: k })}>
                + Add {LOAN_KIND_LABEL[k]}
              </Btn>
            ))}
          </div>
        </Panel>
      ) : (
        <LoanDetail loan={active} today={today} full={full} compact={compact} onAdd={() => open({ type: "loan" })} single={loans.length === 1} />
      )}

      <div className="mt-4 border border-line rounded-[6px] bg-panel px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3 sm:gap-6 n flex-wrap">
          <div>
            <div className="font-sans text-[11px] text-mut">Gross {profile === "all" ? "Household" : (portfolio.members.find((m) => m.id === profile)?.name ?? "")} Assets</div>
            <div className="text-[16px] sm:text-[19px] font-semibold mt-1 text-hi">{full(scoped.totals.gross)}</div>
          </div>
          <span className="text-[22px] text-mut">−</span>
          <div>
            <div className="font-sans text-[11px] text-mut">Total Liabilities</div>
            <div className="text-[16px] sm:text-[19px] font-semibold mt-1 text-co">{full(scoped.totals.liabilities)}</div>
          </div>
          <span className="text-[22px] text-mut">=</span>
          <div>
            <div className="font-sans text-[11px] text-em">True Net Worth</div>
            <div className="text-[20px] sm:text-[24px] font-semibold mt-0.5 text-em">{full(scoped.totals.net)}</div>
          </div>
        </div>
        <Segmented
          size="sm"
          surface="ink"
          className="md:ml-auto self-start md:self-auto"
          value={profile}
          onChange={setProfile}
          options={[{ value: "all", label: "Household" }, ...portfolio.members.map((m) => ({ value: m.id, label: m.name }))]}
        />
      </div>
    </div>
  );
}

type Fmt = (n: number, o?: { sign?: boolean; digits?: number; space?: boolean }) => string;

function LoanDetail({ loan, today, full, compact, onAdd, single }: { loan: ValuedLoan; today: string; full: Fmt; compact: Fmt; onAdd: () => void; single: boolean }) {
  const { open } = useAppState();
  const p = loan.projection;
  const original = Number(loan.original_principal);
  const paid = Math.max(0, original - p.balance);
  const splitPct = Number(loan.emi) > 0 ? (p.split.principal / Number(loan.emi)) * 100 : 0;
  const prinShare = p.balance + p.remainingInterest > 0 ? (p.balance / (p.balance + p.remainingInterest)) * 100 : 100;

  const [mode, setMode] = useState<"monthly" | "annual">("monthly");
  const [monthly, setMonthly] = useState(10000);
  const [annual, setAnnual] = useState(100000);
  const extra = mode === "monthly" ? monthly : annual;
  const max = mode === "monthly" ? 25000 : 500000;
  const step = mode === "monthly" ? 1000 : 10000;
  const terms = { outstanding: Number(loan.outstanding), rate: Number(loan.rate), emi: Number(loan.emi), emi_day: loan.emi_day, as_of: loan.as_of };
  const impact = useMemo(
    () => prepaymentImpact(terms, today, mode === "monthly" ? { monthly } : { annual }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loan.outstanding, loan.rate, loan.emi, loan.emi_day, loan.as_of, today, mode, monthly, annual],
  );
  const saved = fmtDuration(impact.monthsSaved);
  const balances = projectedBalances(p.schedule, 5);
  const years = yearlySchedule(p.schedule);
  const [showSchedule, setShowSchedule] = useState(false);
  const prepayments = loan.events.filter((e) => e.kind === "prepayment").slice(0, 3);

  return (
    <>
      <div className="grid lg:grid-cols-12 gap-4 mt-4">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="border border-line rounded-[6px] bg-panel p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-em pulse shrink-0" />
                <span className="font-semibold text-[15px] text-hi truncate">{loan.name}</span>
                {loan.account_ref ? <span className="n text-[11px] text-mut whitespace-nowrap">A/C ••••{loan.account_ref}</span> : null}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-[4px] border border-line text-mut capitalize">{loan.rate_type}</span>
            </div>
            <div className="flex items-end justify-between mt-5 gap-3">
              <div>
                <div className="text-[11px] text-mut">Outstanding balance</div>
                <div className="n text-[28px] sm:text-[34px] font-semibold leading-none mt-1.5 text-hi">{full(p.balance)}</div>
              </div>
              <div className="n text-[12px] text-mut whitespace-nowrap">of {full(original)}</div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-em" style={{ width: `${loan.repaidPct}%` }} />
            </div>
            <div className="flex justify-between n text-[11px] mt-1.5">
              <span className="text-em">{loan.repaidPct.toFixed(1)}% principal repaid</span>
              <span className="text-mut">{full(paid)} paid</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-[6px] overflow-hidden mt-5">
              <div className="bg-ink p-3 sm:p-3.5">
                <div className="text-[11px] text-mut">Pending Principal</div>
                <div className="n text-[14px] sm:text-[17px] font-semibold mt-1 text-hi">{compact(p.balance, { digits: 2 })}</div>
              </div>
              <div className="bg-ink p-3 sm:p-3.5">
                <div className="text-[11px] text-mut">Interest Rate</div>
                <div className="n text-[14px] sm:text-[17px] font-semibold mt-1 text-hi">
                  {Number(loan.rate).toFixed(2)}% <span className="text-[11px] text-mut font-normal">p.a.</span>
                </div>
              </div>
              <div className="bg-ink p-3 sm:p-3.5">
                <div className="text-[11px] text-mut">Monthly EMI</div>
                <div className="n text-[14px] sm:text-[17px] font-semibold mt-1 text-hi">{full(Number(loan.emi))}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-[11px] text-mut gap-2 flex-wrap">
                <span>This month&apos;s split</span>
                <span className="n">
                  <span className="text-em">Principal {full(p.split.principal)}</span> | <span className="text-soft">Interest {full(p.split.interest)}</span>
                </span>
              </div>
              <div className="flex h-1.5 mt-2 rounded-full overflow-hidden">
                <div className="bg-em" style={{ width: `${splitPct}%` }} />
                <div className="flex-1 bg-dim" />
              </div>
            </div>
          </div>

          {p.months === null ? (
            <div className="border border-co/40 rounded-[6px] bg-co/10 p-5">
              <SectionTitle className="text-co tracking-[0.12em]">EMI too low</SectionTitle>
              <div className="text-[16px] font-semibold mt-1.5 text-hi">This EMI doesn't cover the monthly interest, so the balance never reaches zero.</div>
            </div>
          ) : (
            <div className="border border-em/40 rounded-[6px] bg-em/10 p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <SectionTitle className="text-em tracking-[0.12em]">Payoff Milestone</SectionTitle>
                <div className="text-[17px] sm:text-[20px] font-semibold mt-1.5 text-hi">
                  {p.months === 0 ? "Debt free" : `${durationText(p.months)} to Debt Freedom`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-mut">Projected completion</div>
                <div className="n text-[17px] font-semibold text-em mt-1">{p.payoffDate ? fmtMonDayYear(p.payoffDate) : "—"}</div>
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <Btn size="lg" onClick={() => open({ type: "prepay", loanId: loan.id })} disabled={p.balance <= 0}>
              Record Prepayment
            </Btn>
            <Btn size="lg" variant="secondary" className="bg-transparent" onClick={() => open({ type: "loan", loanId: loan.id })}>
              Adjust Loan Terms
            </Btn>
            {single ? (
              <Btn size="lg" variant="ghost" className="sm:ml-auto" onClick={onAdd}>
                + Add loan
              </Btn>
            ) : null}
          </div>

          {prepayments.length > 0 ? (
            <div className="border border-line rounded-[6px] bg-panel">
              <div className="px-4 h-10 flex items-center border-b border-line">
                <SectionTitle>Prepayments recorded</SectionTitle>
              </div>
              <div className="divide-y divide-line">
                {prepayments.map((e) => (
                  <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 n text-[12.5px]">
                    <span className="text-mut">{fmtDayMonYear(e.event_date)}</span>
                    {e.note ? <span className="font-sans text-mut truncate">{e.note}</span> : null}
                    <span className="ml-auto text-em">−{full(Number(e.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="border border-line rounded-[6px] bg-panel p-4 sm:p-5">
            <SectionTitle className="tracking-[0.12em]">Amortization</SectionTitle>
            <div className="grid grid-cols-2 mt-3">
              <div>
                <div className="text-[11px] text-mut">Remaining Principal</div>
                <div className="n text-[19px] font-semibold mt-1 text-hi">{compact(p.balance)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-mut">Remaining Interest</div>
                <div className="n text-[19px] font-semibold mt-1 text-co">{compact(p.remainingInterest)}</div>
              </div>
            </div>
            <div className="flex h-2 mt-3 rounded-full overflow-hidden gap-0.5">
              <div className="bg-soft" style={{ width: `${prinShare}%` }} />
              <div className="flex-1 bg-co/70" />
            </div>
          </div>

          <div className="border border-line rounded-[6px] bg-panel p-4 sm:p-5">
            <div className="flex justify-between items-center gap-2">
              <span className="font-semibold text-hi">Prepayment Impact</span>
              <span className="n text-em font-semibold">
                +{full(extra)}/{mode === "monthly" ? "month" : "year"}
              </span>
            </div>
            <Segmented
              size="sm"
              surface="ink"
              className="mt-3 w-fit"
              value={mode}
              onChange={setMode}
              options={[
                { value: "monthly", label: "Monthly top-up" },
                { value: "annual", label: "Yearly lump sum" },
              ]}
            />
            <input
              type="range"
              className="wp-range mt-4"
              min={0}
              max={max}
              step={step}
              value={extra}
              aria-label="Extra prepayment amount"
              style={{ ["--fill" as string]: `${(extra / max) * 100}%` }}
              onChange={(e) => (mode === "monthly" ? setMonthly(Number(e.target.value)) : setAnnual(Number(e.target.value)))}
            />
            <div className="flex justify-between n text-[11px] text-mut mt-1">
              <span>{full(0)}</span>
              <span>{full(max)}</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-[6px] overflow-hidden mt-4">
              <div className="bg-ink p-3.5">
                <div className="text-[11px] text-mut">Revised payoff</div>
                <div className="n text-[15px] sm:text-[17px] font-semibold mt-1 text-hi">{impact.payoffDate ? fmtMonthLongYear(impact.payoffDate) : "—"}</div>
                <div className="n text-[11px] text-em mt-0.5">
                  {impact.monthsSaved > 0 ? `${saved.y ? `${saved.y}y ` : ""}${saved.m}m sooner` : "No change"}
                </div>
              </div>
              <div className="bg-ink p-3.5">
                <div className="text-[11px] text-mut">Interest Saved</div>
                <div className="n text-[15px] sm:text-[17px] font-semibold mt-1 text-em">{full(impact.interestSaved)}</div>
              </div>
            </div>
          </div>

          <div className="border border-line rounded-[6px] bg-panel p-4 sm:p-5">
            <SectionTitle className="tracking-[0.12em] mb-3">Projected Balance</SectionTitle>
            {balances.length === 0 ? (
              <div className="text-mut text-[12px]">No remaining schedule.</div>
            ) : (
              <div className="n text-[12px] flex flex-col gap-2">
                {balances.map((b, i) => {
                  const last = i === balances.length - 1 && b.balance <= 1;
                  const pct = p.balance > 0 ? (b.balance / p.balance) * 100 : 0;
                  return (
                    <div key={b.year} className="flex items-center gap-3">
                      <span className={cn("w-10", last ? "text-em" : "text-mut")}>{b.year}</span>
                      <div className="flex-1 h-1.5 bg-line rounded-full">
                        <div className="h-full bg-soft rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={cn("w-16 text-right", last ? "text-em" : "text-hi")}>{last ? full(0) : compact(b.balance)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {years.length > 0 ? (
        <div className="mt-4 border border-line rounded-[6px] bg-panel">
          <button
            type="button"
            onClick={() => setShowSchedule((s) => !s)}
            className="w-full px-4 sm:px-5 h-11 flex items-center gap-3 text-left"
            aria-expanded={showSchedule}
          >
            <SectionTitle className="tracking-[0.12em]">Year-by-year schedule</SectionTitle>
            <Badge tone="slate" mono>{years.length} yrs</Badge>
            <ChevronDown className={cn("ml-auto w-4 h-4 text-mut transition-transform", showSchedule && "rotate-180")} />
          </button>
          {showSchedule ? (
            <div className="border-t border-line overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="text-[11px] uppercase tracking-wider text-mut">
                  <tr className="border-b border-line">
                    <th className="text-left font-medium px-4 sm:px-5 py-2">Year</th>
                    <th className="text-right font-medium">Principal</th>
                    <th className="text-right font-medium">Interest</th>
                    <th className="text-right font-medium px-4 sm:px-5">Closing balance</th>
                  </tr>
                </thead>
                <tbody className="n text-[12.5px]">
                  {years.map((y) => (
                    <tr key={y.year} className="border-b border-line/60 last:border-0">
                      <td className="px-4 sm:px-5 py-2 text-mut">{y.year}</td>
                      <td className="text-right text-hi">{full(y.principal + y.extra)}</td>
                      <td className="text-right text-co">{full(y.interest)}</td>
                      <td className={cn("text-right px-4 sm:px-5", y.closing <= 1 ? "text-em" : "text-hi")}>{full(y.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
