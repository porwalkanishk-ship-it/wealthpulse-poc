import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { addDays, todayISO } from "@/lib/dates";
import { Btn, Field, Modal, SelectInput, TextInput } from "../ui";
import { DeleteButton, OwnerField, numStr, toNum, useDefaultOwner } from "./shared";

export function PolicyModal({ policyId, kind, onClose }: { policyId?: string | undefined; kind?: string | undefined; onClose: () => void }) {
  const { portfolio } = usePortfolio();
  const invalidate = useInvalidatePortfolio();
  const defaultOwner = useDefaultOwner();
  const ex = policyId ? portfolio?.policies.find((p) => p.id === policyId) : undefined;
  const [owner, setOwner] = useState(ex?.member_id ?? defaultOwner);
  const [f, setF] = useState({
    kind: ex?.kind ?? kind ?? "health",
    name: ex?.name ?? "",
    insurer: ex?.insurer ?? "",
    policy_number: ex?.policy_number ?? "",
    cover: numStr(ex?.cover),
    premium: numStr(ex?.premium),
    frequency: ex?.frequency ?? "yearly",
    next_due: ex?.next_due ?? addDays(todayISO(), 30),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    const cover = toNum(f.cover), premium = toNum(f.premium);
    if (!f.name.trim() || !(cover >= 0) || !(premium >= 0) || !f.next_due) return void toast.error("Fill in name, cover, premium and due date");
    setBusy(true);
    const row = { member_id: owner, kind: f.kind, name: f.name.trim().slice(0, 80), insurer: f.insurer.trim() || null, policy_number: f.policy_number.trim() || null, cover, premium, frequency: f.frequency, next_due: f.next_due };
    const { error } = ex ? await supabase.from("policies").update(row).eq("id", ex.id) : await supabase.from("policies").insert(row);
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success(ex ? "Policy updated" : "Policy added");
    onClose();
  }
  async function remove() {
    if (!ex) return;
    const { error } = await supabase.from("policies").delete().eq("id", ex.id);
    if (error) return void toast.error(error.message);
    await invalidate();
    onClose();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="Protection · not counted in net worth"
      title={ex ? ex.name : "Add policy"}
      footer={<>{ex ? <DeleteButton onConfirm={() => void remove()} /> : null}<Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : ex ? "Save Changes" : "Add policy"}</Btn></>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Type"><SelectInput value={f.kind} onChange={set("kind")}><option value="health">Health insurance</option><option value="term">Term life</option><option value="other">Other</option></SelectInput></Field>
        <OwnerField value={owner} onChange={setOwner} />
        <Field label="Policy name"><TextInput sans value={f.name} onChange={set("name")} placeholder="HDFC Ergo Health" maxLength={80} /></Field>
        <Field label="Insurer"><TextInput sans value={f.insurer} onChange={set("insurer")} maxLength={60} /></Field>
        <Field label="Cover / sum insured (₹)"><TextInput inputMode="decimal" value={f.cover} onChange={set("cover")} /></Field>
        <Field label="Premium (₹)"><TextInput inputMode="decimal" value={f.premium} onChange={set("premium")} /></Field>
        <Field label="Paid"><SelectInput value={f.frequency} onChange={set("frequency")}><option value="yearly">Yearly</option><option value="half_yearly">Half-yearly</option><option value="quarterly">Quarterly</option><option value="monthly">Monthly</option></SelectInput></Field>
        <Field label="Next renewal / due"><TextInput type="date" value={f.next_due} onChange={set("next_due")} /></Field>
        <Field label="Policy number" className="sm:col-span-2"><TextInput value={f.policy_number} onChange={set("policy_number")} maxLength={40} /></Field>
      </div>
    </Modal>
  );
}
