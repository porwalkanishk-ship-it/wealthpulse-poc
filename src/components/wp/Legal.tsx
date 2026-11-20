import { Link } from "@tanstack/react-router";

export const TERMS_VERSION = "2026-11-draft";
export const DISCLAIMER = "WealthPulse is a tracking tool for your own records. It is not investment, tax or legal advice. Values are estimates and may be out of date.";

/** Draft wording. Have a lawyer review it before anyone outside the family uses the app. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-foreground">
      <div className="mx-auto max-w-[720px] px-4 py-10 text-[13.5px] leading-relaxed space-y-4">
        <Link to="/" className="text-em text-[12px]">
          ← Back to WealthPulse
        </Link>
        <h1 className="text-xl text-hi font-semibold">{title}</h1>
        <p className="text-amber text-[12px]">Draft, not yet reviewed by a lawyer.</p>
        {children}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-4 md:px-6 py-3 text-[11.5px] text-mut flex flex-wrap gap-x-4 gap-y-1">
      <span>{DISCLAIMER}</span>
      <span className="ml-auto flex gap-3">
        <Link to="/settings" className="hover:text-foreground">
          Settings
        </Link>
        <Link to="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </span>
    </footer>
  );
}
