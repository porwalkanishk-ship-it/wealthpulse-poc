// @vitest-environment node
/**
 * Database checks for the shared securities list and per-profile stock holdings, through the
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
const password = `Eq-test-${stamp}-pw!`;
// Letters only, so the test rows can't collide with real tickers or each other.
const TAG = `QZ${stamp.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}`;
const EXCHANGE = `TEST${stamp}`; // a throwaway exchange keeps test symbols unique

async function signedInUser(admin: Db, label: string) {
  const email = `eq-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  const client = createClient<Database>(url!, anonKey!, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data: pid, error: e3 } = await client.rpc("complete_onboarding", { _full_name: `EQ ${label}`, _country: "India", _base_currency: "INR" });
  if (e3) throw e3;
  return { id: data.user.id, client, profileId: pid as string };
}

describe.skipIf(!enabled)("securities and stock holdings (database)", () => {
  let admin: Db;
  type U = Awaited<ReturnType<typeof signedInUser>>;
  let owner: U, member: U, leader: U, outsider: U;
  let householdId = "";
  const secIds: Record<string, string> = {};
  const holdingIds: string[] = [];

  beforeAll(async () => {
    admin = createClient<Database>(url!, adminKey!, opts);
    const rows = [
      { symbol: TAG, name: "Exact Symbol Co" }, // exact symbol
      { symbol: `${TAG}X`, name: "Prefix Symbol Co" }, // symbol prefix
      { symbol: "NAMEP", name: `${TAG} Industries` }, // name prefix
      { symbol: "WORDS", name: `Mega ${TAG} Holdings` }, // word start inside name
      { symbol: `ZZ${TAG}`, name: "Contains Co" }, // anywhere in symbol
      { symbol: "GONE", name: `${TAG} Delisted`, active: false },
    ].map((r) => ({ active: true, ...r, exchange: EXCHANGE, country: "IN", currency: "INR" }));
    const { data, error } = await admin.from("securities").insert(rows).select("id, symbol");
    if (error) throw error;
    for (const r of data ?? []) secIds[r.symbol] = r.id;

    leader = await signedInUser(admin, "leader");
    owner = await signedInUser(admin, "owner");
    member = await signedInUser(admin, "member");
    outsider = await signedInUser(admin, "outsider");
    const { data: hid, error: e1 } = await leader.client.rpc("create_household", { _name: "Equity test household" });
    if (e1) throw e1;
    householdId = hid as string;
    const { data: code } = await leader.client.rpc("get_invite_code");
    for (const u of [owner, member]) {
      const { data: rid, error: e } = await u.client.rpc("request_join", { _code: code as string, _claim_profile_id: null as unknown as string, _consent: true });
      if (e) throw e;
      const { error: e2 } = await leader.client.rpc("decide_join", { _request_id: rid as string, _approve: true });
      if (e2) throw e2;
    }

    const { data: h, error: e3 } = await owner.client
      .from("equity_holdings")
      .insert([
        { owner_profile_id: owner.profileId, security_id: secIds[TAG]!, quantity: 10, avg_buy_price: 100, currency: "INR", is_hidden: false },
        { owner_profile_id: owner.profileId, security_id: secIds[`${TAG}X`]!, quantity: 5, currency: "INR", is_hidden: true },
      ])
      .select("id");
    if (e3) throw e3;
    holdingIds.push(...(h ?? []).map((r) => r.id));
  }, 90_000);

  afterAll(async () => {
    if (!admin) return;
    if (holdingIds.length) await admin.from("equity_holdings").delete().in("id", holdingIds);
    const ids = [owner, member, leader, outsider].filter(Boolean).map((u) => u.id);
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    await admin.from("join_requests").delete().in("requester_user_id", ids);
    await admin.from("notifications").delete().in("user_id", ids);
    await admin.from("profiles").delete().in("owner_user_id", ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    await admin.from("securities").delete().eq("exchange", EXCHANGE);
  }, 60_000);

  const visible = async (u: U) => {
    const { data, error } = await u.client.from("equity_holdings").select("quantity").in("id", holdingIds);
    if (error) throw error;
    return (data ?? []).map((r) => Number(r.quantity)).sort((a, b) => a - b);
  };

  describe("search_securities", () => {
    it("returns exact, then prefix, then other matches, and skips delisted ones", async () => {
      const { data, error } = await owner.client.rpc("search_securities", { _q: TAG.toLowerCase(), _limit: 10 });
      if (error) throw error;
      expect((data ?? []).map((s) => s.name)).toEqual(["Exact Symbol Co", "Prefix Symbol Co", `${TAG} Industries`, `Mega ${TAG} Holdings`, "Contains Co"]);
    });
    it("never returns more than 10 rows", async () => {
      const { data } = await owner.client.rpc("search_securities", { _q: "a", _limit: 50 });
      expect((data ?? []).length).toBeLessThanOrEqual(10);
    });
    it("treats % and _ as plain characters", async () => {
      const { data } = await owner.client.rpc("search_securities", { _q: "%" });
      expect(data ?? []).toEqual([]);
    });
  });

  it("signed-in users can read the securities list but not change it", async () => {
    const { data } = await member.client.from("securities").select("id").eq("exchange", EXCHANGE);
    expect((data ?? []).length).toBe(6);
    const { error } = await member.client.from("securities").insert({ symbol: "NEW", name: "Nope", exchange: EXCHANGE, country: "IN", currency: "INR" });
    expect(error).not.toBeNull();
  });

  it("a household member cannot read a hidden stock holding", async () => {
    expect(await visible(member)).toEqual([10]);
  });

  it("the household leader cannot read a hidden stock holding", async () => {
    expect(await visible(leader)).toEqual([10]);
  });

  it("a non-member cannot read any stock holding", async () => {
    expect(await visible(outsider)).toEqual([]);
  });

  it("the owner reads every stock holding, hidden or not", async () => {
    expect(await visible(owner)).toEqual([5, 10]);
  });

  it("other members can't edit or add stock holdings on the owner's profile", async () => {
    const { data } = await member.client.from("equity_holdings").update({ quantity: 1 }).in("id", holdingIds).select("id");
    expect(data ?? []).toEqual([]);
    const { error } = await member.client.from("equity_holdings").insert({ owner_profile_id: owner.profileId, security_id: secIds[`ZZ${TAG}`]!, quantity: 1, currency: "INR" });
    expect(error).not.toBeNull();
  });

  it("'make everything private' hides even unhidden stock holdings from the household", async () => {
    await owner.client.from("profiles").update({ hide_everything: true }).eq("id", owner.profileId);
    expect(await visible(member)).toEqual([]);
    expect(await visible(owner)).toEqual([5, 10]);
    await owner.client.from("profiles").update({ hide_everything: false }).eq("id", owner.profileId);
  });
});
