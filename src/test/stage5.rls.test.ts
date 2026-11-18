// @vitest-environment node
/**
 * Database checks for the CAS import-date fix, receivable repayments, notification dedupe and
 * renewal reminders, user settings and delete_my_data, through the same API the app uses.
 * Creates throwaway users and households, then deletes everything it created.
 * Skipped when the admin key isn't available.
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
const password = `S5-test-${stamp}-pw!`;
const TAG = `QS${stamp.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}`;
const EXCHANGE = `TEST${stamp}`;
const DAY = 86_400_000;
const istDate = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * DAY).toISOString().slice(0, 10);

async function signedInUser(admin: Db, label: string) {
  const email = `s5-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  const client = createClient<Database>(url!, anonKey!, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data: pid, error: e3 } = await client.rpc("complete_onboarding", { _full_name: `S5 ${label}`, _country: "India", _base_currency: "INR" });
  if (e3) throw e3;
  return { id: data.user.id, client, profileId: pid as string };
}

describe.skipIf(!enabled)("stage 5 database rules", () => {
  let admin: Db;
  type U = Awaited<ReturnType<typeof signedInUser>>;
  let owner: U, member: U, leader: U, outsider: U;
  let householdId = "", outsiderHousehold = "";
  let openReceivable = "", hiddenReceivable = "";
  const repaymentIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(url!, adminKey!, opts);
    leader = await signedInUser(admin, "leader");
    owner = await signedInUser(admin, "owner");
    member = await signedInUser(admin, "member");
    outsider = await signedInUser(admin, "outsider");
    const { data: hid, error: e1 } = await leader.client.rpc("create_household", { _name: "Stage 5 test household" });
    if (e1) throw e1;
    householdId = hid as string;
    const { data: code } = await leader.client.rpc("get_invite_code");
    for (const u of [owner, member]) {
      const { data: rid, error } = await u.client.rpc("request_join", { _code: code as string, _claim_profile_id: null as unknown as string, _consent: true });
      if (error) throw error;
      const { error: e2 } = await leader.client.rpc("decide_join", { _request_id: rid as string, _approve: true });
      if (e2) throw e2;
    }
    const { data: oh, error: e3 } = await outsider.client.rpc("create_household", { _name: "Outsider household" });
    if (e3) throw e3;
    outsiderHousehold = oh as string;

    const { data: rec, error: e4 } = await owner.client
      .from("holdings")
      .insert([
        { owner_profile_id: owner.profileId, category: "receivable", name: "Loan to cousin", amount: 50000, rate: 8, interest_type: "simple", is_hidden: false },
        { owner_profile_id: owner.profileId, category: "receivable", name: "Private loan", amount: 90000, rate: 10, interest_type: "compound", compounding_frequency: "quarterly", is_hidden: true },
      ])
      .select("id, name");
    if (e4) throw e4;
    openReceivable = rec!.find((r) => r.name === "Loan to cousin")!.id;
    hiddenReceivable = rec!.find((r) => r.name === "Private loan")!.id;
    const { data: rp, error: e5 } = await owner.client
      .from("receivable_repayments")
      .insert([
        { holding_id: openReceivable, repayment_date: istDate(-30), amount: 1000 },
        { holding_id: hiddenReceivable, repayment_date: istDate(-30), amount: 2000 },
      ])
      .select("id");
    if (e5) throw e5;
    repaymentIds.push(...(rp ?? []).map((r) => r.id));

    // An old CAS import for the owner: drives the import-date and reminder checks.
    const { error: e6 } = await admin.from("cas_imports").insert({
      profile_id: owner.profileId, user_id: owner.id, imported_at: new Date(Date.now() - 100 * DAY).toISOString(),
      statement_to: istDate(-101), funds_count: 1, source: "parser",
    });
    if (e6) throw e6;
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    const ids = [owner, member, leader, outsider].filter(Boolean).map((u) => u.id);
    for (const h of [householdId, outsiderHousehold]) if (h) await admin.from("households").delete().eq("id", h);
    await admin.from("join_requests").delete().in("requester_user_id", ids);
    await admin.from("notifications").delete().in("user_id", ids);
    await admin.from("user_settings").delete().in("user_id", ids);
    await admin.from("profiles").delete().in("owner_user_id", ids);
    await admin.from("profiles").delete().in("managed_by_user_id", ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    await admin.from("securities").delete().eq("exchange", EXCHANGE);
    await admin.from("securities").delete().eq("exchange", `${EXCHANGE}B`);
  }, 60_000);

  const ownerNotifs = async (type: string, u: U = owner) => {
    const { data } = await admin.from("notifications").select("id, dedupe_key").eq("user_id", u.id).eq("type", type);
    return data ?? [];
  };

  // 1. cas_next_import_date
  describe("cas_next_import_date", () => {
    it("the owner gets the next import date", async () => {
      const { data, error } = await owner.client.rpc("cas_next_import_date", { _profile_id: owner.profileId });
      if (error) throw error;
      expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    it("a household member and the leader get nothing for someone else's profile", async () => {
      for (const u of [member, leader, outsider]) {
        const { data, error } = await u.client.rpc("cas_next_import_date", { _profile_id: owner.profileId });
        if (error) throw error;
        expect(data).toBeNull();
      }
    });
  });

  // 2. Receivables and repayments
  describe("receivable repayments", () => {
    const amounts = async (u: U) => {
      const { data, error } = await u.client.from("receivable_repayments").select("amount").in("id", repaymentIds);
      if (error) throw error;
      return (data ?? []).map((r) => Number(r.amount)).sort((a, b) => a - b);
    };
    it("the owner sees every repayment", async () => {
      expect(await amounts(owner)).toEqual([1000, 2000]);
    });
    it("a hidden receivable hides its repayments from members and the leader", async () => {
      expect(await amounts(member)).toEqual([1000]);
      expect(await amounts(leader)).toEqual([1000]);
    });
    it("a non-member sees no repayments", async () => {
      expect(await amounts(outsider)).toEqual([]);
    });
    it("nobody else can add, edit or delete repayments", async () => {
      for (const u of [member, leader, outsider]) {
        const { error } = await u.client.from("receivable_repayments").insert({ holding_id: openReceivable, repayment_date: istDate(), amount: 5 });
        expect(error).not.toBeNull();
        const { data: upd } = await u.client.from("receivable_repayments").update({ amount: 1 }).in("id", repaymentIds).select("id");
        expect(upd ?? []).toEqual([]);
        const { data: del } = await u.client.from("receivable_repayments").delete().in("id", repaymentIds).select("id");
        expect(del ?? []).toEqual([]);
      }
      expect(await amounts(owner)).toEqual([1000, 2000]);
    });
    it("a compound receivable needs a compounding frequency", async () => {
      const { error } = await owner.client.from("holdings").insert({ owner_profile_id: owner.profileId, category: "receivable", name: "Bad", amount: 1, interest_type: "compound" });
      expect(error).not.toBeNull();
    });
    it("repayments can only be added to receivables", async () => {
      const { data: cash } = await owner.client.from("holdings").insert({ owner_profile_id: owner.profileId, category: "cash", name: "Wallet", amount: 10 }).select("id").single();
      const { error } = await owner.client.from("receivable_repayments").insert({ holding_id: cash!.id, repayment_date: istDate(), amount: 5 });
      expect(error).not.toBeNull();
    });
  });

  // 3. Notifications
  describe("notification checks", () => {
    it("internal per-user checks and the daily run can't be called by signed-in users", async () => {
      const calls = [
        owner.client.rpc("check_cas_reminders_for", { _user: owner.id }),
        owner.client.rpc("check_rsu_notifications_for", { _user: owner.id }),
        owner.client.rpc("check_renewal_notifications_for", { _user: owner.id }),
        owner.client.rpc("run_daily_notifications"),
      ];
      for (const r of await Promise.all(calls)) expect(r.error).not.toBeNull();
    });

    it("the CAS reminder is created once and does not come back after it is deleted", async () => {
      expect(await member.client.rpc("check_cas_reminders").then((r) => r.data)).toBe(0);
      const { data: first, error } = await owner.client.rpc("check_cas_reminders");
      if (error) throw error;
      expect(first).toBe(1);
      const [n] = await ownerNotifs("cas_reminder");
      expect(n!.dedupe_key).toMatch(/^cas_reminder:/);
      await owner.client.from("notifications").delete().eq("id", n!.id);
      await admin.from("cas_imports").update({ reminder_sent_at: null }).eq("profile_id", owner.profileId);
      expect(await owner.client.rpc("check_cas_reminders").then((r) => r.data)).toBe(0);
      expect(await ownerNotifs("cas_reminder")).toEqual([]);
    });

    it("an RSU listing match is suggested once per grant per security, even after deletion", async () => {
      await admin.from("securities").insert({ symbol: TAG, name: `${TAG} Technologies Ltd`, exchange: EXCHANGE, country: "IN", currency: "INR", active: true });
      const { data: g, error } = await owner.client
        .from("rsu_grants")
        .insert({ owner_profile_id: owner.profileId, company_name: `${TAG}, Inc.`, grant_date: "2024-01-01", total_shares: 10, vesting_type: "custom", last_listing_check_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw error;
      expect(await owner.client.rpc("check_rsu_notifications").then((r) => r.data)).toBe(1);
      const [n] = await ownerNotifs("rsu_listing_match");
      expect(n!.dedupe_key).toMatch(new RegExp(`^rsu_match:${g.id}:`));
      await owner.client.from("notifications").delete().eq("id", n!.id);
      expect(await owner.client.rpc("check_rsu_notifications").then((r) => r.data)).toBe(0);
      // A second matching security is a new event.
      await admin.from("securities").insert({ symbol: TAG, name: `${TAG} Corp`, exchange: `${EXCHANGE}B`, country: "US", currency: "USD", active: true });
      expect(await owner.client.rpc("check_rsu_notifications").then((r) => r.data)).toBe(1);
    });

    it("renewal reminders go only to the owner, once each, and never come back after deletion", async () => {
      const { error: e1 } = await owner.client.from("policies").insert({ owner_profile_id: owner.profileId, kind: "term", name: "Hidden term plan", cover: 10000000, premium: 20000, frequency: "yearly", next_due: istDate(5), is_hidden: true });
      if (e1) throw e1;
      await owner.client.from("policies").insert({ owner_profile_id: owner.profileId, kind: "health", name: "Far policy", cover: 500000, premium: 9000, frequency: "yearly", next_due: istDate(60) });
      const { error: e2 } = await owner.client.from("holdings").insert([
        { owner_profile_id: owner.profileId, category: "fd", name: "Bank FD", amount: 100000, maturity_date: istDate(20) },
        { owner_profile_id: owner.profileId, category: "life_policy", name: "Endowment", amount: 50000, next_due: istDate(3) },
        { owner_profile_id: owner.profileId, category: "fd", name: "Long FD", amount: 100000, maturity_date: istDate(90) },
      ]);
      if (e2) throw e2;

      for (const u of [member, leader]) expect(await u.client.rpc("check_renewal_notifications").then((r) => r.data)).toBe(0);
      const { data: forMember } = await admin.rpc("check_renewal_notifications_for", { _user: member.id });
      expect(forMember).toBe(0);

      const { data: first, error } = await owner.client.rpc("check_renewal_notifications");
      if (error) throw error;
      expect(first).toBe(3);
      expect((await ownerNotifs("renewal_due")).length).toBe(1);
      expect((await ownerNotifs("maturity_due")).length).toBe(1);
      expect((await ownerNotifs("holding_due")).length).toBe(1);
      expect(await owner.client.rpc("check_renewal_notifications").then((r) => r.data)).toBe(0);
      const { data: viaAdmin } = await admin.rpc("check_renewal_notifications_for", { _user: owner.id });
      expect(viaAdmin).toBe(0);

      await owner.client.from("notifications").delete().in("type", ["renewal_due", "maturity_due", "holding_due"]);
      expect(await owner.client.rpc("check_renewal_notifications").then((r) => r.data)).toBe(0);
      for (const u of [member, leader]) expect(await ownerNotifs("renewal_due", u)).toEqual([]);
    });
  });

  // 4. Settings and delete_my_data
  describe("user settings", () => {
    it("accept_terms creates the caller's row and only they can read it", async () => {
      const { error } = await owner.client.rpc("accept_terms", { _version: "2026-11" });
      if (error) throw error;
      const { data: mine } = await owner.client.from("user_settings").select("user_id, terms_version, terms_accepted_at");
      expect(mine).toHaveLength(1);
      expect(mine![0]!.user_id).toBe(owner.id);
      expect(mine![0]!.terms_version).toBe("2026-11");
      expect(mine![0]!.terms_accepted_at).not.toBeNull();
      const { data: theirs } = await member.client.from("user_settings").select("user_id").eq("user_id", owner.id);
      expect(theirs ?? []).toEqual([]);
    });
    it("a user can switch email notifications but not edit someone else's settings or their unsubscribe token", async () => {
      const { data: upd } = await owner.client.from("user_settings").update({ email_notifications: true }).eq("user_id", owner.id).select("email_notifications");
      expect(upd![0]!.email_notifications).toBe(true);
      const { data: other } = await member.client.from("user_settings").update({ email_notifications: false }).eq("user_id", owner.id).select("user_id");
      expect(other ?? []).toEqual([]);
      const { error } = await owner.client.from("user_settings").update({ email_unsubscribe_token: crypto.randomUUID() }).eq("user_id", owner.id);
      expect(error).not.toBeNull();
    });
  });

  describe("delete_my_data", () => {
    it("removes only the caller's data and passes leadership to the longest-standing member", async () => {
      const { data: managed } = await leader.client.rpc("add_managed_profile", { _name: "Grandma", _relationship: "Grandmother" });
      await leader.client.from("holdings").insert([
        { owner_profile_id: leader.profileId, category: "cash", name: "Leader cash", amount: 1 },
        { owner_profile_id: managed as string, category: "gold", name: "Grandma gold", amount: 2 },
      ]);
      await leader.client.rpc("accept_terms", { _version: "2026-11" });
      const { data: outsiderRow } = await outsider.client.from("holdings").insert({ owner_profile_id: outsider.profileId, category: "cash", name: "Outsider cash", amount: 3 }).select("id").single();
      const ownerBefore = (await admin.from("holdings").select("id").eq("owner_profile_id", owner.profileId)).data!.length;
      const memberCount = async (h: string) => (await admin.from("household_members").select("user_id, role").eq("household_id", h)).data ?? [];

      const { data: res, error } = await leader.client.rpc("delete_my_data");
      if (error) throw error;
      expect(res).toMatchObject({ left_household: true, profiles_deleted: 2 });

      // The leader's rows, profiles and settings are gone.
      expect((await admin.from("profiles").select("id").in("id", [leader.profileId, managed as string])).data).toEqual([]);
      expect((await admin.from("holdings").select("id").eq("user_id", leader.id)).data).toEqual([]);
      expect((await admin.from("user_settings").select("user_id").eq("user_id", leader.id)).data).toEqual([]);
      expect((await admin.from("notifications").select("id").eq("user_id", leader.id)).data).toEqual([]);
      // The household survives and the owner (joined right after the leader) now leads it.
      const members = await memberCount(householdId);
      expect(members.map((m) => [m.user_id, m.role]).sort()).toEqual([[member.id, "member"], [owner.id, "leader"]].sort());
      expect((await ownerNotifs("leadership")).length).toBe(1);
      // Other people's data and households are untouched.
      expect((await admin.from("holdings").select("id").eq("owner_profile_id", owner.profileId)).data!.length).toBe(ownerBefore);
      expect((await admin.from("receivable_repayments").select("id").in("id", repaymentIds)).data!.length).toBe(2);
      expect((await admin.from("user_settings").select("user_id").eq("user_id", owner.id)).data!.length).toBe(1);
      expect((await admin.from("holdings").select("id").eq("id", outsiderRow!.id)).data!.length).toBe(1);
      expect((await memberCount(outsiderHousehold)).map((m) => m.user_id)).toEqual([outsider.id]);
      expect((await admin.from("profiles").select("id").in("id", [owner.profileId, member.profileId, outsider.profileId])).data!.length).toBe(3);
      // The auth user still exists; the app removes it separately.
      const { data: au } = await admin.auth.admin.getUserById(leader.id);
      expect(au.user?.id).toBe(leader.id);
    });
  });
});
