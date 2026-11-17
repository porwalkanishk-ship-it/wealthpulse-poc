import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createNseAdapter } from "./prices/nse-bhavcopy";
import { createTwelveDataAdapter } from "./prices/twelve-data";
import type { PriceQuote } from "./prices/types";
import { parseNseEquityList, parseSecTickers, type SecurityLite } from "./securities";
import { todayIST } from "./dates";

const NSE_UA = "Mozilla/5.0 (compatible; WealthPulse-POC)";
const WEEK_MS = 7 * 86_400_000;

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": NSE_UA, ...headers } });
  if (!res.ok) return null;
  return res.text();
}

async function upsertSecurities(list: SecurityLite[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let n = 0;
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000).map((s) => ({ ...s, type: "equity", active: true }));
    const { error } = await supabaseAdmin.from("securities").upsert(chunk, { onConflict: "exchange,symbol" });
    if (error) throw new Error(error.message);
    n += chunk.length;
  }
  return n;
}

/**
 * Loads the shared securities list (NSE equities, plus US companies when SEC_CONTACT_EMAIL is set).
 * Runs at most weekly. Everyone shares one list, so no outside provider is called while someone types.
 */
export const refreshSecurities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: newest } = await supabaseAdmin.from("securities").select("updated_at").order("updated_at", { ascending: false }).limit(1);
    const last = newest?.[0]?.updated_at ? new Date(newest[0].updated_at).getTime() : 0;
    if (Date.now() - last < WEEK_MS) return { skipped: true as const, nse: 0, us: 0, warnings: [] as string[] };

    const warnings: string[] = [];
    let nse = 0;
    let us = 0;
    try {
      const csv = await fetchText("https://archives.nseindia.com/content/equities/EQUITY_L.csv");
      if (csv) nse = await upsertSecurities(parseNseEquityList(csv));
      else warnings.push("Couldn't download the NSE company list");
    } catch (e) {
      warnings.push(`NSE list: ${e instanceof Error ? e.message : "failed"}`);
    }
    const contact = process.env["SEC_CONTACT_EMAIL"];
    if (!contact) {
      warnings.push("US companies not loaded: add the SEC_CONTACT_EMAIL secret (the SEC requires a contact in the request)");
    } else {
      try {
        const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", { headers: { "User-Agent": `WealthPulse-POC ${contact}`, Accept: "application/json" } });
        if (res.ok) us = await upsertSecurities(parseSecTickers(await res.json()));
        else warnings.push("Couldn't download the SEC company list");
      } catch (e) {
        warnings.push(`SEC list: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    return { skipped: false as const, nse, us, warnings };
  });

/**
 * Fetches closing prices for securities someone holds and stores them. Keeps the last known price
 * when a source is unavailable or out of quota, and reports which sources failed.
 */
export const refreshPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const warnings: string[] = [];
    const { data: held } = await supabaseAdmin.from("equity_holdings").select("security_id");
    const ids = [...new Set((held ?? []).map((h) => h.security_id))];
    if (ids.length === 0) return { updated: 0, warnings };
    const { data: secs, error } = await supabaseAdmin.from("securities").select("id, symbol, exchange, currency").in("id", ids);
    if (error) throw new Error(error.message);
    const byKey = new Map((secs ?? []).map((s) => [`${s.exchange}:${s.symbol}`, s]));

    // Skip securities already priced today.
    const today = todayIST();
    const { data: fresh } = await supabaseAdmin.from("security_prices").select("security_id").in("security_id", ids).gte("fetched_at", `${today}T00:00:00+05:30`);
    const done = new Set((fresh ?? []).map((r) => r.security_id));
    const todo = (secs ?? []).filter((s) => !done.has(s.id));
    if (todo.length === 0) return { updated: 0, warnings };

    const quotes: PriceQuote[] = [];
    const nseSyms = todo.filter((s) => s.exchange === "NSE").map((s) => s.symbol);
    if (nseSyms.length) {
      try {
        quotes.push(...(await createNseAdapter(today, (u) => fetchText(u).catch(() => null)).fetchLatest(nseSyms)));
      } catch {
        warnings.push("NSE prices are unavailable right now, so the last known prices are shown");
      }
    }
    const usSecs = todo.filter((s) => s.exchange === "NASDAQ" || s.exchange === "NYSE");
    if (usSecs.length) {
      const key = process.env["TWELVE_DATA_API_KEY"];
      if (!key) warnings.push("US prices need the TWELVE_DATA_API_KEY secret");
      else {
        try {
          const adapter = createTwelveDataAdapter(key, async (u) => (await fetch(u)).json(), (ms) => new Promise((r) => setTimeout(r, ms)));
          // A server request cannot wait minutes, so each run prices one batch of 8; the rest follow on later runs.
          const batch = usSecs.slice(0, 8).map((s) => s.symbol);
          const got = await adapter.fetchLatest(batch);
          for (const q of got) {
            const s = usSecs.find((x) => x.symbol === q.symbol);
            if (s) quotes.push({ ...q, exchange: s.exchange });
          }
          if (usSecs.length > 8) warnings.push(`${usSecs.length - 8} US prices will update on the next refresh (free plan: 8 a minute)`);
        } catch {
          warnings.push("US prices are unavailable right now");
        }
      }
    }
    const rows = quotes.flatMap((q) => {
      const s = byKey.get(`${q.exchange}:${q.symbol}`);
      return s && q.date ? [{ security_id: s.id, price_date: q.date, close: q.close, prev_close: q.prevClose, currency: q.currency, source: q.source }] : [];
    });
    if (rows.length) {
      const { error: e2 } = await supabaseAdmin.from("security_prices").upsert(rows, { onConflict: "security_id,price_date" });
      if (e2) throw new Error(e2.message);
    }
    return { updated: rows.length, warnings };
  });
