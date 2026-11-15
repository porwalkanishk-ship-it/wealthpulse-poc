import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { fmtDayMonYear, todayISO } from "@/lib/dates";
import { num } from "@/lib/format";
import { nextSipDate, totalUnits, unitsFor, type InstallmentStatus } from "@/lib/sip";
import { cn } from "@/lib/utils";
import { Badge, Btn, Empty, Field, Modal, SectionTitle, SelectInput, Switch, TextInput } from "../ui";
import { toNum } from "./shared";

export function SipModal({ holdingId, onClose, onSaved }: { holdingId: string; onClose: () => void; onSaved: () => void }) {
  const { portfolio } = usePortfolio();
  const { full } = useMoney();
  const invalidate = useInvalidatePortfolio();
  const h = portfolio?.holdings.find((x) => x.id === holdingId);
  const [amount, setAmount] = useState(h?.sip_amount ? String(h.sip_amount) : "");
  const [day, setDay] = useState(String(h?.sip_day ?? 5));
  const [paused, setPaused] = useState(h ? !h.sip_active : false);
  const [overrides, setOverrides] = useState<Record<string, InstallmentStatus>>({});
  const [busy, setBusy] = useState(false);

  const entries = useMemo(() => (h?.installments ?? []).map((i) => ({ ...i, status: (overrides[i.id] ?? i.status) as InstallmentStatus })), [h, overrides]);
  if (!h) return null;
  const amt = toNum(amount);
  const nextRun = nextSipDate(Number(day), todayISO());
  const unitsAfter = totalUnits(Number(h.units), entries);
  const shortName = h.name.replace(/ - Direct( Plan)?( -)? Growth( Option)?/i, "");

  function toggle(id: string, current: InstallmentStatus, nav: number | null) {
    const orig = h!.installments.find((i) => i.id === id)?.status as InstallmentStatus;
    const next: InstallmentStatus = current === "skipped" ? (nav ? "applied" : "pending") : "skipped";
    setOverrides((o) => {
      const c = { ...o };
      if (next === orig) delete c[id];
      else c[id] = next;
      return c;
    });
  }

  async function save() {
    if (amount && !(amt > 0 && amt < 1e9)) return void toast.error("Enter a valid SIP amount");
    setBusy(true);
    try {
      const active = !!amount && !paused;
      const resumed = active && (!h!.sip_active || !h!.sip_start);
      const { error } = await supabase
        .from("holdings")
        .update({
          sip_amount: amount ? amt : null,
          sip_day: amount ? Number(day) : null,
          sip_active: active,
          ...(resumed ? { sip_start: todayISO() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", h!.id);
      if (error) throw error;
      for (const [id, status] of Object.entries(overrides)) {
        const { error: e2 } = await supabase.from("sip_installments").update({ status }).eq("id", id);
        if (e2) throw e2;
      }
      await invalidate();
      toast.success("SIP updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="SIP & unit adjustments"
      title={`${shortName} — SIP & Unit Adjustments`}
      footer={
        <>
          <span className="mr-auto n text-[12px] text-mut">
            Units <span className="text-hi">{num(unitsAfter, 3)}</span>
          </span>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Btn>
        </>
      }
    >
      <div className="rounded-[6px] border border-line bg-ink p-4 flex flex-wrap items-end gap-4">
        <Field label="Monthly SIP" className="w-36">
          <TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" className="text-[18px] font-semibold" />
        </Field>
        <Field label="Debit day" className="w-24">
          <SelectInput value={day} onChange={(e) => setDay(e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </SelectInput>
        </Field>
        <Badge tone={amount && !paused ? "em" : "slate"} className="mb-2">{amount && !paused ? "Active" : amount ? "Paused" : "No SIP"}</Badge>
        <label className="ml-auto mb-1.5 flex items-center gap-2 text-[12.5px] text-soft">
          Pause auto-projection <Switch checked={paused} onChange={setPaused} label="Pause auto-projection" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px]">
        <span className="text-mut">Next run</span>
        {amount && !paused ? (
          <span className="n text-hi">
            {fmtDayMonYear(nextRun)} · ≈ {h.nav ? num(unitsFor(amt || 0, Number(h.nav)), 3) : "—"} units at {h.nav ? num(Number(h.nav), 2) : "AMFI NAV"}
          </span>
        ) : (
          <span className="text-mut">Auto-projection is off — no units will be added.</span>
        )}
      </div>
      <SectionTitle className="mt-5 mb-1">Recent entries</SectionTitle>
      {entries.length === 0 ? (
        <Empty title="No installments yet">Each month on the debit day, units are added at that day's AMFI NAV. They'll appear here.</Empty>
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {entries.slice(0, 12).map((e, idx) => (
            <div key={e.id} className="flex items-center gap-3 sm:gap-4 h-12 n text-[12.5px]">
              <span className="w-24 font-sans text-hi">{fmtDayMonYear(e.due_date)}</span>
              <span className="hidden sm:inline w-20 text-right">{full(Number(e.amount))}</span>
              <span className="w-16 text-right text-mut">{e.nav ? num(Number(e.nav), 2) : "—"}</span>
              <span className={cn("w-20 text-right", e.status === "skipped" && "line-through text-mut")}>{e.status === "pending" ? "pending" : `+${num(Number(e.units), 3)}`}</span>
              <i
                title={e.status}
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  e.status === "applied" && "bg-em",
                  e.status === "reconciled" && "bg-soft",
                  e.status === "pending" && "bg-amber",
                  e.status === "skipped" && "border border-mut",
                )}
              />
              <span className="ml-auto">
                {e.status === "reconciled" ? (
                  <Badge tone="outline">Reconciled from CAS</Badge>
                ) : (
                  <Btn size="sm" variant={idx === 0 ? "primary" : "secondary"} className="rounded-full" onClick={() => toggle(e.id, e.status, e.nav === null ? null : Number(e.nav))}>
                    {e.status === "skipped" ? "Undo skip" : "Skip / Undo this installment"}
                  </Btn>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
