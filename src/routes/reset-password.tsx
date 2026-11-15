import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Field, Panel, SectionTitle, TextInput } from "@/components/wp/ui";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — WealthPulse" },
      { name: "description", content: "Choose a new password for your WealthPulse account." },
      { property: "og:title", content: "Reset password — WealthPulse" },
      { property: "og:description", content: "Choose a new password for your WealthPulse account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Password updated");
    void navigate({ to: "/overview", replace: true });
  }

  return (
    <div className="min-h-screen bg-ink grid place-items-center px-4">
      <Panel className="w-full max-w-[400px] p-5">
        <SectionTitle>Account</SectionTitle>
        <h1 className="mt-2 text-[20px] font-semibold text-hi">Set a new password</h1>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Field label="New password" error={error}>
            <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Btn type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </Btn>
        </form>
      </Panel>
    </div>
  );
}
