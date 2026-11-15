import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Btn, Field, Panel, Segmented, SectionTitle, TextInput } from "@/components/wp/ui";

function safeRedirect(r: unknown): string | undefined {
  if (typeof r !== "string") return undefined;
  try {
    const u = new URL(r, "http://x");
    const path = u.pathname + u.search + u.hash;
    return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth") ? path : undefined;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = safeRedirect(s["redirect"]);
    return r ? { redirect: r } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — WealthPulse" },
      { name: "description", content: "Sign in to your WealthPulse household net worth terminal." },
      { property: "og:title", content: "Sign in — WealthPulse" },
      { property: "og:description", content: "Sign in to your WealthPulse household net worth terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(72),
});

function GoogleG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const dest = search.redirect ?? "/overview";

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: dest, replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: dest, replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [dest, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      const next: { email?: string; password?: string } = {};
      if (f.email?.[0]) next.email = f.email[0];
      if (f.password?.[0]) next.password = f.password[0];
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setSentTo(parsed.data.email);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(/invalid login/i.test(msg) ? "Email or password is incorrect" : msg);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    const parsed = schema.shape.email.safeParse(email);
    if (!parsed.success) {
      setErrors({ email: "Enter your email first" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent. Check your inbox.");
  }

  async function oauth(provider: "google") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Sign-in didn't complete. Please try again.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: dest, replace: true });
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <header className="bg-chrome border-b border-line h-14 px-6 flex items-center gap-2">
        <span className="w-6 h-6 rounded-[5px] bg-em glow-em grid place-items-center">
          <svg width="14" height="14" fill="none" stroke="var(--ink)" strokeWidth="2.2" aria-hidden="true">
            <path d="M1 9l3-4 3 3 3-5 3 4" />
          </svg>
        </span>
        <span className="font-bold tracking-tight text-[15px] text-hi">WealthPulse</span>
      </header>
      <main className="flex-1 grid place-items-center px-4 py-10">
        <Panel className="w-full max-w-[400px]">
          <div className="px-5 pt-5 pb-4 border-b border-line">
            <SectionTitle className="flex items-center gap-2 text-em">
              <i className="pulse w-1.5 h-1.5 rounded-full bg-em" /> Household terminal
            </SectionTitle>
            <h1 className="mt-2 text-[20px] font-semibold text-hi">
              {sentTo ? "Confirm your email" : mode === "signin" ? "Sign in to WealthPulse" : "Create your WealthPulse"}
            </h1>
            <p className="mt-1 text-mut text-[12.5px]">
              {sentTo
                ? `We sent a confirmation link to ${sentTo}. Open it to start tracking your net worth.`
                : "Your family's net worth, SIPs, loans and renewals — private to your account."}
            </p>
          </div>
          {sentTo ? (
            <div className="p-5">
              <Btn variant="secondary" className="w-full" onClick={() => { setSentTo(null); setMode("signin"); }}>
                Back to sign in
              </Btn>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <Segmented
                surface="ink"
                className="w-full [&>button]:flex-1"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "signin", label: "Sign in" },
                  { value: "signup", label: "Create account" },
                ]}
              />
              <form className="space-y-3" onSubmit={submit} noValidate>
                <Field label="Email" error={errors.email}>
                  <TextInput sans type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </Field>
                <Field label="Password" error={errors.password}>
                  <TextInput
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>
                <Btn type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </Btn>
                {mode === "signin" ? (
                  <button type="button" onClick={forgot} className="text-[12px] text-mut hover:text-foreground">
                    Forgot password?
                  </button>
                ) : null}
              </form>
              <div className="flex items-center gap-3 text-[11px] text-mut uppercase tracking-wider">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void oauth("google")}
                  className="w-full h-10 rounded-[6px] border border-[var(--google-border)] bg-[var(--google-bg)] text-[var(--google-text)] font-medium inline-flex items-center justify-center gap-2.5 px-3"
                >
                  <GoogleG /> Continue with Google
                </button>
              </div>
            </div>
          )}
        </Panel>
      </main>
    </div>
  );
}
