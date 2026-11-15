// @vitest-environment node
/**
 * Row-level security checks against the real database, through the same API the app uses.
 * Creates four throwaway users (owner, member, leader, outsider), builds a household,
 * then deletes everything it created. Skipped when the admin key isn't available.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";

function envFile(key: string) {
  try {
    const line = readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).replace(/^"|"$/g, "").trim();
  } catch {
    return undefined;
  }
}

const url = process.env["SUPABASE_URL"] ?? envFile("SUPABASE_URL");
const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? envFile("SUPABASE_PUBLISHABLE_KEY") ?? envFile("VITE_SUPABASE_PUBLISHABLE_KEY");
const adminKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const enabled = !!(url && anonKey && adminKey);

type Db = SupabaseClient<Database>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const password = `Rls-test-${stamp}-pw!`;

async function signedInUser(admin: Db, label: string) {
  const email = `rls-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  const client = createClient<Database>(url!, anonKey!, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data: pid, error: e3 } = await client.rpc("complete_onboarding", { _full_name: `RLS ${label}`, _country: "India", _base_currency: "INR" });
  if (e3) throw e3;
  return { id: data.user.id, client, profileId: pid as string };
}

describe.skipIf(!enabled)("household visibility (row-level security)", () => {
  let admin: Db;
  let owner: Awaited<ReturnType<typeof signedInUser>>;
  let member: Awaited<ReturnType<typeof signedInUser>>;
  let leader: Awaited<ReturnType<typeof signedInUser>>;
  let outsider: Awaited<ReturnType<typeof signedInUser>>;
  let householdId = "";
  const holdingIds: string[] = [];

  async function join(u: typeof owner, code: string) {
    const { data: rid, error } = await u.client.rpc("request_join", { _code: code, _claim_profile_id: null as unknown as string, _consent: true });
    if (error) throw error;
    const { error: e2 } = await leader.client.rpc("decide_join", { _request_id: rid as string, _approve: true });
    if (e2) throw e2;
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, adminKey!, opts);
    leader = await signedInUser(admin, "leader");
    owner = await signedInUser(admin, "owner");
    member = await signedInUser(admin, "member");
    outsider = await signedInUser(admin, "outsider");

    const { data: hid, error } = await leader.client.rpc("create_household", { _name: "RLS test household" });
    if (error) throw error;
    householdId = hid as string;
    const { data: code } = await leader.client.rpc("get_invite_code");
    await join(owner, code as string);
    await join(member, code as string);

    const { data, error: e2 } = await owner.client
      .from("holdings")
      .insert([
        { owner_profile_id: owner.profileId, category: "cash", name: "Shared savings", amount: 100000, is_hidden: false },
        { owner_profile_id: owner.profileId, category: "cash", name: "Private savings", amount: 250000, is_hidden: true },
      ])
      .select("id");
    if (e2) throw e2;
    holdingIds.push(...(data ?? []).map((r) => r.id));
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    if (holdingIds.length) await admin.from("holdings").delete().in("id", holdingIds);
    const users = [owner, member, leader, outsider].filter(Boolean);
    const ids = users.map((u) => u.id);
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    await admin.from("join_requests").delete().in("requester_user_id", ids);
    await admin.from("notifications").delete().in("user_id", ids);
    await admin.from("profiles").delete().in("owner_user_id", ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  const names = async (u: typeof owner) => {
    const { data, error } = await u.client.from("holdings").select("name").in("id", holdingIds);
    if (error) throw error;
    return (data ?? []).map((r) => r.name).sort();
  };

  it("a household member cannot read a hidden row", async () => {
    expect(await names(member)).toEqual(["Shared savings"]);
  });

  it("the household leader cannot read a hidden row", async () => {
    expect(await names(leader)).toEqual(["Shared savings"]);
  });

  it("a non-member cannot read anything", async () => {
    expect(await names(outsider)).toEqual([]);
    const { data } = await outsider.client.from("profiles").select("id").eq("id", owner.profileId);
    expect(data ?? []).toEqual([]);
  });

  it("the owner reads everything, hidden or not", async () => {
    expect(await names(owner)).toEqual(["Private savings", "Shared savings"]);
  });

  it("other members can never edit the owner's rows", async () => {
    const { data } = await member.client.from("holdings").update({ amount: 1 }).in("id", holdingIds).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("'make everything private' hides even unhidden rows from the household", async () => {
    await owner.client.from("profiles").update({ hide_everything: true }).eq("id", owner.profileId);
    expect(await names(member)).toEqual([]);
    expect(await names(owner)).toEqual(["Private savings", "Shared savings"]);
    await owner.client.from("profiles").update({ hide_everything: false }).eq("id", owner.profileId);
  });
});
