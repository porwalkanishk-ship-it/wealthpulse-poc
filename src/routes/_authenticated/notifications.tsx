import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery } from "@/lib/household";
import { Btn, Empty, Panel, PanelHeader } from "@/components/wp/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — WealthPulse" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(notificationsQuery);
  const items = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  async function markAllRead() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    await refresh();
  }
  async function remove(id: string) {
    await supabase.from("notifications").delete().eq("id", id);
    await refresh();
  }
  return (
    <div className="p-4 md:p-6 max-w-[860px] mx-auto">
      <Panel>
        <PanelHeader title="Notifications">
          {items.some((n) => !n.read_at) ? (
            <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => void markAllRead()}>
              Mark all read
            </Btn>
          ) : null}
        </PanelHeader>
        {isLoading ? null : items.length === 0 ? (
          <Empty title="Nothing yet">Renewals, vest confirmations, statement reminders and household requests show up here.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className="px-4 py-3 flex items-start gap-3">
                <button
                  type="button"
                  className="text-left flex-1 min-w-0"
                  onClick={async () => {
                    if (!n.read_at) {
                      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                      void refresh();
                    }
                    if (n.link?.startsWith("/")) void navigate({ to: n.link });
                  }}
                >
                  <div className={cn("text-[13px]", n.read_at ? "text-soft" : "text-hi font-medium")}>{n.title}</div>
                  {n.body ? <div className="text-[12px] text-mut mt-0.5">{n.body}</div> : null}
                  <div className="text-[11px] text-mut mt-1">{new Date(n.created_at).toLocaleString("en-IN")}</div>
                </button>
                <button type="button" className="text-[11.5px] text-mut hover:text-co" onClick={() => void remove(n.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
