import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidatePortfolio, usePortfolio } from "@/lib/data";
import { Btn, Field, Modal, TextInput } from "../ui";
import { DeleteButton, OwnerField, PrivateToggle, toNum, useDefaultOwner } from "./shared";

export interface FoundSecurity {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  isin: string | null;
}

/** Search the shared securities list. Never calls an outside provider while typing. */
export function SecurityPicker({ value, onPick }: { value: FoundSecurity | null; onPick: (s: FoundSecurity | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundSecurity[]>([]);
  const [empty, setEmpty] = useState<boolean | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_securities", { _q: term, _limit: 10 });
      setResults((data ?? []) as FoundSecurity[]);
      if (!data?.length) {
        const { count } = await supabase.from("securities").select("id", { count: "exact", head: true });
        setEmpty((count ?? 0) === 0);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-[5px] border border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-hi truncate">{value.name}</div>
          <div className="n text-[11px] text-mut">
            {value.exchange}:{value.symbol} · {value.currency}
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => onPick(null)}>
          Change
        </Btn>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <TextInput sans value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a company, e.g. Infosys or CRM" autoFocus />
      {results.length > 0 ? (
        <div className="rounded-[5px] border border-line divide-y divide-line max-h-56 overflow-y-auto">
          {results.map((s) => (
            <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-raised/60" onClick={() => onPick(s)}>
              <div className="text-hi truncate">{s.name}</div>
              <div className="n text-[11px] text-mut">
                {s.exchange}:{s.symbol} · {s.currency}
              </div>
            </button>
          ))}
        </div>
      ) : q.trim().length >= 2 ? (
        <p className="text-[12px] text-mut">
          {empty ? "The company list hasn't been loaded yet. Close this and press Refresh on the Holdings page, then try again." : "No match. Try the stock symbol."}
        </p>
      ) : null}
    </div>
  );
}

export function EquityModal({ positionId, onClose, onSaved }: { positionId?: string | undefined; onClose: () => void; onSaved: () => void }) {
  const { portfolio } = usePortfolio();
  const invalidate = useInvalidatePortfolio();
  const existing = positionId ? portfolio?.holdings.find((h) => h.equity?.positionId === positionId) : undefined;
  const defaultOwner = useDefaultOwner();
  const [security, setSecurity] = useState<FoundSecurity | null>(
    existing?.equity ? { id: existing.equity.securityId, symbol: existing.equity.symbol, name: existing.name, exchange: existing.equity.exchange, country: "", currency: existing.price_currency, isin: existing.isin } : null,
  );
  const [owner, setOwner] = useState(existing?.owner_profile_id ?? defaultOwner);
  const [qty, setQty] = useState(existing?.quantity != null ? String(existing.quantity) : "");
  const [avg, setAvg] = useState(existing?.equity?.avgBuy != null ? String(existing.equity.avgBuy) : "");
  const [hidden, setHidden] = useState(existing?.is_hidden ?? false);
  const [busy, setBusy] = useState(false);

  const q = toNum(qty);
  const a = toNum(avg);
  const valid = !!security && !!owner && q >= 0 && !Number.isNaN(q) && (Number.isNaN(a) || a >= 0);

  async function save() {
    if (!security) return;
    setBusy(true);
    const row = { owner_profile_id: owner, security_id: security.id, quantity: q, avg_buy_price: Number.isNaN(a) ? null : a, currency: security.currency, is_hidden: hidden };
    const { error } = positionId
      ? await supabase.from("equity_holdings").update(row).eq("id", positionId)
      : await supabase.from("equity_holdings").upsert(row, { onConflict: "owner_profile_id,security_id" });
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    toast.success(positionId ? "Holding updated" : "Holding added");
    onSaved();
    onClose();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("equity_holdings").delete().eq("id", positionId!);
    setBusy(false);
    if (error) return void toast.error(error.message);
    await invalidate();
    onClose();
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow="Demat equities"
      title={positionId ? "Edit stock holding" : "Add a stock"}
      width="max-w-[520px]"
      footer={
        <>
          {positionId ? <DeleteButton onConfirm={() => void remove()} busy={busy} /> : null}
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={() => void save()} disabled={!valid || busy}>
            {positionId ? "Save" : "Add"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Company">
          <SecurityPicker value={security} onPick={positionId ? () => undefined : setSecurity} />
        </Field>
        <OwnerField value={owner} onChange={setOwner} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <TextInput inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Average buy price (optional)" hint="Only used to show gain or loss. It never changes your net worth.">
            <TextInput inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} />
          </Field>
        </div>
        <PrivateToggle value={hidden} onChange={setHidden} />
      </div>
    </Modal>
  );
}
