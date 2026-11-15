import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractCas, type CasResult } from "@/lib/cas.functions";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { addDays, todayISO } from "@/lib/dates";
import { num } from "@/lib/format";
import { extractPdfText, PdfPasswordError } from "@/lib/pdf-text";
import { Badge, Btn, Field, Modal, SectionTitle, TextInput } from "../ui";
import { OwnerField, useDefaultOwner } from "./shared";

type Step = "pick" | "password" | "reading" | "extracting" | "review" | "importing";

export function CasModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { portfolio } = usePortfolio();
  const { full } = useMoney();
  const invalidate = useInvalidatePortfolio();
  const extract = useServerFn(extractCas);
  const defaultOwner = useDefaultOwner();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [result, setResult] = useState<CasResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [owner, setOwner] = useState(defaultOwner);

  async function read(f: File, pw?: string) {
    if (f.size > 15 * 1024 * 1024) return void toast.error("That file is larger than 15 MB");
    setStep("reading");
    try {
      const { text } = await extractPdfText(f, pw);
      if (text.replace(/\s/g, "").length < 200) throw new Error("This PDF has no readable text. Download the CAS again from CAMS or KFintech.");
      setStep("extracting");
      const res = await extract({ data: { text: text.slice(0, 600_000) } });
      if (res.funds.length === 0) throw new Error("No mutual fund holdings were found in this statement.");
      setResult(res);
      setSelected(new Set(res.funds.map((_, i) => i)));
      const match = portfolio?.members.find((m) => res.investor_name?.toLowerCase().includes(m.name.toLowerCase()));
      if (match) setOwner(match.id);
      setStep("review");
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setPwError(e.incorrect ? "That password didn't work" : null);
        setStep("password");
        return;
      }
      toast.error(e instanceof Error ? e.message : "Couldn't read this statement");
      setStep(pw ? "password" : "pick");
    }
  }

  async function importFunds() {
    if (!result) return;
    setStep("importing");
    const stmt = result.statement_date && /^\d{4}-\d{2}-\d{2}$/.test(result.statement_date) ? result.statement_date : todayISO();
    let added = 0, updated = 0;
    try {
      for (const [i, fund] of result.funds.entries()) {
        if (!selected.has(i)) continue;
        const existing = portfolio?.holdings.find(
          (h) => h.cat === "mutual_fund" && h.member_id === owner && ((fund.scheme_code && h.scheme_code === fund.scheme_code) || (!!fund.folio && h.folio === fund.folio && h.name === fund.scheme_name)),
        );
        const sip = fund.sip_amount && fund.sip_amount > 0 ? fund.sip_amount : null;
        const sipDay = fund.sip_day && fund.sip_day >= 1 ? Math.min(28, fund.sip_day) : 5;
        if (existing) {
          const { error } = await supabase.from("holdings").update({
            units: fund.units, folio: fund.folio ?? existing.folio, isin: fund.isin, as_of: stmt,
            sip_start: existing.sip_active ? addDays(stmt, 1) : existing.sip_start,
            ...(sip && !existing.sip_amount ? { sip_amount: sip, sip_day: sipDay, sip_active: true, sip_start: addDays(stmt, 1) } : {}),
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          if (error) throw error;
          await supabase.from("sip_installments").update({ status: "reconciled" }).eq("holding_id", existing.id).lte("due_date", stmt);
          updated++;
        } else {
          const { error } = await supabase.from("holdings").insert({
            member_id: owner, category: "mutual_fund", name: fund.matched_name ?? fund.scheme_name, folio: fund.folio, isin: fund.isin,
            scheme_code: fund.scheme_code, units: fund.units, nav: fund.nav, nav_date: fund.scheme_code ? null : stmt, as_of: stmt,
            sip_amount: sip, sip_day: sip ? sipDay : null, sip_active: !!sip, sip_start: sip ? addDays(stmt, 1) : null,
          });
          if (error) throw error;
          added++;
        }
      }
      await invalidate();
      toast.success(`Imported ${added + updated} fund${added + updated === 1 ? "" : "s"} from your CAS`);
      onImported();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setStep("review");
    }
  }

  const busy = step === "reading" || step === "extracting" || step === "importing";
  const total = result?.funds.reduce((s, f, i) => (selected.has(i) ? s + (f.market_value ?? 0) : s), 0) ?? 0;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      eyebrow="CAS statement"
      title={step === "review" ? `${result?.funds.length ?? 0} funds found` : "Upload CAS PDF"}
      footer={
        step === "review" ? (
          <>
            <span className="mr-auto n text-[12px] text-mut">Selected value <span className="text-hi">{full(total)}</span></span>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={() => void importFunds()} disabled={selected.size === 0}>Import {selected.size} funds</Btn>
          </>
        ) : step === "password" ? (
          <>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={() => file && void read(file, password)} disabled={!password}>Unlock</Btn>
          </>
        ) : (
          <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
        )
      }
    >
      {step === "pick" ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); void read(f); } }}
          className="rounded-[6px] border border-dashed border-line bg-ink p-8 flex flex-col items-center text-center gap-3"
        >
          <span className="w-12 h-12 rounded-[6px] bg-raised grid place-items-center"><FileUp className="w-5 h-5 text-em" /></span>
          <div className="text-hi font-medium">Drop your CAMS / KFintech CAS here</div>
          <div className="text-mut text-[12px] max-w-sm">Your PDF is opened in this browser. Only its text is read to find each fund's units, folio and SIP. After this one-time import, NAVs and SIP units update automatically.</div>
          <Btn onClick={() => input.current?.click()}>Choose PDF</Btn>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); void read(f); } }} />
        </div>
      ) : step === "password" ? (
        <div className="space-y-3">
          <p className="text-soft text-[12.5px]">This statement is password-protected. CAS passwords are usually your PAN in capitals (e.g. ABCDE1234F).</p>
          <Field label="PDF password" error={pwError}>
            <TextInput type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && file && password && void read(file, password)} />
          </Field>
        </div>
      ) : busy ? (
        <div className="py-10 flex flex-col items-center gap-3 text-center">
          <span className="w-8 h-8 rounded-full border-2 border-line border-t-em animate-spin" />
          <div className="text-hi">{step === "reading" ? "Opening statement…" : step === "extracting" ? "Finding your funds and matching AMFI schemes…" : "Importing holdings…"}</div>
          <div className="text-mut text-[12px]">{step === "extracting" ? "This can take up to a minute for long statements." : ""}</div>
        </div>
      ) : result ? (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <OwnerField value={owner} onChange={setOwner} />
            <div className="text-[12px] text-mut self-end pb-2">Statement {result.statement_date ?? "date not found"}{result.investor_name ? ` · ${result.investor_name}` : ""}</div>
          </div>
          <SectionTitle>Review before importing</SectionTitle>
          <div className="divide-y divide-line border border-line rounded-[5px]">
            {result.funds.map((f, i) => (
              <label key={i} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-raised/30">
                <input type="checkbox" className="mt-1 accent-[var(--em)]" checked={selected.has(i)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-hi">{f.matched_name ?? f.scheme_name}</div>
                  <div className="n text-[11px] text-mut flex flex-wrap gap-x-3">
                    <span>Folio {f.folio ?? "—"}</span><span>{num(f.units, 3)} units</span>
                    {f.sip_amount ? <span className="text-em">SIP {full(f.sip_amount)} · day {f.sip_day ?? "?"}</span> : null}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="n text-hi">{f.market_value ? full(f.market_value) : "—"}</div>
                  {f.scheme_code ? <Badge tone="em" className="mt-1">AMFI {f.scheme_code}</Badge> : <Badge tone="amber" className="mt-1">No live NAV match</Badge>}
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
