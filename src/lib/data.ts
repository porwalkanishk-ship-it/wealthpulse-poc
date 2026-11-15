import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFxRate } from "./market.functions";
import { buildPortfolio, scopePortfolio, type RawPortfolio } from "./portfolio";
import { todayISO } from "./dates";
import { useAppState } from "./app-state";

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export const portfolioQuery = queryOptions({
  queryKey: ["portfolio"],
  queryFn: async (): Promise<RawPortfolio> => {
    const [members, holdings, installments, loans, loanEvents, policies] = await Promise.all([
      must(supabase.from("members").select("*").order("sort")),
      must(supabase.from("holdings").select("*").order("created_at")),
      must(supabase.from("sip_installments").select("*").order("due_date", { ascending: false })),
      must(supabase.from("loans").select("*").order("created_at")),
      must(supabase.from("loan_events").select("*").order("event_date", { ascending: false })),
      must(supabase.from("policies").select("*").order("next_due")),
    ]);
    return { members, holdings, installments, loans, loanEvents, policies } as RawPortfolio;
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
