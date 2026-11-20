import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { collectMyData, download, toCsv } from "@/lib/export-data";
import { Btn, Field, Panel, PanelHeader, TextInput } from "@/components/wp/ui";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — WealthPulse" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const settings = useQuery({
    queryKey: ["user_settings"],
    queryFn: async () => (await supabase.from("user_settings").select("email_notifications").eq("user_id", user.id).maybeSingle()).data,
  });

  async function setEmail(on: boolean) {
    const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, email_notifications: on });
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["user_settings"] });
  }
  async function exportAs(kind: "json" | "csv") {
    setBusy(true);
    try {
      const data = await collectMyData(user.id);
      const day = new Date().toISOString().slice(0, 10);
      if (kind === "json") download(`wealthpulse-${day}.json`, JSON.stringify(data, null, 2), "application/json");
      else download(`wealthpulse-${day}.csv`, toCsv(data), "text/csv");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export");
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount() {
    setBusy(true);
    try {
      await deleteMyAccount();
      await supabase.auth.signOut();
      toast.success("Your account and data were deleted");
      void navigate({ to: "/auth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the account");
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-[760px] mx-auto space-y-5">
      <Panel>
        <PanelHeader title="Email reminders" />
        <div className="p-4 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.data?.email_notifications ?? false} onChange={(e) => void setEmail(e.target.checked)} />
            <span>Email me reminders</span>
          </label>
          <p className="text-[12px] text-mut">Your choice is saved, but email delivery is not switched on yet. Reminders appear in the app for now.</p>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Your data" />
        <div className="p-4 space-y-3">
          <p className="text-[12.5px] text-mut">Download everything you own here: your profile, any profiles you manage, holdings, stocks, RSU grants, loans, policies, receivables and notifications.</p>
          <div className="flex gap-2">
            <Btn size="sm" disabled={busy} onClick={() => void exportAs("json")}>
              Download JSON
            </Btn>
            <Btn size="sm" variant="secondary" disabled={busy} onClick={() => void exportAs("csv")}>
              Download CSV
            </Btn>
          </div>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Delete my account" />
        <div className="p-4 space-y-3">
          <p className="text-[12.5px] text-mut">This permanently deletes your login and all the data you own, including profiles you manage that nobody has claimed. If you lead a household, leadership passes to the longest-standing member. This cannot be undone. Download your data first.</p>
          <Field label='Type "delete" to confirm'>
            <TextInput value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Btn variant="danger" size="sm" disabled={busy || confirm.trim().toLowerCase() !== "delete"} onClick={() => void deleteAccount()}>
            Delete my account and data
          </Btn>
        </div>
      </Panel>
    </div>
  );
}
