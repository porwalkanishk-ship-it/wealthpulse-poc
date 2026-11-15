import { useState } from "react";
import { usePortfolio } from "@/lib/data";
import { useAppState } from "@/lib/app-state";
import { Btn, Field, SelectInput } from "../ui";

/** Parse a rupee/number field that may contain commas. Returns NaN for blanks. */
export function toNum(v: string) {
  const cleaned = v.replace(/[,₹\s]/g, "");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

export function numStr(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
  return String(Math.round(Number(v) * 1000) / 1000);
}

export function OwnerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { portfolio } = usePortfolio();
  return (
    <Field label="Belongs to">
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
        {(portfolio?.profiles ?? []).filter((m) => m.writable).map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}{m.isMe ? " (you)" : ""}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}

/** Default owner: the selected profile if you can edit it, else your own profile. */
export function useDefaultOwner() {
  const { profile } = useAppState();
  const { portfolio } = usePortfolio();
  const writable = (portfolio?.profiles ?? []).filter((p) => p.writable);
  if (profile !== "all" && writable.some((p) => p.id === profile)) return profile;
  return (writable.find((p) => p.isMe) ?? writable[0])?.id ?? "";
}

export function DeleteButton({ onConfirm, label = "Delete", busy }: { onConfirm: () => void; label?: string; busy?: boolean }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="flex items-center gap-2 mr-auto">
      <span className="text-[12px] text-co">Delete permanently?</span>
      <Btn variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
        Yes, delete
      </Btn>
      <Btn variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Keep
      </Btn>
    </div>
  ) : (
    <Btn variant="ghost" className="mr-auto text-co hover:text-co" onClick={() => setArmed(true)}>
      {label}
    </Btn>
  );
}
