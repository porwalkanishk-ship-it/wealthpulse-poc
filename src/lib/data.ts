import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { getFxRate } from "./market.functions";
import { buildPortfolio, scopePortfolio, type Holding, type RawPortfolio } from "./portfolio";
import { isStalePrice, possibleCorporateAction } from "./price-rules";
import { todayISO } from "./dates";
import { useAppState } from "./app-state";
import { countGrant, unvestedByQuarter, type VestState } from "./rsu";

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

/** Turns per-stock positions into holding-shaped rows (category "equity") priced from the shared price table. */
async function equityRows(positions: Tables<"equity_holdings">[], today: string) {
  if (positions.length === 0) return [];
  const ids = [...new Set(positions.map((p) => p.security_id))];
  const [secs, prices] = await Promise.all([
    must(supabase.from("securities").select("id, symbol, name, exchange, currency, isin").in("id", ids)),
    must(supabase.from("security_prices").select("security_id, price_date, close, prev_close").in("security_id", ids).order("price_date", { ascending: false }).limit(ids.length * 4)),
  ]);
  const secById = new Map((secs as { id: string; symbol: string; name: string; exchange: string; currency: string; isin: string | null }[]).map((s) => [s.id, s]));
  const latest = new Map<string, { price_date: string; close: number; prev_close: number | null }>();
  for (const p of prices as { security_id: string; price_date: string; close: number; prev_close: number | null }[]) if (!latest.has(p.security_id)) latest.set(p.security_id, p);
  return positions.flatMap((p) => {
    const s = secById.get(p.security_id);
    if (!s) return [];
    const px = latest.get(p.security_id);
    const close = px ? Number(px.close) : null;
    const prev = px?.prev_close != null ? Number(px.prev_close) : null;
    return [
      {
        id: `eq:${p.id}`,
        category: "equity",
        name: s.name,
        subtitle: `${s.exchange}:${s.symbol}`,
        amount: 0,
        as_of: px?.price_date ?? today,
        quantity: Number(p.quantity),
        unit_price: close,
        prev_nav: prev,
        price_currency: s.currency,
        owner_profile_id: p.owner_profile_id,
        is_hidden: p.is_hidden,
        user_id: p.user_id,
        isin: s.isin,
        created_at: p.created_at,
        updated_at: p.updated_at,
        equity: {
          positionId: p.id,
          securityId: s.id,
          symbol: s.symbol,
          exchange: s.exchange,
          price: close,
          priceDate: px?.price_date ?? null,
          stale: !px || isStalePrice(px.price_date, today),
          corporateAction: close !== null && possibleCorporateAction(close, prev),
          avgBuy: p.avg_buy_price != null ? Number(p.avg_buy_price) : null,
        },
      },
    ];
  }) as unknown as Holding[];
}

/** Turns RSU grants into holding-shaped rows: delivered plus estimated shares count, unvested shares are carried alongside. */
async function rsuRows(grants: Tables<"rsu_grants">[], vests: Tables<"rsu_vests">[], today: string) {
  if (grants.length === 0) return [];
  const ids = [...new Set(grants.flatMap((g) => (g.security_id ? [g.security_id] : [])))];
  const [secs, prices] = ids.length
    ? await Promise.all([
        must(supabase.from("securities").select("id, symbol, currency").in("id", ids)),
        must(supabase.from("security_prices").select("security_id, price_date, close").in("security_id", ids).order("price_date", { ascending: false }).limit(ids.length * 4)),
      ])
    : [[], []];
  const secById = new Map((secs as { id: string; symbol: string; currency: string }[]).map((s) => [s.id, s]));
  const latest = new Map<string, { price_date: string; close: number }>();
  for (const p of prices as { security_id: string; price_date: string; close: number }[]) if (!latest.has(p.security_id)) latest.set(p.security_id, p);
  return grants.map((g) => {
    const gv: VestState[] = vests
      .filter((v) => v.grant_id === g.id)
      .map((v) => ({ vest_date: v.vest_date, shares: Number(v.shares), status: v.status as "pending" | "delivered", delivered_shares: v.delivered_shares != null ? Number(v.delivered_shares) : null }));
    const c = countGrant(gv, Number(g.withholding_pct), today);
    const sec = g.security_id ? secById.get(g.security_id) : undefined;
    const px = g.security_id ? latest.get(g.security_id) : undefined;
    const manual = !g.listed || !px;
    const price = !manual ? Number(px!.close) : g.manual_price != null ? Number(g.manual_price) : null;
    const priceDate = !manual ? px!.price_date : g.manual_price_date;
    const currency = !manual ? (sec?.currency ?? "USD") : (g.manual_price_currency ?? sec?.currency ?? "USD");
    return {
      id: `rsu:${g.id}`,
      category: "rsu",
      name: g.company_name,
      subtitle: "Vested",
      amount: 0,
      as_of: priceDate ?? today,
      quantity: c.deliveredShares + c.estimatedShares,
      unvested_quantity: c.unvestedShares,
      unit_price: price,
      price_currency: currency,
      owner_profile_id: g.owner_profile_id,
      is_hidden: g.is_hidden,
      user_id: g.user_id,
      created_at: g.created_at,
      updated_at: g.updated_at,
      rsu: {
        grantId: g.id,
        company: g.company_name,
        listed: g.listed,
        securityId: g.security_id,
        symbol: sec?.symbol ?? null,
        grantDate: g.grant_date,
        totalShares: Number(g.total_shares),
        withholdingPct: Number(g.withholding_pct),
        deliveredShares: c.deliveredShares,
        estimatedShares: c.estimatedShares,
        unvestedShares: c.unvestedShares,
        nextVest: c.nextVest,
        byQuarter: unvestedByQuarter(gv, today),
        price,
        priceDate,
        stale: priceDate ? isStalePrice(priceDate, today) : true,
        manual,
        dueVests: gv.filter((v) => v.status === "pending" && v.vest_date <= today).length,
      },
    };
  }) as unknown as Holding[];
}

export const portfolioQuery = queryOptions({
  queryKey: ["portfolio"],
  queryFn: async (): Promise<RawPortfolio> => {
    const [{ data: auth }, profileRows, holdingRows, positions, rsuGrants, rsuVests, installments, loans, loanEvents, policies] = await Promise.all([
      supabase.auth.getUser(),
      must(supabase.from("profiles").select("*").order("created_at")),
      must(supabase.from("holdings").select("*").order("created_at")),
      must(supabase.from("equity_holdings").select("*").order("created_at")),
      must(supabase.from("rsu_grants").select("*").order("created_at")),
      must(supabase.from("rsu_vests").select("*").order("vest_date")),
      must(supabase.from("sip_installments").select("*").order("due_date", { ascending: false })),
      must(supabase.from("loans").select("*").order("created_at")),
      must(supabase.from("loan_events").select("*").order("event_date", { ascending: false })),
      must(supabase.from("policies").select("*").order("next_due")),
    ]);
    const uid = auth.user?.id;
    const profiles = (profileRows as Tables<"profiles">[]).map((p) => ({
      ...p,
      isMe: !!uid && p.owner_user_id === uid,
      writable: !!uid && (p.owner_user_id === uid || (p.owner_user_id === null && p.managed_by_user_id === uid)),
    }));
    const holdings = [...holdingRows, ...(await equityRows(positions as Tables<"equity_holdings">[], todayISO())), ...(await rsuRows(rsuGrants as Tables<"rsu_grants">[], rsuVests as Tables<"rsu_vests">[], todayISO()))] as Holding[];
    return { profiles, holdings, installments, loans, loanEvents, policies } as RawPortfolio;
  },
});

export const fxQuery = queryOptions({
  queryKey: ["fx"],
  queryFn: () => getFxRate(),
  staleTime: 1000 * 60 * 60,
});

export function useFx() {
  const { data } = useQuery(fxQuery);
  return data?.rate ?? 94.3;
}

export function usePortfolio() {
  const q = useQuery(portfolioQuery);
  const fx = useFx();
  const { profile } = useAppState();
  const today = todayISO();
  const portfolio = useMemo(() => (q.data ? buildPortfolio(q.data, today, fx) : null), [q.data, today, fx]);
  const scoped = useMemo(() => (portfolio ? scopePortfolio(portfolio, profile) : null), [portfolio, profile]);
  return { ...q, portfolio, scoped, today, fx };
}

export function useInvalidatePortfolio() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["portfolio"] });
}

export { must };
