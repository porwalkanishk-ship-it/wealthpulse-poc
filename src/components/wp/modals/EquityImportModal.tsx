import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { num } from "@/lib/format";
import {
  classifyRow,
  csvToGrid,
  findHeader,
  matchRows,
  readRows,
  TEMPLATE_CSV,
  type Cell,
  type ColumnKey,
  type ColumnMap,
  type MatchResult,
} from "@/lib/zerodha-import";
import type { SecurityLite } from "@/lib/securities";
import { Badge, Btn, Field, Modal, SelectInput } from "../ui";
import { SecurityPicker, type FoundSecurity } from "./EquityModal";

type Step = "pick" | "map" | "reading" | "review" | "saving";

const LABEL: Record<ColumnKey, string> = { symbol: "Symbol", isin: "ISIN", quantity: "Quantity", avgPrice: "Average price" };

async function readGrid(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return csvToGrid(await file.text());
  const readXlsxFile = (await import("read-excel-file/browser")).default;
  const sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: Cell[][] }[];
  // Use the first sheet that looks like a holdings table.
  const hit = sheets.find((s) => findHeader(s.data)) ?? sheets[0];
  return hit?.data ?? [];
}

interface Row extends MatchResult {
  security: (SecurityLite & { id?: string }) | null;
  skip: boolean;
}

export function EquityImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { portfolio } = usePortfolio();
  const invalidate = useInvalidatePortfolio();
  const input = useRef<HTMLInputElement>(null);
  const writable = useMemo(() => (portfolio?.profiles ?? []).filter((p) => p.writable), [portfolio]);
  const [owner, setOwner] = useState(() => (writable.find((p) => p.isMe) ?? writable[0])?.id ?? "");
  const [step, setStep] = useState<Step>("pick");
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [header, setHeader] = useState<{ headerRow: number; map: ColumnMap } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [searching, setSearching] = useState<number | null>(null);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);

  async function onFile(f: File) {
    setProblem(null);
    setStep("reading");
    try {
      const g = await readGrid(f);
      setGrid(g);
      const h = findHeader(g);
      if (!h) {
        setHeader({ headerRow: 0, map: {} });
        setStep("map");
        return;
      }
      setHeader({ headerRow: h.headerRow, map: h.map });
      if (h.missing.length) setStep("map");
      else await review(g, { headerRow: h.headerRow, map: h.map });
    } catch {
      setProblem("Couldn't read that file. Use the XLSX from Zerodha Console, or a CSV.");
      setStep("pick");
    }
  }

  async function review(g: Cell[][], h: { headerRow: number; map: ColumnMap }) {
    setStep("reading");
    const { rows: parsed, skipped } = readRows(g, h);
    if (parsed.length === 0) {
      setProblem("No holdings were found in that file.");
      setStep("pick");
      return;
    }
    const isins = [...new Set(parsed.map((r) => r.isin).filter((x): x is string => !!x))];
    const syms = [...new Set(parsed.map((r) => r.symbol).filter((x): x is string => !!x))];
    const found: SecurityLite[] = [];
    for (let i = 0; i < Math.max(isins.length, syms.length); i += 150) {
      const [a, b] = await Promise.all([
        isins.length ? supabase.from("securities").select("id, symbol, name, exchange, country, currency, isin").in("isin", isins.slice(i, i + 150)) : { data: [] },
        syms.length ? supabase.from("securities").select("id, symbol, name, exchange, country, currency, isin").in("symbol", syms.slice(i, i + 150)) : { data: [] },
      ]);
      found.push(...((a.data ?? []) as SecurityLite[]), ...((b.data ?? []) as SecurityLite[]));
    }
    const matched = matchRows(parsed, found);
    setRows(matched.map((m) => ({ ...m, skip: false })));
    setSkippedNote(skipped.length ? `${skipped.length} row${skipped.length === 1 ? "" : "s"} without a quantity were ignored.` : null);
    setStep("review");
  }

  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const importable = rows.filter((r) => r.kind === "equity" && r.security && !r.skip);
  const gold = rows.filter((r) => r.kind === "gold_bond");
  const unmatched = rows.filter((r) => r.kind === "equity" && !r.security && !r.skip);
  const mfCount = rows.filter((r) => r.kind === "mutual_fund").length;

  async function save() {
    setStep("saving");
    try {
      if (importable.length) {
        // One row per owner and stock: importing again replaces quantity and average price.
        const payload = importable.map((r) => ({
          owner_profile_id: owner,
          security_id: (r.security as { id: string }).id,
          quantity: r.row.quantity,
          avg_buy_price: r.row.avgPrice,
          currency: r.security!.currency,
        }));
        const { error } = await supabase.from("equity_holdings").upsert(payload, { onConflict: "owner_profile_id,security_id" });
        if (error) throw new Error(error.message);
      }
      for (const g of gold.filter((x) => !x.skip)) {
        const name = `Sovereign Gold Bond ${g.row.symbol ?? g.row.isin}`;
        const amount = Math.round(g.row.quantity * (g.row.avgPrice ?? 0));
        const { data: ex } = await supabase.from("holdings").select("id").eq("owner_profile_id", owner).eq("category", "gold").eq("name", name).maybeSingle();
        const row = { owner_profile_id: owner, category: "gold", name, subtitle: `${num(g.row.quantity, 0)} units, valued at cost`, amount, as_of: new Date().toISOString().slice(0, 10) };
        const res = ex ? await supabase.from("holdings").update(row).eq("id", ex.id) : await supabase.from("holdings").insert(row);
        if (res.error) throw new Error(res.error.message);
      }
      await invalidate();
      toast.success(`Imported ${importable.length} stock${importable.length === 1 ? "" : "s"}${gold.length ? ` and ${gold.length} gold bond${gold.length === 1 ? "" : "s"}` : ""}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setStep("review");
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "wealthpulse-holdings-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const busy = step === "reading" || step === "saving";
  const cols = (grid[header?.headerRow ?? 0] ?? []).map((c, i) => ({ i, label: String(c ?? "").trim() || `Column ${i + 1}` }));
  const mapOk = !!header && (header.map.quantity !== undefined) && (header.map.symbol !== undefined || header.map.isin !== undefined);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      eyebrow="Demat equities"
      title="Import holdings"
      footer={
        step === "review" ? (
          <>
            <span className="mr-auto text-[12px] text-mut">
              {importable.length} to import{unmatched.length ? ` · ${unmatched.length} unmatched` : ""}
            </span>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn onClick={() => void save()} disabled={importable.length + gold.length === 0}>Import</Btn>
          </>
        ) : step === "map" ? (
          <>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn disabled={!mapOk} onClick={() => header && void review(grid, header)}>Continue</Btn>
          </>
        ) : (
          <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
        )
      }
    >
      {step === "pick" ? (
        <div className="space-y-3">
          <Field label="Whose holdings are these?">
            <SelectInput value={owner} onChange={(e) => setOwner(e.target.value)}>
              {writable.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}{p.isMe ? " (you)" : ""}</option>
              ))}
            </SelectInput>
          </Field>
          <div className="rounded-[6px] border border-dashed border-line bg-ink p-8 flex flex-col items-center text-center gap-3">
            <span className="w-12 h-12 rounded-[6px] bg-raised grid place-items-center"><FileUp className="w-5 h-5 text-em" /></span>
            <div className="text-hi font-medium">Upload your holdings file</div>
            <div className="text-mut text-[12px] max-w-sm">
              Zerodha Console: Portfolio, Holdings, Download XLSX. Other brokers: use our CSV template. The file is read in this browser and not stored.
            </div>
            <div className="flex gap-2">
              <Btn onClick={() => input.current?.click()} disabled={!owner}>Choose file</Btn>
              <Btn variant="secondary" onClick={downloadTemplate}>CSV template</Btn>
            </div>
            <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>
          {problem ? <p className="text-co text-[12.5px]" role="alert">{problem}</p> : null}
        </div>
      ) : step === "map" ? (
        <div className="space-y-3">
          <p className="text-soft text-[12.5px]">We couldn't recognise every column. Tell us which column holds what.</p>
          {(["symbol", "isin", "quantity", "avgPrice"] as ColumnKey[]).map((k) => (
            <Field key={k} label={`${LABEL[k]}${k === "quantity" ? " (required)" : k === "avgPrice" ? " (optional)" : ""}`}>
              <SelectInput
                value={header?.map[k] ?? ""}
                onChange={(e) => setHeader((h) => (h ? { ...h, map: { ...h.map, [k]: e.target.value === "" ? undefined : Number(e.target.value) } } : h))}
              >
                <option value="">Not in file</option>
                {cols.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </SelectInput>
            </Field>
          ))}
          <p className="text-[11.5px] text-mut">Symbol or ISIN is needed, along with quantity.</p>
        </div>
      ) : busy ? (
        <div className="py-10 flex flex-col items-center gap-3 text-center">
          <span className="w-8 h-8 rounded-full border-2 border-line border-t-em animate-spin" />
          <div className="text-hi">{step === "saving" ? "Importing…" : "Reading file…"}</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[12px] text-mut">
            {mfCount ? `${mfCount} mutual fund row${mfCount === 1 ? "" : "s"} skipped: funds come from your CAS. ` : ""}
            {skippedNote}
          </div>
          <div className="divide-y divide-line border border-line rounded-[5px]">
            {rows.map((r, i) => {
              if (r.kind === "mutual_fund") return null;
              return (
                <div key={i} className={`px-3 py-2.5 ${r.skip ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-hi truncate">
                        {r.kind === "gold_bond" ? `Sovereign Gold Bond ${r.row.symbol ?? ""}` : r.security ? r.security.name : r.row.symbol ?? r.row.isin}
                      </div>
                      <div className="n text-[11px] text-mut">
                        {num(r.row.quantity, 0)} @ {r.row.avgPrice ? num(r.row.avgPrice, 2) : "—"}
                        {r.security ? ` · ${r.security.exchange}:${r.security.symbol}` : ""}
                      </div>
                    </div>
                    {r.kind === "gold_bond" ? <Badge tone="amber">goes to Gold</Badge> : r.security ? <Badge tone="em">matched by {r.by}</Badge> : <Badge tone="amber">no match</Badge>}
                    {!r.security && r.kind === "equity" ? (
                      <>
                        <Btn variant="ghost" size="sm" onClick={() => setSearching(searching === i ? null : i)}>Search</Btn>
                        <Btn variant="ghost" size="sm" onClick={() => setRow(i, { skip: !r.skip })}>{r.skip ? "Include" : "Skip"}</Btn>
                      </>
                    ) : null}
                  </div>
                  {searching === i ? (
                    <div className="mt-2">
                      <SecurityPicker
                        value={null}
                        onPick={(s: FoundSecurity | null) => {
                          if (s) setRow(i, { security: s, by: "symbol" });
                          setSearching(null);
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {unmatched.length ? <p className="text-[12px] text-amber">Unmatched rows are left out unless you search for the company. If the company list is empty, refresh from the Holdings page first.</p> : null}
        </div>
      )}
    </Modal>
  );
}

export { classifyRow };
