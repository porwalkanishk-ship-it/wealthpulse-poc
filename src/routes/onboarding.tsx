import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Field, Panel, SelectInput, TextInput } from "@/components/wp/ui";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: {} });
    const { data: me } = await supabase.from("profiles").select("id").eq("owner_user_id", data.user.id).eq("relationship", "self").maybeSingle();
    if (me) throw redirect({ to: "/overview" });
    return { user: data.user };
  },
  component: Onboarding,
});

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"];

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext() as { user: { user_metadata?: Record<string, unknown> } };
  const [name, setName] = useState(String(user.user_metadata?.["full_name"] ?? user.user_metadata?.["name"] ?? ""));
  const [country, setCountry] = useState("India");
  const [currency, setCurrency] = useState("INR");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (name.trim().length < 1) {
      toast.error("Enter your name");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("complete_onboarding", { _full_name: name.trim(), _country: country.trim(), _base_currency: currency });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries();
    toast.success("Profile created. Next, set up or join your household.");
    void navigate({ to: "/household" });
  }

  return (
    <div className="min-h-screen bg-ink text-foreground grid place-items-center px-4">
      <Panel className="w-full max-w-md p-6 space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-hi">Welcome to WealthPulse</h1>
          <p className="text-mut mt-1">Your investments, loans and policies stay yours. You choose what your household can see.</p>
        </div>
        <Field label="Your name">
          <TextInput sans value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <Field label="Country">
          <TextInput sans value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Your currency" hint="Used for your own profile. The household leader picks the household display currency.">
          <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectInput>
        </Field>
        <Btn size="lg" className="w-full" onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </Btn>
      </Panel>
    </div>
  );
}
