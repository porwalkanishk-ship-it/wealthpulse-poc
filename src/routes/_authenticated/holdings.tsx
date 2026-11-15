import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { useAppState } from "@/lib/app-state";
import { fmtDayMonYear, fmtMonDayYear, ordinal } from "@/lib/dates";
import { num } from "@/lib/format";
import { CATEGORY_LABEL, GUARANTEED, type Category, type ValuedHolding } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { Btn, Empty, LiveDot, Panel, PanelHeader, SectionTitle, Skeleton } from "@/components/wp/ui";

export const Route = createFileRoute("/_authenticated/holdings")({
  head: () => ({
    meta: [
      { title: "Holdings — WealthPulse Terminal" },
      { name: "description", content: "Every holding with live AMFI NAV, units, day P&L and SIP status, plus retirement and tangible assets." },
      { property: "og:title", content: "Holdings — WealthPulse Terminal" },
      { property: "og:description", content: "Every holding with live AMFI NAV, units, day P&L and SIP status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HoldingsPage,
});

type Fmt = (n: number, o?: { sign?: boolean; digits?: number; space?: boolean }) => string;

function HoldingsPage() {
  const { scoped, portfolio, isLoading } = usePortfolio();
  const { full, compact, currency, fx } = useMoney();
  const { open, profile, lastSync } = useAppState();

  if (isLoading || !scoped || !portfolio) {
    return (
      <div className="px-4 md:px-6 pt-5 pb-16 space-y-5">
        <Skeleton className="h-80" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  const memberName = (id: string | null) => portfolio.profiles.find((m) => m.id === id)?.display_name ?? "";
  const showOwner = profile === "all";
  const h = scoped.holdings;
  const funds = h.filter((x) => x.cat === "mutual_fund");
  const equities = h.filter((x) => x.cat === "equity");
  const rsus = h.filter((x) => x.cat === "rsu");
  const guaranteed = h.filter((x) => GUARANTEED.includes(x.cat));
  const tangible = h.filter((x) => ["real_estate", "gold", "cash", "vehicle"].includes(x.cat));
  const priv = h.filter((x) => ["receivable", "private_equity"].includes(x.cat));
  const marketTotal = [...funds, ...equities, ...rsus].reduce((s, x) => s + x.value, 0);
  const navDate = lastSync?.navDate ?? funds.find((f) => f.nav_date)?.nav_date ?? null;

  const owner = (x: ValuedHolding) => (showOwner ? <span className="ml-2 text-[11px] text-mut font-sans">{memberName(x.owner_profile_id)}</span> : null);

  return (
    <div className="px-4 md:px-6 pt-5 pb-16 space-y-5">
      <Panel id="market" className="scroll-mt-28">
        <PanelHeader title="Market & Equity (Live)">
          <span className="flex items-center gap-1.5 text-[11px] text-em n whitespace-nowrap">
            <LiveDot pulse /> {navDate ? `NAV ${fmtDayMonYear(navDate)}` : "AMFI"}
          </span>
          <span className="ml-auto n text-hi hidden sm:inline">{full(marketTotal)}</span>
          <Btn variant="ghost" size="sm" onClick={() => open({ type: "asset", category: "mutual_fund" })}>
            + Add
          </Btn>
        </PanelHeader>
        {funds.length + equities.length + rsus.length === 0 ? (
          <Empty title="No funds or shares yet" action={<Btn onClick={() => open({ type: "cas" })}>Upload CAS</Btn>}>
            Upload your CAMS / KFintech CAS once; WealthPulse keeps units and NAVs current after that.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="text-[11px] uppercase tracking-wider text-mut">
                <tr className="border-b border-line">
                  <th className="text-left font-medium px-4 py-2">Scheme</th>
                  <th className="text-left font-medium">Folio/Broker</th>
                  <th className="text-right font-medium">Units</th>
                  <th className="text-right font-medium">Live NAV</th>
                  <th className="text-right font-medium">Value</th>
                  <th className="text-right font-medium">Day P&amp;L</th>
                  <th className="text-right font-medium px-4">SIP</th>
                </tr>
              </thead>
              <tbody className="n text-[12.5px]">
                {funds.map((f) => {
                  const pending = f.installments.some((i) => i.status === "pending");
                  return (
                    <tr key={f.id} className="border-b border-line/60 hover:bg-raised/40 cursor-pointer" onClick={() => open({ type: "asset", holdingId: f.id })}>
                      <td className="px-4 py-2.5 font-sans text-[13px] max-w-[260px]">
                        <span className="truncate inline-block max-w-full align-bottom">{f.name.replace(/ - Direct( Plan)?( -)? Growth( Option)?/i, "").replace(/ Fund$/, "")}</span>
                        {owner(f)}
                      </td>
                      <td className="text-mut">{f.folio ?? "—"}</td>
                      <td className="text-right">{num(f.totalUnits, 2)}</td>
                      <td className="text-right">{f.nav ? num(Number(f.nav), 2) : <span className="text-mut">—</span>}</td>
                      <td className="text-right text-hi">{full(f.value)}</td>
                      <td className={cn("text-right", f.dayChange >= 0 ? "text-em" : "text-co")}>{f.prev_nav ? full(f.dayChange, { sign: true }) : <span className="text-mut">—</span>}</td>
                      <td className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => open({ type: "sip", holdingId: f.id })}
                          className={cn(
                            "group px-2 py-0.5 rounded-[4px] text-[11px] border whitespace-nowrap",
                            f.sip_active && f.sip_day
                              ? "bg-em/10 text-em border-em/30 hover:bg-em/20"
                              : f.sip_amount
                                ? "border-line text-mut hover:text-foreground"
                                : "border-dashed border-line text-mut hover:text-foreground",
                          )}
                          aria-label={`Manage SIP for ${f.name}`}
                        >
                          {f.sip_active && f.sip_day ? `Active ${ordinal(f.sip_day)}` : f.sip_amount ? "Paused" : "Set SIP"}
                          {pending ? <span className="ml-1 text-amber">•</span> : null}
                          <Pencil className="hidden group-hover:inline w-3 h-3 ml-1 -mt-0.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {equities.length > 0 ? (
                  <tr className="border-b border-line">
                    <td colSpan={7} className="px-4 py-2 font-sans text-[11px] uppercase tracking-wider text-mut">
                      Demat Equities
                    </td>
                  </tr>
                ) : null}
                {equities.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 hover:bg-raised/40 cursor-pointer" onClick={() => open({ type: "asset", holdingId: e.id })}>
                    <td className="px-4 py-2.5 font-sans text-[13px]">
                      {e.name}
                      {owner(e)}
                    </td>
                    <td className="text-mut">{(e.subtitle ?? "").replace(/ demat$/i, "") || "—"}</td>
                    <td className="text-right">{e.quantity ? num(Number(e.quantity), 0) : "—"}</td>
                    <td className="text-right text-mut">{e.unit_price ? num(Number(e.unit_price), 2) : "—"}</td>
                    <td className="text-right text-hi">{full(e.value)}</td>
                    <td className="text-right text-mut">—</td>
                    <td className="px-4" />
                  </tr>
                ))}
                {rsus.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-raised/40 cursor-pointer" onClick={() => open({ type: "asset", holdingId: r.id })}>
                    <td className="px-4 py-2.5 font-sans text-[13px]">
                      {r.name}
                      {owner(r)}
                      {r.unvestedValue > 0 ? (
                        <div className="n text-[11px] text-mut">
                          +{num(Number(r.unvested_quantity), 0)} unvested ≈ {compact(r.unvestedValue)}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-mut">Vested</td>
                    <td className="text-right">{num(Number(r.quantity), 0)}</td>
                    <td className="text-right whitespace-nowrap">
                      {r.price_currency === "USD" ? `$${num(Number(r.unit_price), 2)} / ₹${num(Number(r.unit_price) * fx, 0)}` : num(Number(r.unit_price), 2)}
                    </td>
                    <td className="text-right text-hi">{compact(r.value)}</td>
                    <td className="text-right text-mut">—</td>
                    <td className="px-4" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {currency === "USD" ? <div className="px-4 py-2 text-[11px] text-mut border-t border-line n">Converted at ₹{fx.toFixed(2)} / $</div> : null}
      </Panel>

      <Panel id="guaranteed" className="scroll-mt-28">
        <PanelHeader title="Guaranteed & Retirement">
          <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => open({ type: "asset", category: "fd" })}>
            + Add
          </Btn>
        </PanelHeader>
        {guaranteed.length === 0 ? (
          <Empty title="Nothing here yet">Add EPFO, PPF, NPS, fixed deposits or savings policies like LIC and SBI Life.</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
            {guaranteed.map((g) => (
              <button key={g.id} type="button" onClick={() => open({ type: "asset", holdingId: g.id })} className="bg-panel p-4 text-left hover:bg-raised/30">
                <SectionTitle className="tracking-wider truncate">
                  {g.name}
                  {showOwner ? <span className="normal-case tracking-normal ml-2">· {memberName(g.owner_profile_id)}</span> : null}
                </SectionTitle>
                <div className="n text-[20px] sm:text-[22px] text-hi mt-2">{full(g.value)}</div>
                <div className="n text-[11.5px] mt-1 text-mut truncate">{guaranteedLine(g, full)}</div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel id="tangible" className="scroll-mt-28">
          <PanelHeader title="Tangible & Known Assets">
            <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => open({ type: "asset", category: "real_estate" })}>
              + Add
            </Btn>
          </PanelHeader>
          <ListOrEmpty items={tangible} full={full} owner={owner} empty="Add property, gold, bank balances or vehicles." />
        </Panel>
        <Panel id="private" className="scroll-mt-28">
          <PanelHeader title="Private Receivables & Equity">
            <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => open({ type: "asset", category: "receivable" })}>
              + Add
            </Btn>
          </PanelHeader>
          <ListOrEmpty items={priv} full={full} owner={owner} empty="Track money lent to friends or family and unlisted shares." />
        </Panel>
      </div>
    </div>
  );
}

function guaranteedLine(g: ValuedHolding, full: Fmt) {
  switch (g.cat) {
    case "epfo":
      return <span className="text-em">+{full(Number(g.monthly_contribution))} / mo · {Number(g.rate)}% p.a.</span>;
    case "ppf":
      return `${Number(g.rate)}% p.a.${Number(g.monthly_contribution) ? ` · +${full(Number(g.monthly_contribution))} / mo` : ""}`;
    case "nps":
      return `est. ${Number(g.rate)}% p.a. · +${full(Number(g.monthly_contribution))} / mo`;
    case "fd":
      return `${Number(g.rate)}%${g.maturity_date ? ` · matures ${fmtMonDayYear(g.maturity_date)}` : ""}`;
    case "life_policy":
      return `${g.subtitle ?? "Policy value"}${g.maturity_date ? ` · matures ${fmtMonDayYear(g.maturity_date)}` : ""}`;
    default:
      return g.subtitle ?? "";
  }
}

function ListOrEmpty({
  items,
  full,
  owner,
  empty,
}: {
  items: ValuedHolding[];
  full: Fmt;
  owner: (x: ValuedHolding) => ReactNode;
  empty: string;
}) {
  if (items.length === 0) return <Empty title="Nothing here yet">{empty}</Empty>;
  return (
    <div className="divide-y divide-line">
      {items.map((x) => (
        <HoldingRow key={x.id} h={x} full={full} owner={owner(x)} />
      ))}
    </div>
  );
}

function HoldingRow({ h, full, owner }: { h: ValuedHolding; full: Fmt; owner: ReactNode }) {
  const { open } = useAppState();
  return (
    <button type="button" onClick={() => open({ type: "asset", holdingId: h.id })} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-raised/30">
      <div className="min-w-0">
        <div className="truncate">
          {h.name}
          {owner}
        </div>
        <div className="text-[11.5px] text-mut truncate">
          {CATEGORY_LABEL[h.cat as Category]}
          {h.subtitle ? ` · ${h.subtitle}` : ""}
          {h.cat === "vehicle" && Number(h.rate) ? ` · −${Number(h.rate)}%/yr` : ""}
        </div>
      </div>
      <div className="ml-auto text-right shrink-0">
        <div className="n text-hi">{full(h.value)}</div>
        {h.netEquity !== null ? <div className="n text-[11px] text-em">{full(h.netEquity)} net equity</div> : null}
      </div>
    </button>
  );
}

