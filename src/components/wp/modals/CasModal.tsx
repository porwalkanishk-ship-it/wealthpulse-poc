import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractCas, matchCasFunds, type MatchedFund } from "@/lib/cas.functions";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { fmtDayMonYear, todayISO } from "@/lib/dates";
import { num } from "@/lib/format";
import { extractPdfText, PdfPasswordError } from "@/lib/pdf-text";
import { parseCasText, type ParsedFund } from "@/lib/cas-parser";
import { redactCasText } from "@/lib/cas-redact";
import { detectSip, importDateIST, importWindow, isFlagged, valueDiff } from "@/lib/cas-rules";
import { Badge, Btn, Field, Modal, SectionTitle, SelectInput, TextInput } from "../ui";

type Step = "pick" | "password" | "reading" | "matching" | "review" | "importing";

interface Row {
  fund: ParsedFund;
  match: MatchedFund;
  include: boolean;
  holdingId: string | null;
  sip: { active: boolean; amount: string; day: string };
  suggested: { amount: number; day: number; months: number } | null;
}

const SUMMARY_MSG =
  "This looks like a Summary statement. WealthPulse needs a Detailed statement for the period since inception. Request one from CAMS (camsonline.com) or KFintech (mfs.kfintech.com): choose Detailed, from the date of your first investment to today.";

export function CasModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { portfolio } = usePortfolio();
  const { full } = useMoney();
  const invalidate = useInvalidatePortfolio();
  const extract = useServerFn(extractCas);
  const match = useServerFn(matchCasFunds);
  const input = useRef<HTMLInputElement>(null);

  const writable = useMemo(() => (portfolio?.profiles ?? []).filter((p) => p.writable), [portfolio]);
  const [owner, setOwner] = useState(() => (writable.find((p) => p.isMe) ?? writable[0])?.id ?? "");
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<"parser" | "ai">("parser");
  const [period, setPeriod] = useState<{ from: string | null; to: string }>({ from: null, to: todayISO() });
  const [ack, setAck] = useState(false);

  const imports = useQuery({
    queryKey: ["cas_imports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cas_imports").select("profile_id, imported_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const win = useMemo(() => {
    const dates = (imports.data ?? []).filter((i) => i.profile_id === owner).map((i) => importDateIST(i.imported_at));
    return importWindow(dates, todayISO());
  }, [imports.data, owner]);
  const locked = !imports.isLoading && !win.open;
  const ownerName = writable.find((p) => p.id === owner)?.display_name ?? "";

  async function read(f: File, pw?: string) {
    setProblem(null);
    if (f.size > 15 * 1024 * 1024) {
      setProblem("That file is larger than 15 MB.");
      return;
    }
    setStep("reading");
    try {
      const { text } = await extractPdfText(f, pw);
      if (text.replace(/\s/g, "").length < 200) throw new Error("This PDF has no readable text. Download the CAS again from CAMS or KFintech.");
      let funds: ParsedFund[] = [];
      let from: string | null = null;
      let to: string | null = null;
      let src: "parser" | "ai" = "parser";

      const parsed = parseCasText(text);
      if (parsed.kind === "summary") throw new Error(SUMMARY_MSG);
      if (parsed.kind === "detailed" && parsed.funds.length > 0) {
        funds = parsed.funds;
        from = parsed.statement_from;
        to = parsed.statement_to;
      } else {
        // Fallback: AI reads a copy with name, PAN, email, phone and address removed.
        const { data: allowed, error } = await supabase.rpc("consume_cas_ai_call");
        if (error) throw new Error("We couldn't check your daily limit. Please try again.");
        if (!allowed) throw new Error("This statement needs the AI reader, and you've used today's 3 reads. Try again tomorrow, or download a fresh Detailed statement from CAMS or KFintech.");
        const names = (portfolio?.profiles ?? []).map((p) => p.display_name);
        const res = await extract({ data: { text: redactCasText(text, names).slice(0, 600_000) } });
        src = "ai";
        to = res.statement_date && /^\d{4}-\d{2}-\d{2}$/.test(res.statement_date) ? res.statement_date : null;
        funds = res.funds.map((x) => ({
          scheme_name: x.scheme_name,
          isin: x.isin,
          folio: x.folio,
          opening_units: 0,
          closing_units: x.units,
          closing_nav: x.nav,
          nav_date: to,
          market_value: x.market_value,
          cost_value: x.cost_value,
          transactions: [],
          balance_ok: true,
        }));
        (funds as (ParsedFund & { _sip?: { amount: number; day: number } })[]).forEach((fd, i) => {
          const r = res.funds[i];
          if (r?.sip_amount) (fd as { _sip?: { amount: number; day: number } })._sip = { amount: r.sip_amount, day: r.sip_day ?? 5 };
        });
      }
      funds = funds.filter((fd) => fd.closing_units > 0);
      if (funds.length === 0) throw new Error("No mutual fund holdings were found in this statement.");
      const stmtTo = to ?? todayISO();

      setStep("matching");
      const matches = await match({ data: { funds: funds.map((fd) => ({ scheme_name: fd.scheme_name, isin: fd.isin })) } });
      const mine = (portfolio?.holdings ?? []).filter((h) => h.cat === "mutual_fund" && h.owner_profile_id === owner);
      const next: Row[] = funds.map((fd, i) => {
        const m = matches[i] ?? { scheme_code: null, matched_name: null, nav: null, nav_date: null };
        const existing =
          mine.find((h) => !!fd.isin && h.isin === fd.isin && (h.folio ?? "") === (fd.folio ?? "")) ??
          mine.find((h) => !!m.scheme_code && h.scheme_code === m.scheme_code && (h.folio ?? "") === (fd.folio ?? ""));
        const suggested = src === "parser" ? detectSip(fd.transactions, stmtTo) : null;
        const ai = (fd as { _sip?: { amount: number; day: number } })._sip;
        const sip = suggested
          ? { active: true, amount: String(suggested.amount), day: String(suggested.day) }
          : ai
            ? { active: true, amount: String(ai.amount), day: String(ai.day) }
            : existing?.sip_active && existing.sip_amount
              ? { active: true, amount: String(existing.sip_amount), day: String(existing.sip_day ?? 5) }
              : { active: false, amount: "", day: "5" };
        return { fund: fd, match: m, include: true, holdingId: existing?.id ?? null, sip, suggested };
      });
      setRows(next);
      setSource(src);
      setPeriod({ from, to: stmtTo });
      setAck(false);
      setStep("review");
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setPwError(e.incorrect ? "That password didn't work" : null);
        setStep("password");
        return;
      }
      setProblem(e instanceof Error ? e.message : "Couldn't read this statement");
      setStep(pw ? "password" : "pick");
    }
  }

  const appValue = (r: Row) => (r.match.nav ? r.fund.closing_units * r.match.nav : null);
  const flagged = (r: Row) => isFlagged(valueDiff(appValue(r), r.fund.market_value));
  const flaggedCount = rows.filter((r) => r.include && flagged(r)).length;
  const included = rows.filter((r) => r.include);
  const sipInvalid = included.some((r) => r.sip.active && !(Number(r.sip.amount) > 0 && Number(r.sip.day) >= 1 && Number(r.sip.day) <= 28));

  async function importFunds() {
    setStep("importing");
    const funds = included.map((r) => ({
      holding_id: r.holdingId,
      name: r.match.matched_name ?? r.fund.scheme_name,
      isin: r.fund.isin,
      folio: r.fund.folio,
      units: r.fund.closing_units,
      scheme_code: r.match.scheme_code,
      nav: r.match.nav,
      nav_date: r.match.nav_date,
      statement_nav: r.fund.closing_nav,
      statement_value: r.fund.market_value,
      sip: { active: r.sip.active, amount: Number(r.sip.amount) || 0, day: Number(r.sip.day) || 5 },
      transactions: r.fund.transactions,
    }));
    const { data, error } = await supabase.rpc("import_cas", {
      _profile_id: owner,
      _statement: { source, statement_from: period.from, statement_to: period.to, funds } as never,
    });
    if (error) {
      toast.error(error.message);
      setStep("review");
      return;
    }
    const res = data as { added?: number; updated?: number; next_import?: string } | null;
    await Promise.all([invalidate(), imports.refetch()]);
    toast.success(`Imported ${(res?.added ?? 0) + (res?.updated ?? 0)} funds. Next statement opens ${res?.next_import ? fmtDayMonYear(res.next_import) : "in 90 days"}.`);
    onImported();
    onClose();
  }

  const busy = step === "reading" || step === "matching" || step === "importing";
  const total = included.reduce((s, r) => s + (r.fund.market_value ?? 0), 0);
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      eyebrow="CAS statement"
      title={step === "review" ? `${rows.length} funds found` : "Upload CAS PDF"}
      footer={
        step === "review" ? (
          <>
            <span className="mr-auto n text-[12px] text-mut">Statement value <span className="text-hi">{full(total)}</span></span>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={() => void importFunds()} disabled={included.length === 0 || sipInvalid || (flaggedCount > 0 && !ack)}>
              Import {included.length} fund{included.length === 1 ? "" : "s"}
            </Btn>
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
        <div className="space-y-3">
          <Field label="Whose statement is this?" hint="A statement belongs to one person (one PAN). It never applies to the whole household.">
            <SelectInput value={owner} onChange={(e) => { setOwner(e.target.value); setProblem(null); }}>
              {writable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}{p.isMe ? " (you)" : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
          {locked ? (
            <div className="rounded-[6px] border border-line bg-ink p-5 text-center space-y-1">
              <div className="text-hi font-medium">The next statement for {ownerName} opens on {win.opensOn ? fmtDayMonYear(win.opensOn) : "—"}</div>
              <div className="text-mut text-[12px]">One upload every 90 days keeps units accurate. Until then you can add a fund by hand from Holdings. It shows “unverified” until the next statement covers it.</div>
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && owner) { setFile(f); void read(f); } }}
              className="rounded-[6px] border border-dashed border-line bg-ink p-8 flex flex-col items-center text-center gap-3"
            >
              <span className="w-12 h-12 rounded-[6px] bg-raised grid place-items-center"><FileUp className="w-5 h-5 text-em" /></span>
              <div className="text-hi font-medium">Drop a Detailed CAS (since inception) here</div>
              <div className="text-mut text-[12px] max-w-sm">
                The PDF is opened in this browser and never stored. Only the funds and transactions are kept. Get it from CAMS or KFintech: choose “Detailed” from your first investment date.
              </div>
              <Btn onClick={() => input.current?.click()} disabled={!owner}>Choose PDF</Btn>
              <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); void read(f); } e.target.value = ""; }} />
            </div>
          )}
          {problem ? <p className="text-co text-[12.5px]" role="alert">{problem}</p> : null}
        </div>
      ) : step === "password" ? (
        <div className="space-y-3">
          <p className="text-soft text-[12.5px]">This statement is password-protected. CAS passwords are usually your PAN in capitals (e.g. ABCDE1234F).</p>
          <Field label="PDF password" error={pwError ?? problem}>
            <TextInput type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && file && password && void read(file, password)} />
          </Field>
        </div>
      ) : busy ? (
        <div className="py-10 flex flex-col items-center gap-3 text-center">
          <span className="w-8 h-8 rounded-full border-2 border-line border-t-em animate-spin" />
          <div className="text-hi">{step === "reading" ? "Reading statement…" : step === "matching" ? "Matching funds to AMFI schemes…" : "Importing…"}</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[12px] text-mut">
            For {ownerName} · {period.from ? `${fmtDayMonYear(period.from)} to ` : "up to "}{fmtDayMonYear(period.to)}
            {source === "ai" ? " · read with the AI fallback, so no transaction history" : ""}
          </div>
          {rows.some((r) => r.fund.transactions.length > 0 && r.fund.opening_units > 0) ? (
            <p className="text-[12px] text-amber">Some funds start with units already held, so earlier history is missing. They import, but a since-inception statement would be more accurate.</p>
          ) : null}
          <SectionTitle>Review before importing</SectionTitle>
          <div className="divide-y divide-line border border-line rounded-[5px]">
            {rows.map((r, i) => {
              const app = appValue(r);
              const diff = valueDiff(app, r.fund.market_value);
              const bad = isFlagged(diff);
              return (
                <div key={i} className={`px-3 py-3 space-y-2 ${r.include ? "" : "opacity-50"}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-[var(--em)]" checked={r.include} onChange={() => setRow(i, { include: !r.include })} />
                    <div className="min-w-0 flex-1">
                      <div className="text-hi truncate">{r.match.matched_name ?? r.fund.scheme_name}</div>
                      <div className="n text-[11px] text-mut flex flex-wrap gap-x-3">
                        <span>Folio {r.fund.folio ?? "—"}</span>
                        <span>{num(r.fund.closing_units, 3)} units</span>
                        <span>NAV {r.fund.closing_nav ? num(r.fund.closing_nav, 4) : "—"}</span>
                        {r.holdingId ? <span className="text-em">updates existing fund</span> : <span>new fund</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 n text-[12px]">
                      <div className="text-hi">{r.fund.market_value ? full(r.fund.market_value) : "—"} <span className="text-mut">statement</span></div>
                      <div className="text-soft">{app !== null ? full(app) : "—"} <span className="text-mut">app (AMFI)</span></div>
                      {bad ? <Badge tone="amber" className="mt-1">differs {(Math.abs(diff ?? 0) * 100).toFixed(1)}%</Badge> : null}
                      {!r.match.scheme_code ? <Badge tone="amber" className="mt-1">NAV missing</Badge> : null}
                      {!r.fund.balance_ok ? <Badge tone="amber" className="mt-1">balance mismatch</Badge> : null}
                    </div>
                  </label>
                  {r.include ? (
                    <div className="pl-7 flex flex-wrap items-center gap-3 text-[12px]">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-[var(--em)]" checked={r.sip.active} onChange={(e) => setRow(i, { sip: { ...r.sip, active: e.target.checked } })} />
                        <span className="text-soft">Monthly SIP</span>
                      </label>
                      {r.sip.active ? (
                        <>
                          <span className="flex items-center gap-1">₹<TextInput className="!mt-0 !h-7 !w-24" inputMode="decimal" value={r.sip.amount} onChange={(e) => setRow(i, { sip: { ...r.sip, amount: e.target.value } })} aria-label="SIP amount" /></span>
                          <span className="flex items-center gap-1">day<TextInput className="!mt-0 !h-7 !w-14" inputMode="numeric" value={r.sip.day} onChange={(e) => setRow(i, { sip: { ...r.sip, day: e.target.value } })} aria-label="SIP day of month" /></span>
                        </>
                      ) : null}
                      {r.suggested ? <span className="text-mut">Suggested from {r.suggested.months} months of purchases</span> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {flaggedCount > 0 ? (
            <label className="flex items-start gap-2 text-[12.5px] text-amber">
              <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>{flaggedCount} fund{flaggedCount === 1 ? "" : "s"} differ by more than 1% from the statement. That is usually a timing gap in NAV dates. I've checked and want to import anyway.</span>
            </label>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
