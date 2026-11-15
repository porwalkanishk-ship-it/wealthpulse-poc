import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "./dates";
import { fetchSchemeHistory, searchMfApi } from "./mfapi.server";
import { planInstallments, type InstallmentLike } from "./sip";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Live USD→INR rate (falls back to a recent rate if the feed is down). */
export const getFxRate = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
    const inr = json.rates?.["INR"];
    if (!inr) throw new Error("no INR");
    return { rate: inr, live: true, updated: json.time_last_update_utc ?? null };
  } catch {
    return { rate: 94.3, live: false, updated: null };
  }
});

/** Search AMFI schemes by name, Direct Growth plans first. */
export const searchSchemes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const rows = await searchMfApi(data.q);
    const score = (n: string) => (/direct/i.test(n) ? 0 : 2) + (/growth/i.test(n) ? 0 : 1);
    return rows
      .sort((a, b) => score(a.schemeName) - score(b.schemeName))
      .slice(0, 12)
      .map((r) => ({ code: String(r.schemeCode), name: r.schemeName }));
  });

/** Latest NAV for one scheme (used when adding a fund by hand). */
export const getLatestNav = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(/^\d{3,7}$/) }).parse(d))
  .handler(async ({ data }) => {
    const h = await fetchSchemeHistory(data.code);
    const last = h?.history[h.history.length - 1];
    const prev = h?.history[h.history.length - 2];
    if (!h || !last) return null;
    return { code: data.code, name: h.name, nav: last.nav, date: last.date, prevNav: prev?.nav ?? null };
  });

/**
 * Refresh every mutual fund with the latest AMFI NAV and auto-add units for each SIP
 * debit that has happened since the last run (priced at that day's NAV).
 */
export const syncPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ today: isoDate }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: funds, error } = await supabase
      .from("holdings")
      .select("id, scheme_code, nav, nav_date, sip_active, sip_amount, sip_day, sip_start")
      .eq("category", "mutual_fund")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const list = (funds ?? []).filter((f) => f.scheme_code);
    if (list.length === 0) return { navUpdated: 0, added: 0, priced: 0, navDate: null as string | null, failed: [] as string[] };

    const ids = list.map((f) => f.id);
    const { data: insts, error: iErr } = await supabase
      .from("sip_installments")
      .select("id, holding_id, due_date, amount, nav, nav_date, units, status")
      .in("holding_id", ids);
    if (iErr) throw new Error(iErr.message);

    // Only the history window we need: from the earliest SIP start or pending installment.
    let since = addDays(data.today, -10);
    for (const f of list) if (f.sip_active && f.sip_start && f.sip_start < since) since = f.sip_start;
    for (const i of insts ?? []) if (i.status === "pending" && i.due_date < since) since = i.due_date;

    const codes = [...new Set(list.map((f) => f.scheme_code as string))];
    const histories = new Map<string, Awaited<ReturnType<typeof fetchSchemeHistory>>>();
    await Promise.all(
      codes.map(async (c) => {
        try {
          histories.set(c, await fetchSchemeHistory(c, addDays(since, -10)));
        } catch {
          histories.set(c, null);
        }
      }),
    );

    let navUpdated = 0;
    let added = 0;
    let priced = 0;
    let navDate: string | null = null;
    const failed: string[] = [];

    for (const f of list) {
      const h = histories.get(f.scheme_code as string);
      const last = h?.history[h.history.length - 1];
      const prev = h?.history[h.history.length - 2];
      if (!h || !last) {
        failed.push(f.scheme_code as string);
        continue;
      }
      if (!navDate || last.date > navDate) navDate = last.date;
      if (f.nav_date !== last.date || Number(f.nav) !== last.nav) {
        const { error: uErr } = await supabase
          .from("holdings")
          .update({ nav: last.nav, prev_nav: prev?.nav ?? null, nav_date: last.date, updated_at: new Date().toISOString() })
          .eq("id", f.id);
        if (!uErr) navUpdated++;
      }

      const existing: InstallmentLike[] = (insts ?? [])
        .filter((i) => i.holding_id === f.id)
        .map((i) => ({
          id: i.id,
          due_date: i.due_date,
          amount: Number(i.amount),
          nav: i.nav === null ? null : Number(i.nav),
          nav_date: i.nav_date,
          units: Number(i.units),
          status: i.status as InstallmentLike["status"],
        }));
      const plan = planInstallments(
        { sip_active: f.sip_active, sip_amount: f.sip_amount === null ? null : Number(f.sip_amount), sip_day: f.sip_day, sip_start: f.sip_start },
        existing,
        h.history,
        data.today,
      );
      if (plan.inserts.length) {
        const { error: insErr } = await supabase.from("sip_installments").upsert(
          plan.inserts.map((p) => ({
            holding_id: f.id,
            user_id: context.userId,
            due_date: p.due_date,
            amount: p.amount,
            nav: p.nav,
            nav_date: p.nav_date ?? null,
            units: p.units,
            status: p.status,
          })),
          { onConflict: "holding_id,due_date", ignoreDuplicates: true },
        );
        if (!insErr) added += plan.inserts.length;
      }
      for (const u of plan.updates) {
        const { error: upErr } = await supabase
          .from("sip_installments")
          .update({ nav: u.nav, nav_date: u.nav_date ?? null, units: u.units, status: u.status })
          .eq("id", u.id);
        if (!upErr) priced++;
      }
    }
    return { navUpdated, added, priced, navDate, failed };
  });
