import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { useAppState } from "@/lib/app-state";
import { addMonths, fmtDayMonYear, monthLabel, parseISO } from "@/lib/dates";
import { advanceDue, renewals, type RenewalItem } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { Btn, Empty, Panel, PanelHeader, Skeleton } from "@/components/wp/ui";
import { CountdownBadge } from "@/components/wp/RenewalBadge";

export const Route = createFileRoute("/_authenticated/renewals")({
  head: () => ({
    meta: [
      { title: "Renewals Radar — WealthPulse" },
      { name: "description", content: "Insurance renewals, premium due dates and FD maturities with countdowns and a 12-month calendar." },
      { property: "og:title", content: "Renewals Radar — WealthPulse" },
      { property: "og:description", content: "Insurance renewals, premium due dates and FD maturities with countdowns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RenewalsPage,
});

function RenewalsPage() {
  const { scoped, today, isLoading } = usePortfolio();
  const { full, compact } = useMoney();
  const { open } = useAppState();
  const invalidate = useInvalidatePortfolio();
  if (isLoading || !scoped) return <div className="px-4 md:px-6 pt-5"><Skeleton className="h-96" /></div>;
  const items = renewals(scoped.holdings, scoped.policies, today);
  const upcoming = items.filter((r) => r.days >= -60);

  async function markPaid(r: RenewalItem) {
    if (r.kind === "policy") {
      const p = scoped!.policies.find((x) => x.id === r.sourceId);
      if (!p) return;
      const { error } = await supabase.from("policies").update({ next_due: advanceDue(p.next_due, p.frequency) }).eq("id", p.id);
      if (error) return void toast.error(error.message);
    } else if (r.kind === "premium") {
      const { error } = await supabase.from("holdings").update({ next_due: addMonths(r.date, 12) }).eq("id", r.sourceId);
      if (error) return void toast.error(error.message);
    }
    await invalidate();
    toast.success(`${r.title} marked paid`);
  }

  const months = Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 8) + "01", i));

  return (
    <div className="px-4 md:px-6 pt-5 pb-16 grid lg:grid-cols-3 gap-5">
      <Panel className="lg:col-span-2">
        <PanelHeader title="Renewals & Maturity Radar" />
        <div className="p-4 space-y-2">
          {upcoming.length === 0 ? (
            <Empty title="Nothing due">Add insurance policies or fixed deposits to see renewals and maturities here.</Empty>
          ) : (
            upcoming.map((r) => (
              <div key={r.key} className="flex items-center gap-3 p-3 rounded-[4px] bg-ink border border-line">
                <div className="min-w-0">
                  <div className="font-medium text-hi truncate">{r.title}</div>
                  <div className="n text-mut text-[11.5px]">{r.detail} · {fmtDayMonYear(r.date)} · {full(r.amount)}</div>
                </div>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {(r.kind === "policy" || r.kind === "premium") && r.days <= 45 ? <Btn size="sm" variant="secondary" onClick={() => void markPaid(r)}>Mark paid</Btn> : null}
                  {r.kind === "fd" ? <Btn size="sm" variant="ghost" onClick={() => open({ type: "asset", holdingId: r.sourceId })}>Renew / edit</Btn> : null}
                  <CountdownBadge item={r} />
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Protection">
          <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => open({ type: "policy" })}>+ Add</Btn>
        </PanelHeader>
        <div className="px-4 divide-y divide-line">
          {scoped.policies.length === 0 ? <Empty title="No policies yet">Term and health covers are tracked here, not counted as assets.</Empty> : null}
          {scoped.policies.map((p) => (
            <button key={p.id} type="button" onClick={() => open({ type: "policy", policyId: p.id })} className="w-full text-left py-3 flex items-center hover:text-hi">
              <div>
                <div>{p.name}</div>
                <div className="n text-hi text-[12px]">{compact(Number(p.cover), { space: true, digits: p.cover >= 1e7 ? 0 : 0 })} {p.kind === "health" ? "sum insured" : "cover"}</div>
              </div>
              <span className="ml-auto n text-mut text-[12px]">{full(Number(p.premium))}/{p.frequency === "monthly" ? "mo" : "yr"}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="lg:col-span-3">
        <PanelHeader title="12-month calendar" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line">
          {months.map((m) => {
            const { y, m: mo } = parseISO(m);
            const inMonth = items.filter((r) => r.date.slice(0, 7) === m.slice(0, 7));
            return (
              <div key={m} className="bg-panel p-3 min-h-[96px]">
                <div className="n text-[11px] text-mut">{monthLabel(mo)} {y}</div>
                <div className="mt-2 space-y-1.5">
                  {inMonth.map((r) => (
                    <div key={r.key} className="flex items-center gap-1.5 text-[11.5px]">
                      <i className={cn("w-1.5 h-1.5 rounded-full shrink-0", r.inflow ? "bg-em" : r.days <= 30 ? "bg-co" : "bg-soft")} />
                      <span className="n text-mut">{r.date.slice(8)}</span>
                      <span className="truncate">{r.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
