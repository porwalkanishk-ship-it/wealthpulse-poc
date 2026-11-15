import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, RefreshCw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/lib/app-state";
import { usePortfolio } from "@/lib/data";
import { useMoney } from "@/lib/use-money";
import { cn } from "@/lib/utils";
import { Skeleton } from "./ui";

function Brand() {
  return (
    <Link to="/overview" className="flex items-center gap-2 shrink-0">
      <span className="w-6 h-6 rounded-[5px] bg-em glow-em grid place-items-center">
        <svg width="14" height="14" fill="none" stroke="var(--ink)" strokeWidth="2.2" aria-hidden="true">
          <path d="M1 9l3-4 3 3 3-5 3 4" />
        </svg>
      </span>
      <span className="font-bold tracking-tight text-[15px] text-hi">WealthPulse</span>
    </Link>
  );
}

export function ProfileSwitcher({ className }: { className?: string }) {
  const { profile, setProfile } = useAppState();
  const { portfolio } = usePortfolio();
  const { compact } = useMoney();
  if (!portfolio) return <Skeleton className={cn("h-9 w-[380px] max-w-full", className)} />;
  const options = [
    { id: "all", name: "Household", net: portfolio.totals.net },
    ...portfolio.profiles.map((m) => ({ id: m.id, name: m.isMe ? "Me" : m.display_name, net: portfolio.totalsByProfile[m.id]?.net ?? 0 })),
  ];
  return (
    <div className={cn("flex p-0.5 rounded-[7px] border border-line bg-panel overflow-x-auto no-scrollbar", className)} role="tablist" aria-label="Family profile">
      {options.map((o) => {
        const active = profile === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setProfile(o.id)}
            className={cn(
              "px-3 h-8 rounded-[5px] whitespace-nowrap shrink-0 transition-colors",
              active ? "bg-em/15 text-em ring-1 ring-em/60 glow-em-soft font-medium" : "text-mut hover:text-foreground",
            )}
          >
            {o.name} <span className="n ml-1">{compact(o.net, { space: true })}</span>
          </button>
        );
      })}
    </div>
  );
}

function CurrencyToggle() {
  const { currency, setCurrency } = useAppState();
  return (
    <div className="flex n text-[11px] border border-line rounded-[5px] overflow-hidden shrink-0" role="tablist" aria-label="Currency">
      {(["INR", "USD"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={currency === c}
          onClick={() => setCurrency(c)}
          className={cn("px-2.5 py-1.5", currency === c ? "bg-raised text-hi" : "text-mut hover:text-foreground")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { open } = useAppState();
  return (
    <header className="sticky top-0 z-30 bg-chrome border-b border-line">
      <div className="h-14 px-4 md:px-6 flex items-center gap-4 md:gap-6">
        <Brand />
        <h1 className="sr-only">WealthPulse Terminal</h1>
        <ProfileSwitcher className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-3">
          <CurrencyToggle />
          <button
            type="button"
            onClick={() => open({ type: "cas" })}
            className="h-8 px-3.5 rounded-[5px] bg-em text-ink font-semibold hover:bg-em-hi inline-flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">Upload CAS</span>
            <span className="sm:hidden">CAS</span>
          </button>
        </div>
      </div>
      <div className="md:hidden px-4 pb-2.5">
        <ProfileSwitcher />
      </div>
    </header>
  );
}

const TABS = [
  { to: "/overview", label: "Overview" },
  { to: "/holdings", label: "Holdings" },
  { to: "/loans", label: "Loans" },
  { to: "/renewals", label: "Renewals" },
  { to: "/insights", label: "Insights" },
] as const;

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

export function Tabs({ onRefresh }: { onRefresh: () => void }) {
  const { lastSync, syncing } = useAppState();
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <nav className="bg-chrome border-b border-line h-11 px-2 md:px-6 flex items-stretch gap-1 text-[13px]">
      <div className="flex items-stretch gap-1 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="flex items-center px-3 border-b-2 border-transparent text-mut hover:text-foreground whitespace-nowrap"
            activeProps={{ className: "!border-em !text-hi" }}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1 pl-2 shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="hidden sm:flex items-center gap-1.5 text-[11px] n text-mut hover:text-foreground px-2 h-7 rounded-[5px]"
          title="Refresh AMFI NAVs and SIP units"
        >
          {syncing ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" /> SYNCING NAV
            </>
          ) : lastSync ? (
            <>
              <i className="pulse w-1.5 h-1.5 rounded-full bg-em" />
              <span className="text-em">LIVE · {fmtTime(lastSync.at)} IST</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" aria-hidden="true" /> REFRESH
            </>
          )}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="w-8 h-8 grid place-items-center rounded-[5px] text-mut hover:text-foreground hover:bg-raised/60"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
}
