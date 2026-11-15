import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppStateProvider, useAppState } from "@/lib/app-state";
import { syncPortfolio } from "@/lib/market.functions";
import { todayISO } from "@/lib/dates";
import { Header, Tabs } from "@/components/wp/Header";
import { Modals } from "@/components/wp/modals/Modals";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
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

function Shell() {
  const qc = useQueryClient();
  const sync = useServerFn(syncPortfolio);
  const { setLastSync, setSyncing } = useAppState();
  const started = useRef(false);

  async function runSync(manual: boolean) {
    setSyncing(true);
    try {
      const res = await sync({ data: { today: todayISO() } });
      setLastSync({ at: new Date(), navDate: res.navDate });
      if (res.added || res.priced || res.navUpdated) await qc.invalidateQueries({ queryKey: ["portfolio"] });
      if (res.added > 0) toast.success(`${res.added} SIP installment${res.added > 1 ? "s" : ""} added from AMFI NAV`);
      else if (manual) toast.success("NAVs are up to date");
      if (res.failed.length) toast.error(`Couldn't fetch NAV for ${res.failed.length} fund${res.failed.length > 1 ? "s" : ""}`);
    } catch {
      if (manual) toast.error("Live NAV feed is unavailable right now. Showing last known values.");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runSync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-ink text-foreground text-[13px]">
      <Header />
      <Tabs onRefresh={() => void runSync(true)} />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <Modals onSynced={() => void runSync(false)} />
    </div>
  );
}
