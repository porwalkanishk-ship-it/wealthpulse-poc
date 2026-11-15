import { useCallback } from "react";
import { useAppState } from "./app-state";
import { useFx } from "./data";
import { moneyCompact, moneyFull, type MoneyOpts } from "./format";

/** Currency-aware formatters bound to the INR/USD toggle. */
export function useMoney() {
  const { currency } = useAppState();
  const fx = useFx();
  const full = useCallback((n: number, o?: MoneyOpts) => moneyFull(n, currency, fx, o), [currency, fx]);
  const compact = useCallback((n: number, o?: MoneyOpts) => moneyCompact(n, currency, fx, o), [currency, fx]);
  return { full, compact, currency, fx };
}
