import { createFileRoute } from "@tanstack/react-router";
import { usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, SectionTitle, Skeleton } from "@/components/wp/ui";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights — WealthPulse" },
      { name: "description", content: "Asset allocation, debt ratios, emergency runway and protection cover for your household." },
      { property: "og:title", content: "Insights — WealthPulse" },
      { property: "og:description", content: "Asset allocation, debt ratios, emergency runway and protection cover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Insights,
});

const BUCKETS = [
  { label: "Equity", cats: ["mutual_fund", "equity", "rsu"], dot: "bg-em" },
  { label: "Retirement & Debt", cats: ["epfo", "ppf", "nps", "life_policy"], dot: "bg-sky" },
  { label: "FDs", cats: ["fd"], dot: "bg-amber" },
  { label: "Real Estate", cats: ["real_estate"], dot: "bg-soft" },
  { label: "Gold & Cash", cats: ["gold", "cash"], dot: "bg-dim" },
  { label: "Private", cats: ["receivable", "private_equity", "vehicle"], dot: "bg-slate" },
];

function Insights() {
  const { scoped, portfolio, isLoading } = usePortfolio();
  const { full, compact } = useMoney();
  if (isLoading || !scoped || !portfolio) return <div className="px-4 md:px-6 pt-5"><Skeleton className="h-96" /></div>;
  const { holdings, totals, policies } = scoped;
  const buckets = BUCKETS.map((b) => ({ ...b, value: holdings.filter((h) => b.cats.includes(h.cat)).reduce((s, h) => s + h.value, 0) }));
  const cash = holdings.filter((h) => h.cat === "cash").reduce((s, h) => s + h.value, 0);
  const term = policies.filter((p) => p.kind === "term").reduce((s, p) => s + Number(p.cover), 0);
  const health = policies.filter((p) => p.kind === "health").reduce((s, p) => s + Number(p.cover), 0);
  const skipped = holdings.flatMap((h) => h.installments).filter((i) => i.status === "skipped").length;
  const ratios = [
    { label: "Debt-to-Asset", value: `${totals.gross ? ((totals.liabilities / totals.gross) * 100).toFixed(1) : "0.0"}%`, note: "Under 30% is healthy" },
    { label: "Emergency runway", value: totals.emiOut ? `${(cash / totals.emiOut).toFixed(1)} mo` : "—", note: "Cash & bank ÷ monthly EMIs" },
    { label: "Term cover vs loans", value: totals.liabilities ? `${(term / totals.liabilities).toFixed(1)}×` : term ? "∞" : "—", note: `${compact(term)} term cover` },
    { label: "Health cover", value: compact(health), note: `${policies.filter((p) => p.kind === "health").length} policies` },
    { label: "Monthly SIPs", value: full(totals.sipIn), note: `${skipped} installment${skipped === 1 ? "" : "s"} skipped` },
    { label: "Today's MF move", value: full(totals.dayChange, { sign: true }), note: "From latest AMFI NAV", tone: totals.dayChange >= 0 ? "text-em" : "text-co" },
  ];
  return (
    <div className="px-4 md:px-6 pt-5 pb-16 space-y-5">
      <section className="flex flex-wrap items-end gap-6 border-b border-line pb-5">
        <div>
          <SectionTitle>Total net worth</SectionTitle>
          <div className="n text-[32px] sm:text-[40px] leading-none font-semibold mt-2 text-hi">{full(totals.net)}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {buckets.filter((b) => b.value > 0).map((b) => (
            <span key={b.label} className="px-3 py-1.5 rounded-full border border-line bg-panel">
              <i className={cn("inline-block w-2 h-2 rounded-full mr-2", b.dot)} />{b.label} <b className="n ml-1">{totals.gross ? Math.round((b.value / totals.gross) * 100) : 0}%</b>
            </span>
          ))}
        </div>
      </section>
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Allocation" />
          <div className="p-4 space-y-3 n text-[12px]">
            {buckets.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-36 font-sans text-[13px]">{b.label}</span>
                <div className="flex-1 h-1.5 bg-line rounded-full"><div className={cn("h-full rounded-full", b.dot)} style={{ width: `${totals.gross ? (b.value / totals.gross) * 100 : 0}%` }} /></div>
                <span className="w-20 text-right text-hi">{compact(b.value)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="By person" />
          <div className="p-4 space-y-3">
            {portfolio.profiles.map((m) => {
              const t = portfolio.totalsByProfile[m.id];
              return (
                <div key={m.id} className="flex items-center"><span>{m.display_name}</span><span className="ml-auto n text-hi">{full(t?.net ?? 0)}</span></div>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line rounded-[6px] overflow-hidden">
        {ratios.map((r) => (
          <div key={r.label} className="bg-panel p-4">
            <SectionTitle>{r.label}</SectionTitle>
            <div className={cn("n text-[22px] font-semibold mt-2 text-hi", r.tone)}>{r.value}</div>
            <div className="text-[11.5px] text-mut mt-1">{r.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
