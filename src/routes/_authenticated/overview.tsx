import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { useAppState } from "@/lib/app-state";
import { CATEGORY_LABEL, FINANCIAL, renewals, type Category, type ValuedHolding, type ValuedLoan } from "@/lib/portfolio";
import { fmtMonthYear } from "@/lib/dates";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, Badge, Btn, Empty, LiveDot, Panel, PanelHeader, ProgressBar, SectionTitle, Skeleton } from "@/components/wp/ui";
import { RenewalDateBadge } from "@/components/wp/RenewalBadge";
import { MetricStripSkeleton } from "@/components/wp/MetricStripSkeleton";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title: "Overview — WealthPulse Terminal" },
      { name: "description", content: "True net worth, gross assets, liabilities and monthly cashflow for your household." },
      { property: "og:title", content: "Overview — WealthPulse Terminal" },
      { property: "og:description", content: "True net worth, gross assets, liabilities and monthly cashflow for your household." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { scoped, portfolio, today, isLoading, error, refetch } = usePortfolio();
  const { full, compact } = useMoney();
  const { open, profile } = useAppState();

  if (error) {
    return (
      <div className="px-4 md:px-6 pt-5">
        <Panel>
          <Empty title="Couldn't load your portfolio" action={<Btn onClick={() => void refetch()}>Try again</Btn>}>
            Check your connection and try again.
          </Empty>
        </Panel>
      </div>
    );
  }

  if (isLoading || !scoped) {
    return (
      <div className="px-4 md:px-6 pt-5 pb-16 space-y-5">
        <MetricStripSkeleton />
        <div className="grid lg:grid-cols-2 gap-5">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const { holdings, loans, policies, totals } = scoped;
  const debtToAsset = totals.gross > 0 ? (totals.liabilities / totals.gross) * 100 : 0;
  const dta = debtToAsset < 30 ? { label: "Healthy", tone: "em" as const } : debtToAsset < 50 ? { label: "Moderate", tone: "amber" as const } : { label: "High", tone: "co" as const };
  const upcoming = renewals(holdings, policies, today).filter((r) => r.days >= -30).slice(0, 3);

  return (
    <div className="px-4 md:px-6 pt-5 pb-16 space-y-5">
      {profile === "all" && portfolio && Math.abs(portfolio.privateNet) > 0.5 ? (
        <p className="text-[12px] text-mut">Household view excludes {full(portfolio.privateNet)} you've marked private. You can see it on your own profile.</p>
      ) : null}
      {/* Metric strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 border border-line rounded-[6px] bg-panel overflow-hidden [&>div]:border-line max-lg:[&>div:nth-child(-n+2)]:border-b lg:divide-x divide-line">
        <div className="p-4 max-lg:border-r">
          <SectionTitle>Gross Assets</SectionTitle>
          <div className="n text-[18px] sm:text-[22px] font-semibold text-hi mt-2">{full(totals.gross)}</div>
        </div>
        <div className="p-4">
          <SectionTitle>Total Liabilities</SectionTitle>
          <div className="n text-[18px] sm:text-[22px] font-semibold text-co mt-2">{full(-totals.liabilities)}</div>
        </div>
        <div className="p-4 bg-em/10 max-lg:border-r">
          <SectionTitle className="text-em flex items-center gap-2">
            <LiveDot pulse /> True Net Worth
          </SectionTitle>
          <div className="n text-[22px] sm:text-[30px] leading-none font-semibold text-hi mt-2">{full(totals.net)}</div>
        </div>
        <div className="p-4">
          <SectionTitle>Monthly Cashflow</SectionTitle>
          <div className="flex gap-5 mt-2 n">
            <div>
              <div className="text-mut text-[11px]">SIP in</div>
              <div className="text-em text-[15px] sm:text-[16px] font-semibold">{full(totals.sipIn)}</div>
            </div>
            <div>
              <div className="text-mut text-[11px]">EMI out</div>
              <div className="text-co text-[15px] sm:text-[16px] font-semibold">{full(totals.emiOut)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <FinancialCard holdings={holdings} compact={compact} />
        <TangibleCard holdings={holdings} full={full} />
      </div>

      {/* Liabilities */}
      <Panel>
        <PanelHeader title="Liabilities & Debt">
          <span className="ml-auto flex items-center gap-2">
            <span className="text-mut text-[11px] uppercase tracking-wider hidden sm:inline">Debt-to-Asset</span>
            <span className={cn("n font-semibold", dta.tone === "em" ? "text-em" : dta.tone === "co" ? "text-co" : "text-amber")}>{debtToAsset.toFixed(1)}%</span>
            <Badge tone={dta.tone}>{dta.label}</Badge>
          </span>
        </PanelHeader>
        <div className="p-4 grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            {loans.length === 0 ? (
              <div className="rounded-[4px] bg-ink border border-line h-full min-h-[150px] grid place-items-center">
                <Empty title="No liabilities on this profile">Debt-free. Add a loan when you take one so it's deducted from net worth.</Empty>
              </div>
            ) : (
              loans.map((l) => <LoanTile key={l.id} loan={l} full={full} />)
            )}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-1 md:flex md:flex-col gap-2">
            <Btn variant="dashed" className="flex-1 min-h-11 h-auto py-2 whitespace-normal" onClick={() => open({ type: "loan", kind: "vehicle" })}>+ Add Vehicle Loan</Btn>
            <Btn variant="dashed" className="flex-1 min-h-11 h-auto py-2 whitespace-normal" onClick={() => open({ type: "loan", kind: "education" })}>+ Add Education Loan</Btn>
            <Btn variant="dashed" className="flex-1 min-h-11 h-auto py-2 whitespace-normal" onClick={() => open({ type: "loan", kind: "other" })}>+ Add Other Liability</Btn>
          </div>
        </div>
      </Panel>

      {/* Protection & renewals strip */}
      <Panel className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
        {upcoming.length === 0 ? (
          <div className="sm:col-span-3">
            <Empty title="No renewals or maturities coming up" action={<Btn variant="secondary" onClick={() => open({ type: "policy" })}>Add policy</Btn>} />
          </div>
        ) : (
          upcoming.map((r) => (
            <Link key={r.key} to="/renewals" className="p-4 flex items-center gap-3 hover:bg-raised/30 min-w-0">
              <div className="min-w-0">
                <SectionTitle className="tracking-wider truncate">{r.title}</SectionTitle>
                <div className="n text-hi mt-1 truncate">{policyLine(r, policies, full, compact)}</div>
              </div>
              <span className="ml-auto">
                <RenewalDateBadge item={r} today={today} />
              </span>
            </Link>
          ))
        )}
      </Panel>
    </div>
  );
}

type Fmt = (n: number, o?: { sign?: boolean; digits?: number; space?: boolean }) => string;

function policyLine(r: ReturnType<typeof renewals>[number], policies: { id: string; kind: string; cover: number }[], full: Fmt, compact: Fmt) {
  if (r.kind === "policy") {
    const p = policies.find((x) => x.id === r.sourceId);
    if (p) return p.kind === "health" ? `${compact(Number(p.cover), { digits: 0 })} floater` : `${compact(Number(p.cover), { space: true, digits: 0 })} cover`;
  }
  return full(r.amount);
}

const ROW_HASH: Partial<Record<Category, string>> = { mutual_fund: "market", equity: "market", rsu: "market" };

function FinancialCard({ holdings, compact }: { holdings: ValuedHolding[]; compact: Fmt }) {
  const { open } = useAppState();
  const rows = FINANCIAL.map((cat) => {
    const list = holdings.filter((h) => h.cat === cat);
    return { cat, list, value: list.reduce((s, h) => s + h.value, 0) };
  }).filter((r) => r.list.length > 0);
  return (
    <Panel>
      <PanelHeader title="Financial & Market Assets">
        <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => open({ type: "asset", category: "mutual_fund" })}>
          + Add
        </Btn>
      </PanelHeader>
      <div className="p-4">
        {rows.length === 0 ? (
          <Empty title="No financial assets yet" action={<Btn onClick={() => open({ type: "cas" })}>Upload CAS</Btn>}>
            Upload a CAS statement to bring in your mutual funds, or add an asset by hand.
          </Empty>
        ) : (
          <div className="divide-y divide-line -my-2">
            {rows.map((r) => (
              <Link
                key={r.cat}
                to="/holdings"
                hash={ROW_HASH[r.cat] ?? "guaranteed"}
                className="flex items-center py-2.5 hover:text-hi group"
              >
                <span>{r.cat === "life_policy" ? "Life Policies" : CATEGORY_LABEL[r.cat]}</span>
                {r.cat === "mutual_fund" ? (
                  <span className="ml-3 flex items-center gap-1.5 text-[11px] text-em n">
                    <LiveDot /> AMFI live
                  </span>
                ) : r.cat === "rsu" ? (
                  <span className="ml-3 n text-[11px] text-mut">vested</span>
                ) : r.cat === "life_policy" ? (
                  <span className="ml-3 n text-[11px] text-mut truncate">{r.list.map((h) => h.name.split(" ")[0]).join(" · ")}</span>
                ) : null}
                <span className="ml-auto n text-hi">{compact(r.value)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function TangibleCard({ holdings, full }: { holdings: ValuedHolding[]; full: Fmt }) {
  const { open } = useAppState();
  const realEstate = holdings.filter((h) => h.cat === "real_estate");
  const gold = holdings.filter((h) => h.cat === "gold");
  const cash = holdings.filter((h) => h.cat === "cash");
  const vehicles = holdings.filter((h) => h.cat === "vehicle");
  const pe = holdings.filter((h) => h.cat === "private_equity");
  const recv = holdings.filter((h) => h.cat === "receivable");
  const sum = (l: ValuedHolding[]) => l.reduce((s, h) => s + h.value, 0);
  const empty = realEstate.length + gold.length + cash.length + vehicles.length + pe.length + recv.length === 0;

  const Row = ({ id, title, sub, right, rightSub, emph }: { id: string; title: string; sub?: string; right: string; rightSub?: string; emph?: boolean }) => (
    <button type="button" onClick={() => open({ type: "asset", holdingId: id })} className="w-full text-left flex items-center py-2.5 hover:text-hi gap-3">
      <div className="min-w-0">
        <div className="truncate">{title}</div>
        {sub ? <div className="text-[11.5px] text-mut truncate">{sub}</div> : null}
      </div>
      <div className="ml-auto text-right shrink-0">
        <div className={cn("n", emph ? "text-em font-semibold" : "text-hi")}>{right}</div>
        {rightSub ? <div className="text-[11px] text-mut">{rightSub}</div> : null}
      </div>
    </button>
  );

  return (
    <Panel>
      <PanelHeader title="Tangible & Known Assets">
        <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => open({ type: "asset", category: "real_estate" })}>
          + Add
        </Btn>
      </PanelHeader>
      <div className="p-4">
        {empty ? (
          <Empty title="No tangible assets yet" action={<Btn onClick={() => open({ type: "asset", category: "real_estate" })}>Add asset</Btn>}>
            Add property, gold, bank balances, vehicles or money you've lent.
          </Empty>
        ) : (
          <div className="divide-y divide-line -my-2">
            {realEstate.map((h) =>
              h.netEquity !== null ? (
                <Row key={h.id} id={h.id} title={h.name} sub={`Market est. ${full(h.value)}`} right={full(h.netEquity)} rightSub="net equity" emph />
              ) : (
                <Row key={h.id} id={h.id} title={h.name} sub={h.subtitle ?? "Market estimate"} right={full(h.value)} />
              ),
            )}
            {gold.length > 0 ? <Row id={gold[0]!.id} title="Gold & SGBs" sub={gold.map((g) => g.name.replace("Sovereign Gold Bonds", "SGB").replace(" physical gold", " physical")).join(" + ")} right={full(sum(gold))} /> : null}
            {cash.length > 0 ? <Row id={cash[0]!.id} title="Cash & Bank" sub={cash.map((c) => c.name).join(" + ")} right={full(sum(cash))} /> : null}
            {vehicles.map((h) => (
              <Row key={h.id} id={h.id} title={h.name} sub={h.subtitle ?? "Resale / IDV"} right={full(h.value)} />
            ))}
            {pe.map((h) => (
              <Row key={h.id} id={h.id} title={h.name} sub={h.subtitle ?? "Private equity"} right={full(h.value)} />
            ))}
            {recv.map((h) => (
              <button key={h.id} type="button" onClick={() => open({ type: "asset", holdingId: h.id })} className="w-full text-left flex items-center py-2.5 hover:text-hi">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar>{initials(h.name)}</Avatar>
                  <div className="min-w-0">
                    <div className="truncate">{h.name}</div>
                    <div className="text-[11.5px] text-mut">{h.subtitle ?? "Private receivable"}</div>
                  </div>
                </div>
                <span className="ml-auto n text-hi">{full(h.value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function LoanTile({ loan, full }: { loan: ValuedLoan; full: Fmt }) {
  const p = loan.projection;
  return (
    <Link to="/loans" search={{ loan: loan.id }} className="block rounded-[4px] bg-ink border border-line p-4 hover:border-em/40">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-hi truncate">{loan.name}</span>
        <span className="ml-auto n text-[11px] text-mut whitespace-nowrap">
          Payoff <span className="text-hi">{p.payoffDate ? fmtMonthYear(p.payoffDate) : "—"}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 mt-3 n gap-2">
        <div>
          <div className="text-mut text-[11px] font-sans">Pending</div>
          <div className="text-hi text-[15px] sm:text-[18px] font-semibold">{full(p.balance)}</div>
        </div>
        <div>
          <div className="text-mut text-[11px] font-sans">Rate</div>
          <div className="text-hi text-[15px] sm:text-[18px]">{Number(loan.rate)}%</div>
        </div>
        <div>
          <div className="text-mut text-[11px] font-sans">EMI</div>
          <div className="text-hi text-[15px] sm:text-[18px]">{full(Number(loan.emi))}</div>
        </div>
      </div>
      <ProgressBar pct={loan.repaidPct} className="mt-4" />
      <div className="n text-[11px] text-mut mt-1.5">
        <span className="text-em">{loan.repaidPct.toFixed(1)}%</span> principal cleared
        {p.months === null ? <span className="text-co ml-2">EMI doesn't cover interest</span> : null}
      </div>
    </Link>
  );
}
