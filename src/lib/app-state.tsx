import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Currency } from "./format";
import type { Category } from "./portfolio";

export type ModalState =
  | { type: "cas" }
  | { type: "equity"; positionId?: string }
  | { type: "equity-import" }
  | { type: "asset"; holdingId?: string; category?: Category }
  | { type: "sip"; holdingId: string }
  | { type: "loan"; loanId?: string; kind?: string }
  | { type: "prepay"; loanId: string }
  | { type: "policy"; policyId?: string; kind?: string }
  | null;

interface AppState {
  profile: string;
  setProfile: (p: string) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  modal: ModalState;
  open: (m: NonNullable<ModalState>) => void;
  close: () => void;
  lastSync: { at: Date; navDate: string | null } | null;
  setLastSync: (s: { at: Date; navDate: string | null }) => void;
  syncing: boolean;
  setSyncing: (b: boolean) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState("all");
  const [currency, setCurrencyState] = useState<Currency>("INR");
  const [modal, setModal] = useState<ModalState>(null);
  const [lastSync, setLastSync] = useState<AppState["lastSync"]>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const p = window.localStorage.getItem("wp.profile");
    const c = window.localStorage.getItem("wp.currency");
    if (p) setProfileState(p);
    if (c === "USD" || c === "INR") setCurrencyState(c);
  }, []);

  const setProfile = useCallback((p: string) => {
    setProfileState(p);
    window.localStorage.setItem("wp.profile", p);
  }, []);
  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    window.localStorage.setItem("wp.currency", c);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      profile,
      setProfile,
      currency,
      setCurrency,
      modal,
      open: (m) => setModal(m),
      close: () => setModal(null),
      lastSync,
      setLastSync,
      syncing,
      setSyncing,
    }),
    [profile, setProfile, currency, setCurrency, modal, lastSync, syncing],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
}
