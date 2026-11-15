import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type HouseholdProfile = Tables<"profiles">;
export type JoinRequest = Tables<"join_requests">;
export type Notification = Tables<"notifications">;

export interface HouseholdData {
  userId: string;
  household: Tables<"households"> | null;
  role: "leader" | "member" | null;
  members: (Tables<"household_members"> & { name: string })[];
  /** Profiles I can see (mine, ones I manage, and visible household ones). */
  profiles: HouseholdProfile[];
  myProfile: HouseholdProfile | null;
  requests: JoinRequest[];
}

export const householdQuery = queryOptions({
  queryKey: ["household"],
  queryFn: async (): Promise<HouseholdData> => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? "";
    const [hm, profiles, requests] = await Promise.all([
      supabase.from("household_members").select("*"),
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("join_requests").select("*").order("created_at", { ascending: false }),
    ]);
    for (const r of [hm, profiles, requests]) if (r.error) throw new Error(r.error.message);
    const profileRows = profiles.data ?? [];
    const memberRows = hm.data ?? [];
    const mine = memberRows.find((m) => m.user_id === userId) ?? null;
    let household: HouseholdData["household"] = null;
    if (mine) {
      const { data, error } = await supabase.from("households").select("*").eq("id", mine.household_id).maybeSingle();
      if (error) throw new Error(error.message);
      household = data;
    }
    const nameOf = (uid: string) => profileRows.find((p) => p.owner_user_id === uid && p.relationship === "self")?.display_name ?? "Member";
    return {
      userId,
      household,
      role: (mine?.role as "leader" | "member" | undefined) ?? null,
      members: memberRows.filter((m) => !mine || m.household_id === mine.household_id).map((m) => ({ ...m, name: nameOf(m.user_id) })),
      profiles: profileRows,
      myProfile: profileRows.find((p) => p.owner_user_id === userId && p.relationship === "self") ?? null,
      requests: requests.data ?? [],
    };
  },
});

export function useHousehold() {
  return useQuery(householdQuery);
}

/** Run a Postgres function and refresh everything that depends on membership. */
export function useRpc<A, R = unknown>(fn: (args: A) => PromiseLike<{ data: R | null; error: { message: string } | null }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: A) => {
      const { data, error } = await fn(args);
      if (error) throw new Error(error.message);
      return data as R;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["household"] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });
}

export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async (): Promise<Notification[]> => {
    const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  refetchInterval: 60_000,
});
