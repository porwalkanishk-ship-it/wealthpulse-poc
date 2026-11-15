import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { fmtMonthYear, todayISO } from "@/lib/dates";
import { balanceOn, projectLoan } from "@/lib/finance";
import { Btn, Field, Modal, TextInput } from "../ui";
import { toNum } from "./shared";

export function PrepayModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const { portfolio, today } = usePortfolio();
  const { full } = useMoney();
  const invalidate = useInvalidatePortfolio();
  const loan = portfolio?.loans.find((l) => l.id === loanId);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!loan) return null;
  const terms = { outstanding: Number(loan.outstanding), rate: Number(loan.rate), emi: Number(loan.emi), emi_day: loan.emi_day, as_of: loan.as_of };
  const balAt = balanceOn(terms, date);
  const amt = toNum(amount);
  const ok = amt > 0 && amt <= balAt && date <= today && date >= loan.as_of;
  const after = ok ? projectLoan({ ...terms, outstanding: balAt - amt, as_of: date }, today) : null;
  const saved = after ? loan.projection.remainingInterest - after.remainingInterest : 0;

  async function save() {
    if (!ok) return void toast.error(date > today ? "Pick today or an earlier date" : `Enter up to ${full(balAt)}`);
    setBusy(true);
    const { error } = await supabase.from("loans").update({ outstanding: balAt - amt, as_of: date }).eq("id", loan!.id);
    if (!error) await supabase.from("loan_events").insert({ loan_id: loan!.id, kind: "prepayment", amount: amt, event_date: date, note: note.trim().slice(0, 120) || null });
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success(`Prepayment of ${full(amt)} recorded`);
    onClose();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="Record prepayment"
      title={loan.name}
      width="max-w-[480px]"
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={() => void save()} disabled={busy || !ok}>{busy ? "Saving…" : "Record Prepayment"}</Btn></>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Amount (₹)" hint={`Balance on that date ${full(balAt)}`}><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" autoFocus /></Field>
        <Field label="Paid on"><TextInput type="date" value={date} max={today} min={loan.as_of} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note" className="sm:col-span-2"><TextInput sans value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bonus, optional" maxLength={120} /></Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px bg-line border border-line rounded-[6px] overflow-hidden">
        <div className="bg-ink p-3.5"><div className="text-[11px] text-mut">New payoff</div><div className="n text-[16px] font-semibold mt-1 text-hi">{after?.payoffDate ? fmtMonthYear(after.payoffDate) : "—"}</div></div>
        <div className="bg-ink p-3.5"><div className="text-[11px] text-mut">Interest saved</div><div className="n text-[16px] font-semibold mt-1 text-em">{after ? full(Math.max(0, saved)) : "—"}</div></div>
      </div>
      <p className="mt-3 text-[11.5px] text-mut">EMI stays the same; the loan finishes sooner.</p>
    </Modal>
  );
}
