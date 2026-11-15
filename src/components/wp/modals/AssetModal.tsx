import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { getLatestNav, searchSchemes } from "@/lib/market.functions";
import { todayISO } from "@/lib/dates";

import { CATEGORY_LABEL, FINANCIAL, TANGIBLE, type Category } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { Btn, Field, Modal, SectionTitle, SelectInput, TextInput } from "../ui";
import { DeleteButton, OwnerField, numStr, toNum, useDefaultOwner } from "./shared";

interface Props {
  holdingId?: string | undefined;
  category?: Category | undefined;
  onClose: () => void;
  onSaved: () => void;
}

type Form = Record<string, string>;

const MONEY = (s: string) => {
  const n = toNum(s);
  return Number.isFinite(n) && n >= 0 && n < 1e12;
};

function defaultsFor(cat: Category): Form {
  const t = todayISO();
  const base: Form = { name: "", subtitle: "", amount: "", as_of: t, rate: "", monthly_contribution: "" };
  switch (cat) {
    case "epfo":
      return { ...base, name: "EPFO", rate: "8.25", subtitle: "Employer + employee" };
    case "ppf":
      return { ...base, name: "PPF", rate: "7.1", subtitle: "Annual compounding" };
    case "nps":
      return { ...base, name: "NPS Tier I", rate: "10", subtitle: "Estimated growth" };
    case "fd":
      return { ...base, rate: "7.0", start_date: t, maturity_date: "" };
    case "vehicle":
      return { ...base, name: "Car", subtitle: "Resale / IDV", rate: "15" };
    case "rsu":
      return { ...base, quantity: "", unvested_quantity: "", unit_price: "", price_currency: "USD", subtitle: "Vested" };
    case "mutual_fund":
      return { ...base, folio: "", units: "", scheme_code: "", sip_amount: "", sip_day: "5" };
    case "receivable":
      return { ...base, subtitle: "Private receivable" };
    case "life_policy":
      return { ...base, premium: "", next_due: "", maturity_date: "", subtitle: "Surrender value" };
    case "real_estate":
      return { ...base, subtitle: "Market estimate", linked_loan_id: "" };
    default:
      return base;
  }
}

export function AssetModal({ holdingId, category, onClose, onSaved }: Props) {
  const { portfolio } = usePortfolio();
  const { full } = useMoney();
  const invalidate = useInvalidatePortfolio();
  const defaultOwner = useDefaultOwner();
  const existing = holdingId ? portfolio?.holdings.find((h) => h.id === holdingId) : undefined;
  const [cat, setCat] = useState<Category | null>(existing ? existing.cat : (category ?? null));
  const [picking, setPicking] = useState(!existing);
  const [owner, setOwner] = useState(existing?.owner_profile_id ?? defaultOwner);
  const [form, setForm] = useState<Form>(() => {
    if (!existing) return cat ? defaultsFor(cat) : {};
    return {
      name: existing.name,
      subtitle: existing.subtitle ?? "",
      amount: numStr(existing.amount),
      as_of: existing.as_of,
      rate: numStr(existing.rate),
      monthly_contribution: numStr(existing.monthly_contribution),
      start_date: existing.start_date ?? "",
      maturity_date: existing.maturity_date ?? "",
      premium: numStr(existing.premium),
      next_due: existing.next_due ?? "",
      units: numStr(existing.units),
      folio: existing.folio ?? "",
      scheme_code: existing.scheme_code ?? "",
      sip_amount: numStr(existing.sip_amount),
      sip_day: existing.sip_day ? String(existing.sip_day) : "5",
      quantity: numStr(existing.quantity),
      unvested_quantity: numStr(existing.unvested_quantity),
      unit_price: numStr(existing.unit_price),
      price_currency: existing.price_currency,
      linked_loan_id: existing.linked_loan_id ?? "",
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!owner && defaultOwner) setOwner(defaultOwner);
  }, [owner, defaultOwner]);

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const f = (k: string) => form[k] ?? "";

  function choose(c: Category) {
    setCat(c);
    setForm(defaultsFor(c));
    setPicking(false);
    setErrors({});
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!cat) return e;
    if (!f("name").trim()) e["name"] = cat === "mutual_fund" ? "Pick a scheme" : "Give it a name";
    if (f("name").length > 120) e["name"] = "Keep it under 120 characters";
    const needsAmount = !["mutual_fund", "rsu"].includes(cat);
    if (needsAmount && !MONEY(f("amount"))) e["amount"] = "Enter an amount";
    if (cat === "mutual_fund" && !(toNum(f("units")) >= 0)) e["units"] = "Enter units held";
    if (cat === "rsu") {
      if (!(toNum(f("quantity")) >= 0)) e["quantity"] = "Enter vested shares";
      if (!(toNum(f("unit_price")) > 0)) e["unit_price"] = "Enter share price";
    }
    if (["fd", "epfo", "ppf", "nps"].includes(cat) && !(toNum(f("rate")) >= 0 && toNum(f("rate")) < 50)) e["rate"] = "Enter a rate";
    if (cat === "fd" && f("maturity_date") && f("start_date") && f("maturity_date") <= f("start_date")) e["maturity_date"] = "Must be after the start date";
    if (cat === "vehicle" && !(toNum(f("rate")) >= 0 && toNum(f("rate")) < 100)) e["rate"] = "Enter yearly depreciation";
    if (cat === "mutual_fund" && f("sip_amount") && !MONEY(f("sip_amount"))) e["sip_amount"] = "Enter a valid SIP amount";
    return e;
  }

  const getNav = useServerFn(getLatestNav);

  async function save() {
    if (!cat) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const nOrNull = (k: string) => (Number.isFinite(toNum(f(k))) ? toNum(f(k)) : null);
      const row: TablesInsert<"holdings"> = {
        owner_profile_id: owner,
        category: cat,
        name: f("name").trim(),
        subtitle: f("subtitle").trim() || null,
        amount: nOrNull("amount") ?? 0,
        as_of: f("as_of") || todayISO(),
        rate: nOrNull("rate"),
        monthly_contribution: nOrNull("monthly_contribution") ?? 0,
        start_date: f("start_date") || null,
        maturity_date: f("maturity_date") || null,
        premium: nOrNull("premium"),
        next_due: f("next_due") || null,
        quantity: nOrNull("quantity"),
        unvested_quantity: nOrNull("unvested_quantity"),
        unit_price: nOrNull("unit_price"),
        price_currency: f("price_currency") === "USD" ? "USD" : "INR",
        linked_loan_id: f("linked_loan_id") || null,
        updated_at: new Date().toISOString(),
      };
      if (cat === "mutual_fund") {
        const sipAmt = nOrNull("sip_amount");
        Object.assign(row, {
          folio: f("folio").trim() || null,
          scheme_code: f("scheme_code") || null,
          units: nOrNull("units") ?? 0,
          sip_amount: sipAmt,
          sip_day: sipAmt ? Number(f("sip_day")) : null,
        });
        if (!existing) {
          Object.assign(row, { sip_active: !!sipAmt, sip_start: sipAmt ? todayISO() : null, as_of: todayISO() });
          if (f("scheme_code")) {
            const nav = await getNav({ data: { code: f("scheme_code") } }).catch(() => null);
            if (nav) Object.assign(row, { nav: nav.nav, prev_nav: nav.prevNav, nav_date: nav.date });
          }
        } else if (f("scheme_code") !== (existing.scheme_code ?? "")) {
          const nav = f("scheme_code") ? await getNav({ data: { code: f("scheme_code") } }).catch(() => null) : null;
          Object.assign(row, { nav: nav?.nav ?? null, prev_nav: nav?.prevNav ?? null, nav_date: nav?.date ?? null });
        }
      }
      const { error } = existing
        ? await supabase.from("holdings").update(row).eq("id", existing.id)
        : await supabase.from("holdings").insert(row);
      if (error) throw error;
      await invalidate();
      toast.success(existing ? "Asset updated" : "Asset added");
      if (cat === "mutual_fund") onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    const { error } = await supabase.from("holdings").delete().eq("id", existing.id);
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success("Asset deleted");
    onClose();
  }

  const title = existing ? existing.name : cat && !picking ? `Add ${CATEGORY_LABEL[cat].replace(/s$/, "")}` : "Add an asset";

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={existing ? `Edit · ${CATEGORY_LABEL[existing.cat]}` : "Manual asset entry"}
      title={title}
      footer={
        picking ? (
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
        ) : (
          <>
            {existing ? <DeleteButton onConfirm={() => void remove()} busy={busy} /> : <Btn variant="ghost" className="mr-auto" onClick={() => setPicking(true)}>← Change type</Btn>}
            <Btn variant="secondary" onClick={onClose}>
              Cancel
            </Btn>
            <Btn onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : existing ? "Save Changes" : "Add asset"}
            </Btn>
          </>
        )
      }
    >
      {picking ? (
        <div className="space-y-4">
          {[
            { title: "Financial & market", cats: FINANCIAL },
            { title: "Tangible & known", cats: TANGIBLE },
          ].map((g) => (
            <div key={g.title}>
              <SectionTitle>{g.title}</SectionTitle>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {g.cats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => choose(c)}
                    className={cn(
                      "h-11 px-3 rounded-[5px] border text-left text-[12.5px] hover:border-em/50 hover:text-hi",
                      cat === c ? "border-em/60 bg-em/10 text-em" : "border-line bg-ink text-foreground",
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : cat ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {cat === "mutual_fund" ? (
            <SchemePicker
              value={{ code: f("scheme_code"), name: f("name") }}
              onChange={(v) => setForm((s) => ({ ...s, scheme_code: v.code, name: v.name }))}
              error={errors["name"]}
            />
          ) : (
            <Field label="Name" error={errors["name"]} className="sm:col-span-2">
              <TextInput sans value={f("name")} onChange={set("name")} placeholder={placeholderName(cat)} maxLength={120} />
            </Field>
          )}
          <OwnerField value={owner} onChange={setOwner} />
          {cat !== "mutual_fund" ? (
            <Field label="Note">
              <TextInput sans value={f("subtitle")} onChange={set("subtitle")} placeholder="Optional" maxLength={80} />
            </Field>
          ) : (
            <Field label="Folio">
              <TextInput value={f("folio")} onChange={set("folio")} placeholder="10293847/22" maxLength={40} />
            </Field>
          )}
          <CategoryFields cat={cat} f={f} set={set} errors={errors} loans={portfolio?.loans ?? []} />
          {existing ? (
            <div className="sm:col-span-2 rounded-[5px] border border-line bg-ink px-3 py-2.5 flex items-center justify-between">
              <span className="text-mut text-[12px]">Current value</span>
              <span className="n text-hi">{full(existing.value)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function placeholderName(cat: Category) {
  const m: Partial<Record<Category, string>> = {
    equity: "HDFC Bank · Infosys · ITC",
    rsu: "Employer RSU",
    fd: "SBI FD",
    life_policy: "LIC Jeevan Anand 388991734",
    real_estate: "3BHK Flat, Gurugram",
    gold: "Sovereign Gold Bonds",
    cash: "HDFC Salary",
    vehicle: "Car",
    private_equity: "Unlisted shares",
    receivable: "Shubham Jain",
  };
  return m[cat] ?? "";
}

function CategoryFields({
  cat,
  f,
  set,
  errors,
  loans,
}: {
  cat: Category;
  f: (k: string) => string;
  set: (k: string) => (e: { target: { value: string } }) => void;
  errors: Record<string, string>;
  loans: { id: string; name: string }[];
}) {
  const money = (k: string, label: string, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <TextInput inputMode="decimal" value={f(k)} onChange={set(k)} placeholder="0" />
    </Field>
  );
  const date = (k: string, label: string) => (
    <Field label={label} error={errors[k]}>
      <TextInput type="date" value={f(k)} onChange={set(k)} />
    </Field>
  );
  switch (cat) {
    case "mutual_fund":
      return (
        <>
          {money("units", "Units held", "Units on the statement date; SIPs add to this automatically")}
          {money("sip_amount", "Monthly SIP (₹)", "Leave blank if there's no SIP")}
          <Field label="Debit day">
            <SelectInput value={f("sip_day")} onChange={set("sip_day")}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectInput>
          </Field>
        </>
      );
    case "rsu":
      return (
        <>
          {money("quantity", "Vested shares")}
          {money("unvested_quantity", "Unvested shares", "Shown separately, not counted in net worth")}
          {money("unit_price", "Share price")}
          <Field label="Price currency">
            <SelectInput value={f("price_currency")} onChange={set("price_currency")}>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </SelectInput>
          </Field>
        </>
      );
    case "epfo":
    case "nps":
    case "ppf":
      return (
        <>
          {money("amount", "Balance (₹)")}
          {date("as_of", "Balance as of")}
          {money("monthly_contribution", "Monthly contribution (₹)", cat === "epfo" ? "Employee + employer" : undefined)}
          {money("rate", cat === "nps" ? "Expected return % p.a." : "Interest % p.a.")}
        </>
      );
    case "fd":
      return (
        <>
          {money("amount", "Principal (₹)")}
          {money("rate", "Interest % p.a.", "Compounded quarterly")}
          {date("start_date", "Start date")}
          {date("maturity_date", "Maturity date")}
        </>
      );
    case "life_policy":
      return (
        <>
          {money("amount", "Fund / surrender value (₹)")}
          {money("premium", "Premium (₹ / yr)")}
          {date("next_due", "Next premium due")}
          {date("maturity_date", "Maturity date")}
        </>
      );
    case "real_estate":
      return (
        <>
          {money("amount", "Market value (₹)")}
          <Field label="Linked loan" hint="Net equity = market value − loan outstanding">
            <SelectInput value={f("linked_loan_id")} onChange={set("linked_loan_id")}>
              <option value="">None</option>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </>
      );
    case "vehicle":
      return (
        <>
          {money("amount", "Current value / IDV (₹)")}
          {money("rate", "Depreciation % per year")}
          {date("as_of", "Value as of")}
        </>
      );
    case "receivable":
      return (
        <>
          {money("amount", "Principal lent (₹)")}
          {money("rate", "Interest % p.a.", "Optional, simple interest")}
          {date("as_of", "Lent on")}
        </>
      );
    default:
      return (
        <>
          {money("amount", "Value (₹)")}
          {date("as_of", "Value as of")}
        </>
      );
  }
}

function SchemePicker({
  value,
  onChange,
  error,
}: {
  value: { code: string; name: string };
  onChange: (v: { code: string; name: string }) => void;
  error?: string | undefined;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const search = useServerFn(searchSchemes);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ["schemes", debounced],
    queryFn: () => search({ data: { q: debounced } }),
    enabled: debounced.length >= 3,
    staleTime: 60_000,
  });
  const list = useMemo(() => results.data ?? [], [results.data]);
  return (
    <div className="sm:col-span-2">
      <Field label="Scheme (AMFI)" error={error} hint={value.code ? `AMFI code ${value.code}` : "Search by fund name to link the live NAV"}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 w-3.5 h-3.5 text-mut" aria-hidden="true" />
          <TextInput sans className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={value.name || "Parag Parikh Flexi Cap"} />
        </div>
      </Field>
      {debounced.length >= 3 ? (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-[5px] border border-line bg-ink divide-y divide-line">
          {results.isLoading ? (
            <div className="px-3 py-2.5 text-mut text-[12px]">Searching AMFI schemes…</div>
          ) : list.length === 0 ? (
            <div className="px-3 py-2.5 text-mut text-[12px]">No schemes match "{debounced}".</div>
          ) : (
            list.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => {
                  onChange(s);
                  setQ("");
                }}
                className={cn("w-full text-left px-3 py-2 hover:bg-raised/50 flex items-center gap-2", value.code === s.code && "text-em")}
              >
                <span className="truncate">{s.name}</span>
                <span className="ml-auto n text-[11px] text-mut">{s.code}</span>
              </button>
            ))
          )}
        </div>
      ) : value.name ? (
        <div className="mt-2 text-[12px] text-soft truncate">{value.name}</div>
      ) : null}
    </div>
  );
}


