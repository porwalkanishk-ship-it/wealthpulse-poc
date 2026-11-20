import { supabase } from "@/integrations/supabase/client";

const OWNED = ["holdings", "equity_holdings", "rsu_grants", "loans", "loan_events", "policies", "mf_transactions", "sip_installments"] as const;

/** Everything this person owns (their own profile and any no-login profiles they manage), as plain tables. */
export async function collectMyData(userId: string): Promise<Record<string, unknown[]>> {
  const { data: profiles, error } = await supabase.from("profiles").select("*").or(`owner_user_id.eq.${userId},managed_by_user_id.eq.${userId}`);
  if (error) throw new Error(error.message);
  const mine = (profiles ?? []).filter((p) => p.owner_user_id === userId || p.owner_user_id === null);
  const ids = mine.map((p) => p.id);
  const out: Record<string, unknown[]> = { profiles: mine };
  for (const t of OWNED) {
    const { data, error: e } = await supabase.from(t).select("*").in("owner_profile_id", ids);
    if (e) throw new Error(`${t}: ${e.message}`);
    out[t] = data ?? [];
  }
  const grantIds = (out["rsu_grants"] as { id: string }[]).map((g) => g.id);
  const holdingIds = (out["holdings"] as { id: string }[]).map((h) => h.id);
  const [vests, reps, cas, notes] = await Promise.all([
    grantIds.length ? supabase.from("rsu_vests").select("*").in("grant_id", grantIds) : { data: [] },
    holdingIds.length ? supabase.from("receivable_repayments").select("*").in("holding_id", holdingIds) : { data: [] },
    supabase.from("cas_imports").select("*").in("profile_id", ids),
    supabase.from("notifications").select("*").eq("user_id", userId),
  ]);
  out["rsu_vests"] = vests.data ?? [];
  out["receivable_repayments"] = reps.data ?? [];
  out["cas_imports"] = cas.data ?? [];
  out["notifications"] = notes.data ?? [];
  return out;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV with a `table` column first; each table keeps its own columns, separated by a blank line and a header row. */
export function toCsv(data: Record<string, unknown[]>): string {
  const parts: string[] = [];
  for (const [table, rows] of Object.entries(data)) {
    if (rows.length === 0) continue;
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
    parts.push(["table", ...cols].map(csvCell).join(","));
    for (const r of rows) parts.push([table, ...cols.map((c) => (r as Record<string, unknown>)[c])].map(csvCell).join(","));
    parts.push("");
  }
  return parts.join("\n");
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
