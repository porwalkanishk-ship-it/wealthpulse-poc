import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { todayISO, fmtDayMonYear } from "@/lib/dates";
import { DEFAULT_CLIFF, generateSchedule, type PresetConfig, type VestingType } from "@/lib/rsu";
import { Badge, Btn, Field, Modal, SelectInput, Segmented, TextInput } from "../ui";
import { DeleteButton, OwnerField, PrivateToggle, toNum, useDefaultOwner } from "./shared";
import { SecurityPicker, type FoundSecurity } from "./EquityModal";

const TYPE_LABEL: Record<VestingType, string> = {
  cliff_monthly: "Cliff, then monthly",
  cliff_quarterly: "Cliff, then quarterly",
  annual_pct: "Yearly percentages",
  custom: "Custom list",
};

function parseCustom(text: string): { date: string; shares: number }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*[,\s]\s*([\d.,]+)$/);
      return m ? [{ date: m[1]!, shares: Number(m[2]!.replace(/,/g, "")) }] : [];
    });
}

export function RsuModal({ grantId, vestId, onClose, onSaved }: { grantId?: string | undefined; vestId?: string | undefined; onClose: () => void; onSaved: () => void }) {
  const { portfolio } = usePortfolio();
  const invalidate = useInvalidatePortfolio();
  const defaultOwner = useDefaultOwner();
  const row = grantId ? portfolio?.holdings.find((h) => h.rsu?.grantId === grantId) : undefined;
  const existing = row?.rsu;
  const isNew = !grantId;
  const today = todayISO();

  const [owner, setOwner] = useState(row?.owner_profile_id ?? defaultOwner);
  const [listed, setListed] = useState(existing?.listed ?? true);
  const [security, setSecurity] = useState<FoundSecurity | null>(null);
  const [company, setCompany] = useState(existing?.company ?? "");
  const [grantDate, setGrantDate] = useState(existing?.grantDate ?? "");
  const [total, setTotal] = useState(existing ? String(existing.totalShares) : "");
  const [type, setType] = useState<VestingType>("cliff_monthly");
  const [cliffMonths, setCliffMonths] = useState(String(DEFAULT_CLIFF && "cliffMonths" in DEFAULT_CLIFF ? DEFAULT_CLIFF.cliffMonths : 12));
  const [cliffPct, setCliffPct] = useState("25");
  const [totalMonths, setTotalMonths] = useState("48");
  const [percents, setPercents] = useState("25, 25, 25, 25");
  const [custom, setCustom] = useState("");
  const [withholding, setWithholding] = useState(existing ? String(existing.withholdingPct) : "30");
  const [price, setPrice] = useState(row?.unit_price != null && existing?.manual ? String(row.unit_price) : "");
  const [priceCcy, setPriceCcy] = useState(existing?.manual ? row?.price_currency ?? "USD" : "USD");
  const [priceDate, setPriceDate] = useState(existing?.manual ? existing.priceDate ?? today : today);
  const [hidden, setHidden] = useState(row?.is_hidden ?? false);
  const [busy, setBusy] = useState(false);
  const [vests, setVests] = useState<Tables<"rsu_vests">[]>([]);
  const [delivered, setDelivered] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!grantId) return;
    void supabase
      .from("rsu_vests")
      .select("*")
      .eq("grant_id", grantId)
      .order("vest_date")
      .then(({ data }) => setVests(data ?? []));
  }, [grantId]);

  const config: PresetConfig = useMemo(() => {
    if (type === "custom") return { vests: parseCustom(custom) };
    if (type === "annual_pct") return { percents: percents.split(/[,\s]+/).map(Number).filter((n) => n > 0) };
    return { cliffMonths: Number(cliffMonths) || 12, cliffPct: Number(cliffPct) || 25, totalMonths: Number(totalMonths) || 48 };
  }, [type, cliffMonths, cliffPct, totalMonths, percents, custom]);
  const totalN = toNum(total);
  const schedule = useMemo(() => (isNew && grantDate && totalN > 0 ? generateSchedule(type, grantDate, totalN, config) : []), [isNew, type, grantDate, totalN, config]);
  const scheduleSum = Math.round(schedule.reduce((s, r) => s + r.shares, 0) * 1e4) / 1e4;

  const w = toNum(withholding);
  const p = toNum(price);
  const name = listed ? (security?.name ?? "") : company.trim();
  const valid =
    isNew
      ? !!owner && !!name && !!grantDate && totalN > 0 && w >= 0 && w <= 100 && schedule.length > 0 && Math.abs(scheduleSum - totalN) < 0.01 && (listed ? !!security : true) && (listed || p > 0)
      : w >= 0 && w <= 100;

  async function create() {
    setBusy(true);
    const { data: g, error } = await supabase
      .from("rsu_grants")
      .insert({
        owner_profile_id: owner,
        company_name: name,
        listed,
        security_id: listed ? security!.id : null,
        grant_date: grantDate,
        total_shares: totalN,
        vesting_type: type,
        preset_config: config as never,
        withholding_pct: w,
        manual_price: listed ? null : p,
        manual_price_currency: listed ? null : priceCcy,
        manual_price_date: listed ? null : priceDate,
        // A new unlisted grant should not be asked "has it listed?" straight away.
        last_listing_check_at: listed ? null : new Date().toISOString(),
        is_hidden: hidden,
      })
      .select("id")
      .single();
    if (error || !g) {
      setBusy(false);
      return void toast.error(error?.message ?? "Could not save the grant");
    }
    const { error: e2 } = await supabase.from("rsu_vests").insert(schedule.map((r) => ({ grant_id: g.id, vest_date: r.vest_date, shares: r.shares })));
    setBusy(false);
    if (e2) {
      await supabase.from("rsu_grants").delete().eq("id", g.id);
      return void toast.error(e2.message);
    }
    await invalidate();
    toast.success("Grant added");
    onSaved();
    onClose();
  }

  async function saveExisting() {
    setBusy(true);
    const patch: Partial<Tables<"rsu_grants">> = { withholding_pct: w, is_hidden: hidden };
    if (!existing!.listed) Object.assign(patch, { manual_price: Number.isNaN(p) ? null : p, manual_price_currency: priceCcy, manual_price_date: priceDate });
    const { error } = await supabase.from("rsu_grants").update(patch).eq("id", grantId!);
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success("Grant updated");
    onSaved();
    onClose();
  }

  async function linkListed(s: FoundSecurity) {
    const { error } = await supabase.from("rsu_grants").update({ listed: true, security_id: s.id, manual_price: null, manual_price_currency: null, manual_price_date: null }).eq("id", grantId!);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success(`Linked to ${s.exchange}:${s.symbol}`);
    onSaved();
    onClose();
  }

  async function snooze() {
    const until = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    await supabase.from("rsu_grants").update({ listing_snoozed_until: until, last_listing_check_at: new Date().toISOString() }).eq("id", grantId!);
    toast.success("Not listed yet. We'll ask again in a year.");
    onClose();
  }

  async function confirmVest(v: Tables<"rsu_vests">) {
    const n = toNum(delivered[v.id] ?? "");
    if (!(n >= 0)) return void toast.error("Enter the shares delivered after tax");
    const { error } = await supabase.from("rsu_vests").update({ status: "delivered", delivered_shares: n, price_on_vest: existing?.price ?? null, price_currency: row?.price_currency ?? null }).eq("id", v.id);
    if (error) return void toast.error(error.message);
    setVests((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: "delivered", delivered_shares: n } : x)));
    await invalidate();
    toast.success("Delivery confirmed");
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("rsu_grants").delete().eq("id", grantId!);
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    onClose();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="RSUs"
      title={isNew ? "Add an RSU grant" : `${existing?.company ?? "RSU grant"}`}
      width="max-w-[600px]"
      footer={
        <>
          {!isNew ? <DeleteButton onConfirm={() => void remove()} busy={busy} /> : null}
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={() => void (isNew ? create() : saveExisting())} disabled={!valid || busy}>
            {isNew ? "Add grant" : "Save"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3">
        {isNew ? (
          <>
            <Segmented
              value={listed ? "listed" : "unlisted"}
              onChange={(v) => setListed(v === "listed")}
              options={[
                { value: "listed", label: "Listed company" },
                { value: "unlisted", label: "Not listed yet" },
              ]}
            />
            {listed ? (
              <Field label="Company">
                <SecurityPicker value={security} onPick={setSecurity} />
              </Field>
            ) : (
              <>
                <Field label="Company name">
                  <TextInput sans value={company} onChange={(e) => setCompany(e.target.value)} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Price per share" hint="Latest valuation you know of">
                    <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                  </Field>
                  <Field label="Currency">
                    <SelectInput value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)}>
                      <option value="USD">USD</option>
                      <option value="INR">INR</option>
                    </SelectInput>
                  </Field>
                  <Field label="As of">
                    <TextInput type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
                  </Field>
                </div>
              </>
            )}
            <OwnerField value={owner} onChange={setOwner} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Grant date">
                <TextInput type="date" value={grantDate} onChange={(e) => setGrantDate(e.target.value)} />
              </Field>
              <Field label="Total shares granted">
                <TextInput inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
              </Field>
            </div>
            <Field label="Vesting schedule">
              <SelectInput value={type} onChange={(e) => setType(e.target.value as VestingType)}>
                {(Object.keys(TYPE_LABEL) as VestingType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {type === "cliff_monthly" || type === "cliff_quarterly" ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Cliff (months)">
                  <TextInput inputMode="numeric" value={cliffMonths} onChange={(e) => setCliffMonths(e.target.value)} />
                </Field>
                <Field label="Vests at cliff (%)">
                  <TextInput inputMode="decimal" value={cliffPct} onChange={(e) => setCliffPct(e.target.value)} />
                </Field>
                <Field label="Fully vested (months)">
                  <TextInput inputMode="numeric" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} />
                </Field>
              </div>
            ) : type === "annual_pct" ? (
              <Field label="Percent vesting each anniversary" hint="For example 25, 25, 25, 25 or 10, 20, 30, 40">
                <TextInput value={percents} onChange={(e) => setPercents(e.target.value)} />
              </Field>
            ) : (
              <Field label="One vest per line: date, shares" hint="For example 2026-03-15, 120">
                <textarea className="w-full rounded-[5px] border border-line bg-ink p-2 n text-[12px] min-h-[90px]" value={custom} onChange={(e) => setCustom(e.target.value)} />
              </Field>
            )}
            {schedule.length > 0 ? (
              <div className="rounded-[5px] border border-line p-3 text-[12px]">
                <div className="text-mut mb-1">
                  {schedule.length} vests · {scheduleSum} shares {Math.abs(scheduleSum - totalN) < 0.01 ? "" : <Badge tone="amber">does not match the total granted</Badge>}
                </div>
                <div className="n max-h-28 overflow-y-auto grid grid-cols-2 gap-x-4">
                  {schedule.map((r) => (
                    <div key={r.vest_date}>
                      {fmtDayMonYear(r.vest_date)} · {r.shares}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="text-[12px] text-mut">
              {existing!.listed ? `Priced from ${existing!.symbol ?? "the market"}.` : "Not listed. Priced from the value you enter."} Granted {fmtDayMonYear(existing!.grantDate)}: {existing!.totalShares} shares.
            </div>
            {!existing!.listed ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Price per share">
                    <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                  </Field>
                  <Field label="Currency">
                    <SelectInput value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)}>
                      <option value="USD">USD</option>
                      <option value="INR">INR</option>
                    </SelectInput>
                  </Field>
                  <Field label="As of">
                    <TextInput type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
                  </Field>
                </div>
                <div className="rounded-[5px] border border-line p-3">
                  <div className="text-hi mb-2">Has {existing!.company} listed?</div>
                  {linking ? (
                    <SecurityPicker value={null} onPick={(s) => s && void linkListed(s)} />
                  ) : (
                    <div className="flex gap-2">
                      <Btn size="sm" onClick={() => setLinking(true)}>
                        Yes, link it
                      </Btn>
                      <Btn size="sm" variant="secondary" onClick={() => void snooze()}>
                        Not yet
                      </Btn>
                    </div>
                  )}
                </div>
              </>
            ) : null}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-mut mb-1">Vests</div>
              <div className="rounded-[5px] border border-line divide-y divide-line max-h-64 overflow-y-auto">
                {vests.map((v) => {
                  const due = v.status === "pending" && v.vest_date <= today;
                  return (
                    <div key={v.id} className={`px-3 py-2 flex items-center gap-2 text-[12px] ${v.id === vestId ? "bg-em/10" : ""}`}>
                      <span className="n w-28">{fmtDayMonYear(v.vest_date)}</span>
                      <span className="n w-16 text-right">{Number(v.shares)}</span>
                      {v.status === "delivered" ? (
                        <Badge tone="em">delivered {Number(v.delivered_shares)}</Badge>
                      ) : due ? (
                        <>
                          <Badge tone="amber">estimate</Badge>
                          <TextInput inputMode="decimal" className="w-24 ml-auto" placeholder="delivered" value={delivered[v.id] ?? ""} onChange={(e) => setDelivered({ ...delivered, [v.id]: e.target.value })} />
                          <Btn size="sm" onClick={() => void confirmVest(v)}>
                            Confirm
                          </Btn>
                        </>
                      ) : (
                        <span className="text-mut ml-auto">unvested</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-mut mt-1">Shares that have vested but are not confirmed are counted as an estimate after the withholding below. Enter the shares actually delivered to replace the estimate.</p>
            </div>
          </>
        )}
        <Field label="Shares withheld for tax (%)" hint="An estimate used until you confirm the shares delivered">
          <TextInput inputMode="decimal" value={withholding} onChange={(e) => setWithholding(e.target.value)} />
        </Field>
        <PrivateToggle value={hidden} onChange={setHidden} />
      </div>
    </Modal>
  );
}
