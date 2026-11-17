import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { getFxRate } from "./market.functions";
import { buildPortfolio, scopePortfolio, type Holding, type RawPortfolio } from "./portfolio";
import { isStalePrice, possibleCorporateAction } from "./price-rules";
import { todayISO } from "./dates";
import { useAppState } from "./app-state";

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

export const portfolioQuery = queryOptions({
  queryKey: ["portfolio"],
  queryFn: async (): Promise<RawPortfolio> => {
    const [{ data: auth }, profileRows, holdingRows, positions, installments, loans, loanEvents, policies] = await Promise.all([
      supabase.auth.getUser(),
      must(supabase.from("profiles").select("*").order("created_at")),
      must(supabase.from("holdings").select("*").order("created_at")),
      must(supabase.from("equity_holdings").select("*").order("created_at")),
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
    const holdings = [...holdingRows, ...(await equityRows(positions as Tables<"equity_holdings">[], todayISO()))] as Holding[];
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
