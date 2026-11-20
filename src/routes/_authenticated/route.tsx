import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortfolio } from "@/lib/data";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppStateProvider, useAppState } from "@/lib/app-state";
import { syncPortfolio } from "@/lib/market.functions";
import { refreshPrices, refreshSecurities } from "@/lib/securities.functions";
import { todayISO } from "@/lib/dates";
import { Btn } from "@/components/wp/ui";
import { Header, Tabs } from "@/components/wp/Header";
import { Modals } from "@/components/wp/modals/Modals";
import { Footer, TERMS_VERSION } from "@/components/wp/Legal";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    const { data: me } = await supabase
      .from("profiles")
      .select("id")
      .eq("owner_user_id", data.user.id)
      .eq("relationship", "self")
      .maybeSingle();
    if (!me) throw redirect({ to: "/onboarding" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

/** Persistent nudge: a profile with mutual funds but no successful CAS import yet. Never blocks the app. */
function CasPrompt() {
  const { portfolio } = usePortfolio();
  const { open } = useAppState();
  const imports = useQuery({
    queryKey: ["cas_imports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cas_imports").select("profile_id, imported_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  if (!portfolio || imports.isLoading) return null;
  const done = new Set((imports.data ?? []).map((i) => i.profile_id));
  const need = portfolio.profiles.filter((p) => p.writable && !done.has(p.id) && portfolio.holdings.some((h) => h.cat === "mutual_fund" && h.owner_profile_id === p.id));
  if (need.length === 0) return null;
  const names = need.map((p) => (p.isMe ? "you" : p.display_name)).join(", ");
  return (
    <div className="bg-amber/10 border-b border-amber/30 px-4 md:px-6 py-2 flex flex-wrap items-center gap-3 text-[12.5px]">
      <span className="text-amber">Upload a Detailed CAS (since inception) for {names} to verify your mutual fund units.</span>
      <button type="button" className="ml-auto text-em font-medium hover:underline" onClick={() => open({ type: "cas" })}>
        Upload CAS
      </button>
    </div>
  );
}

function Shell() {
  const qc = useQueryClient();
  const sync = useServerFn(syncPortfolio);
  const loadSecurities = useServerFn(refreshSecurities);
  const loadPrices = useServerFn(refreshPrices);
  const { setLastSync, setSyncing } = useAppState();
  const started = useRef(false);
  const [syncFailed, setSyncFailed] = useState(false);

  async function runSync(manual: boolean) {
    setSyncing(true);
    let failed = false;
    try {
      // Company list (weekly) and stock prices run first; failures only produce a notice and never block the app.
      try {
        const list = await loadSecurities();
        const px = await loadPrices();
        if (px.updated) await qc.invalidateQueries({ queryKey: ["portfolio"] });
        const warn = [...list.warnings, ...px.warnings];
        if (manual && warn.length) toast.warning(warn[0]);
      } catch {
        failed = true;
        if (manual) toast.error("Couldn't refresh stock prices right now. Showing the last known prices.");
      }
      const res = await sync({ data: { today: todayISO() } });
      setLastSync({ at: new Date(), navDate: res.navDate });
      if (res.added || res.priced || res.navUpdated) await qc.invalidateQueries({ queryKey: ["portfolio"] });
      if (res.added > 0) toast.success(`${res.added} SIP installment${res.added > 1 ? "s" : ""} added from AMFI NAV`);
      else if (manual) toast.success("NAVs are up to date");
      if (res.failed.length) failed = true;
      if (res.failed.length) toast.error(`Couldn't fetch NAV for ${res.failed.length} fund${res.failed.length > 1 ? "s" : ""}`);
    } catch {
      failed = true;
      if (manual) toast.error("The NAV feed is unavailable right now. Showing last known values.");
    } finally {
      setSyncFailed(failed);
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runSync(false);
    // Three-month CAS reminder (a scheduler arrives later); creates an in-app notification at most once per statement.
    void supabase.rpc("check_cas_reminders").then(({ data }) => {
      if (data && data > 0) void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    // RSU vest-due, yearly "has it listed?" and listing-match notifications for profiles this person can edit.
    void supabase.rpc("check_rsu_notifications").then(({ data }) => {
      if (data && data > 0) void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-ink text-foreground text-[13px]">
      <Header />
      <Tabs onRefresh={() => void runSync(true)} />
      {syncFailed ? (
        <div role="status" className="bg-amber/10 border-b border-amber/30 px-4 md:px-6 py-2 text-[12.5px] text-amber">
          Showing last known values. The latest prices or NAVs could not be fetched.
        </div>
      ) : null}
      <CasPrompt />
      <TermsGate />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <Footer />
      <Modals onSynced={() => void runSync(false)} />
    </div>
  );
}

/** Asks for acceptance of the terms once (and again when the terms version changes). */
function TermsGate() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["user_settings", "terms"],
    queryFn: async () => (await supabase.from("user_settings").select("terms_version").eq("user_id", user.id).maybeSingle()).data,
  });
  if (q.isLoading || q.data?.terms_version === TERMS_VERSION) return null;
  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc("accept_terms", { _version: TERMS_VERSION });
    setBusy(false);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["user_settings"] });
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="terms-title" className="fixed inset-0 z-[100] bg-black/70 grid place-items-center p-4">
      <div className="bg-panel border border-line rounded-[8px] max-w-md p-5 space-y-3">
        <h2 id="terms-title" className="text-hi text-base font-semibold">
          Before you continue
        </h2>
        <p className="text-[13px] text-soft">WealthPulse is a tracking tool for your own records, not financial, tax or legal advice. Values are estimates. Please read how we handle your data and the terms of use.</p>
        <p className="text-[13px]">
          <Link to="/privacy" target="_blank" className="text-em underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link to="/terms" target="_blank" className="text-em underline">
            Terms
          </Link>
        </p>
        <Btn onClick={() => void accept()} disabled={busy}>
          I agree
        </Btn>
      </div>
    </div>
  );
}
