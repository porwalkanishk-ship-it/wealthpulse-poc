import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { fmtMonthYear, todayISO } from "@/lib/dates";
import { projectLoan } from "@/lib/finance";
import { LOAN_KIND_LABEL } from "@/lib/portfolio";
import { Btn, Field, Modal, SelectInput, TextInput } from "../ui";
import { DeleteButton, OwnerField, PrivateToggle, numStr, toNum, useDefaultOwner } from "./shared";

export function LoanModal({ loanId, kind, onClose }: { loanId?: string | undefined; kind?: string | undefined; onClose: () => void }) {
  const { portfolio, today } = usePortfolio();
  const invalidate = useInvalidatePortfolio();
  const defaultOwner = useDefaultOwner();
  const ex = loanId ? portfolio?.loans.find((l) => l.id === loanId) : undefined;
  const [owner, setOwner] = useState(ex?.owner_profile_id ?? defaultOwner);
  const [hidden, setHidden] = useState(ex?.is_hidden ?? false);
  const [f, setF] = useState({
    kind: ex?.kind ?? kind ?? "home",
    name: ex?.name ?? (kind ? LOAN_KIND_LABEL[kind] ?? "" : ""),
    account_ref: ex?.account_ref ?? "",
    rate_type: ex?.rate_type ?? "floating",
    original_principal: numStr(ex?.original_principal),
    outstanding: ex ? numStr(Math.round(ex.projection.balance)) : "",
    rate: numStr(ex?.rate),
    emi: numStr(ex?.emi),
    emi_day: String(ex?.emi_day ?? 5),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const out = toNum(f.outstanding), rate = toNum(f.rate), emi = toNum(f.emi), orig = toNum(f.original_principal);
  const valid = f.name.trim() && out >= 0 && rate >= 0 && rate < 40 && emi > 0;
  const preview = valid ? projectLoan({ outstanding: out, rate, emi, emi_day: Number(f.emi_day), as_of: today }, today) : null;

  async function save() {
    if (!valid) return void toast.error("Fill in balance, rate and EMI");
    setBusy(true);
    const row = {
      owner_profile_id: owner,
      is_hidden: hidden,
      kind: f.kind,
      name: f.name.trim().slice(0, 80),
      account_ref: f.account_ref.replace(/\D/g, "").slice(-4) || null,
      rate_type: f.rate_type,
      original_principal: Number.isFinite(orig) && orig > 0 ? orig : out,
      outstanding: out,
      rate,
      emi,
      emi_day: Number(f.emi_day),
      as_of: todayISO(),
    };
    const res = ex ? await supabase.from("loans").update(row).eq("id", ex.id) : await supabase.from("loans").insert(row).select("id").single();
    if (!res.error && ex) await supabase.from("loan_events").insert({ loan_id: ex.id, kind: "terms_change", amount: 0, note: `Rate ${rate}%, EMI ₹${emi}` });
    if (!res.error && hidden) {
      const loanId = ex?.id ?? (res.data as { id: string } | null)?.id;
      if (loanId) await supabase.from("holdings").update({ is_hidden: true }).eq("linked_loan_id", loanId);
    }
    setBusy(false);
    if (res.error) return void toast.error(res.error.message);
    await invalidate();
    toast.success(ex ? "Loan terms updated" : "Loan added");
    onClose();
  }
  async function remove() {
    if (!ex) return;
    const { error } = await supabase.from("loans").delete().eq("id", ex.id);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success("Loan removed");
    onClose();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={ex ? "Adjust loan terms" : "Add liability"}
      title={ex ? ex.name : `Add ${LOAN_KIND_LABEL[f.kind] ?? "loan"}`}
      footer={
        <>
          {ex ? <DeleteButton onConfirm={() => void remove()} /> : null}
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : ex ? "Save Changes" : "Add loan"}</Btn>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Type">
          <SelectInput value={f.kind} onChange={set("kind")}>
            {Object.entries(LOAN_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectInput>
        </Field>
        <OwnerField value={owner} onChange={setOwner} />
        <PrivateToggle value={hidden} onChange={setHidden} note="Any asset linked to this loan will be hidden too." />
        <Field label="Lender / name"><TextInput sans value={f.name} onChange={set("name")} placeholder="HDFC Home Loan" maxLength={80} /></Field>
        <Field label="Account (last 4)"><TextInput value={f.account_ref} onChange={set("account_ref")} placeholder="4920" maxLength={4} /></Field>
        <Field label="Original loan amount (₹)"><TextInput inputMode="decimal" value={f.original_principal} onChange={set("original_principal")} /></Field>
        <Field label="Outstanding today (₹)"><TextInput inputMode="decimal" value={f.outstanding} onChange={set("outstanding")} /></Field>
        <Field label="Interest % p.a."><TextInput inputMode="decimal" value={f.rate} onChange={set("rate")} /></Field>
        <Field label="Rate type">
          <SelectInput value={f.rate_type} onChange={set("rate_type")}><option value="floating">Floating</option><option value="fixed">Fixed</option></SelectInput>
        </Field>
        <Field label="Monthly EMI (₹)"><TextInput inputMode="decimal" value={f.emi} onChange={set("emi")} /></Field>
        <Field label="EMI day">
          <SelectInput value={f.emi_day} onChange={set("emi_day")}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</SelectInput>
        </Field>
        <div className="sm:col-span-2 rounded-[5px] border border-line bg-ink px-3 py-2.5 n text-[12px] flex justify-between">
          <span className="font-sans text-mut">Debt-free date</span>
          <span className={preview?.months === null ? "text-co" : "text-em"}>
            {!preview ? "—" : preview.months === null ? "EMI doesn't cover interest" : preview.payoffDate ? `${fmtMonthYear(preview.payoffDate)} · ${preview.months} mo` : "—"}
          </span>
        </div>
      </div>
    </Modal>
  );
}
