// @vitest-environment node
/**
 * Database checks for RSU grants, vests and the RSU notification check, through the
 * same API the app uses. Creates throwaway users, a household and a few test securities,
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
const password = `Rsu-test-${stamp}-pw!`;
// Letters only, so the test rows can't collide with real tickers or each other.
const TAG = `QR${stamp.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}`;
const EXCHANGE = `TEST${stamp}`; // a throwaway exchange keeps test symbols unique

async function signedInUser(admin: Db, label: string) {
  const email = `rsu-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  const client = createClient<Database>(url!, anonKey!, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data: pid, error: e3 } = await client.rpc("complete_onboarding", { _full_name: `RSU ${label}`, _country: "India", _base_currency: "INR" });
  if (e3) throw e3;
  return { id: data.user.id, client, profileId: pid as string };
}

describe.skipIf(!enabled)("RSU grants and vests (database)", () => {
  let admin: Db;
  type U = Awaited<ReturnType<typeof signedInUser>>;
  let owner: U, member: U, leader: U, outsider: U;
  let householdId = "";
  let secId = "";
  let openGrant = "", hiddenGrant = "", unlistedGrant = "";
  const vestIds: Record<string, string> = {};
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    admin = createClient<Database>(url!, adminKey!, opts);
    const { data: sec, error: es } = await admin.from("securities").insert({ symbol: TAG, name: `${TAG} Technologies Inc`, exchange: EXCHANGE, country: "US", currency: "USD", active: true }).select("id").single();
    if (es) throw es;
    secId = sec.id;
    leader = await signedInUser(admin, "leader");
    owner = await signedInUser(admin, "owner");
    member = await signedInUser(admin, "member");
    outsider = await signedInUser(admin, "outsider");
    const { data: hid, error: e1 } = await leader.client.rpc("create_household", { _name: "RSU test household" });
    if (e1) throw e1;
    householdId = hid as string;
    const { data: code } = await leader.client.rpc("get_invite_code");
    for (const u of [owner, member]) {
      const { data: rid, error: e } = await u.client.rpc("request_join", { _code: code as string, _claim_profile_id: null as unknown as string, _consent: true });
      if (e) throw e;
      const { error: e2 } = await leader.client.rpc("decide_join", { _request_id: rid as string, _approve: true });
      if (e2) throw e2;
    }
    const base = { owner_profile_id: owner.profileId, grant_date: "2024-01-01", total_shares: 100, vesting_type: "custom" as const };
    const { data: g, error: e3 } = await owner.client
      .from("rsu_grants")
      .insert([
        { ...base, company_name: "Open Co", listed: true, security_id: secId, is_hidden: false },
        { ...base, company_name: "Hidden Co", listed: true, security_id: secId, is_hidden: true },
        { ...base, company_name: `${TAG} Holdings Ltd`, listed: false, last_listing_check_at: new Date().toISOString(), is_hidden: false },
      ])
      .select("id, company_name");
    if (e3) throw e3;
    openGrant = g!.find((r) => r.company_name === "Open Co")!.id;
    hiddenGrant = g!.find((r) => r.company_name === "Hidden Co")!.id;
    unlistedGrant = g!.find((r) => r.company_name.startsWith(TAG))!.id;
    const { data: v, error: e4 } = await owner.client
      .from("rsu_vests")
      .insert([
        { grant_id: openGrant, vest_date: yesterday, shares: 10 }, // due
        { grant_id: openGrant, vest_date: future, shares: 20 },
        { grant_id: hiddenGrant, vest_date: future, shares: 30 },
      ])
      .select("id, grant_id, shares");
    if (e4) throw e4;
    for (const r of v ?? []) vestIds[String(Number(r.shares))] = r.id;
  }, 90_000);

  afterAll(async () => {
    if (!admin) return;
    const ids = [owner, member, leader, outsider].filter(Boolean).map((u) => u.id);
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    await admin.from("join_requests").delete().in("requester_user_id", ids);
    await admin.from("notifications").delete().in("user_id", ids);
    await admin.from("notification_log").delete().in("user_id", ids);
    await admin.from("profiles").delete().in("owner_user_id", ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    await admin.from("securities").delete().eq("exchange", EXCHANGE);
  }, 60_000);

  const grantsSeen = async (u: U) => {
    const { data, error } = await u.client.from("rsu_grants").select("id").in("id", [openGrant, hiddenGrant]);
    if (error) throw error;
    return (data ?? []).map((r) => r.id).sort();
  };
  const vestsSeen = async (u: U) => {
    const { data, error } = await u.client.from("rsu_vests").select("shares").in("id", Object.values(vestIds));
    if (error) throw error;
    return (data ?? []).map((r) => Number(r.shares)).sort((a, b) => a - b);
  };

  it("the owner sees every grant and vest", async () => {
    expect(await grantsSeen(owner)).toEqual([openGrant, hiddenGrant].sort());
    expect(await vestsSeen(owner)).toEqual([10, 20, 30]);
  });
  it("a household member cannot see a hidden grant or its vests", async () => {
    expect(await grantsSeen(member)).toEqual([openGrant]);
    expect(await vestsSeen(member)).toEqual([10, 20]);
  });
  it("the household leader cannot see a hidden grant or its vests", async () => {
    expect(await grantsSeen(leader)).toEqual([openGrant]);
    expect(await vestsSeen(leader)).toEqual([10, 20]);
  });
  it("a non-member sees nothing", async () => {
    expect(await grantsSeen(outsider)).toEqual([]);
    expect(await vestsSeen(outsider)).toEqual([]);
  });
  it("nobody else can edit, add or delete vests on the owner's grants", async () => {
    for (const u of [member, leader, outsider]) {
      const { data: upd } = await u.client.from("rsu_vests").update({ status: "delivered", delivered_shares: 1 }).in("id", Object.values(vestIds)).select("id");
      expect(upd ?? []).toEqual([]);
      const { data: del } = await u.client.from("rsu_vests").delete().in("id", Object.values(vestIds)).select("id");
      expect(del ?? []).toEqual([]);
      const { error } = await u.client.from("rsu_vests").insert({ grant_id: openGrant, vest_date: future, shares: 1 });
      expect(error).not.toBeNull();
    }
    expect(await vestsSeen(owner)).toEqual([10, 20, 30]);
  });
  it("a vest cannot be moved onto someone else's grant", async () => {
    const { data: other } = await member.client.from("rsu_grants").insert({ owner_profile_id: member.profileId, company_name: "M", listed: true, grant_date: "2024-01-01", total_shares: 5, vesting_type: "custom" }).select("id").single();
    const { data } = await owner.client.from("rsu_vests").update({ grant_id: other!.id }).eq("id", vestIds["20"]!).select("id");
    expect(data ?? []).toEqual([]);
  });
  it("'make everything private' hides grants from the household", async () => {
    await owner.client.from("profiles").update({ hide_everything: true }).eq("id", owner.profileId);
    expect(await grantsSeen(member)).toEqual([]);
    expect(await vestsSeen(member)).toEqual([]);
    await owner.client.from("profiles").update({ hide_everything: false }).eq("id", owner.profileId);
  });

  describe("check_rsu_notifications", () => {
    const count = async (type: string) => {
      const { data } = await admin.from("notifications").select("id").eq("user_id", owner.id).eq("type", type);
      return (data ?? []).length;
    };
    it("a member cannot trigger notifications for the owner's profile", async () => {
      const { data, error } = await member.client.rpc("check_rsu_notifications");
      if (error) throw error;
      expect(data).toBe(0);
      expect(await count("rsu_vest_due")).toBe(0);
    });
    it("creates one notification for the due vest and one for the listing match, and never twice", async () => {
      const { data: first, error } = await owner.client.rpc("check_rsu_notifications");
      if (error) throw error;
      expect(first).toBe(2);
      expect(await count("rsu_vest_due")).toBe(1);
      expect(await count("rsu_listing_match")).toBe(1);
      const { data: second } = await owner.client.rpc("check_rsu_notifications");
      expect(second).toBe(0);
      expect(await count("rsu_vest_due")).toBe(1);
      const { data: link } = await admin.from("notifications").select("link").eq("user_id", owner.id).eq("type", "rsu_vest_due").single();
      expect(link!.link).toBe(`/holdings?vest=${vestIds["10"]}`);
    });
    it("asks 'has it listed?' only when the last check is empty or over a year old and not snoozed", async () => {
      expect(await count("rsu_listing_check")).toBe(0);
      await admin.from("rsu_grants").update({ last_listing_check_at: new Date(Date.now() - 400 * 86_400_000).toISOString(), listing_snoozed_until: future }).eq("id", unlistedGrant);
      await owner.client.rpc("check_rsu_notifications");
      expect(await count("rsu_listing_check")).toBe(0);
      await admin.from("rsu_grants").update({ listing_snoozed_until: null }).eq("id", unlistedGrant);
      await owner.client.rpc("check_rsu_notifications");
      expect(await count("rsu_listing_check")).toBe(1);
      await owner.client.rpc("check_rsu_notifications");
      expect(await count("rsu_listing_check")).toBe(1);
    });
  });
});
