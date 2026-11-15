import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { householdQuery, useHousehold, useRpc, type JoinRequest } from "@/lib/household";
import { Badge, Btn, Field, Panel, PanelHeader, SelectInput, TextInput } from "@/components/wp/ui";

export const Route = createFileRoute("/_authenticated/household")({
  head: () => ({ meta: [{ title: "Household — WealthPulse" }] }),
  component: HouseholdPage,
});

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

function HouseholdPage() {
  const { data, isLoading, error } = useHousehold();
  if (isLoading) return <div className="px-4 md:px-6 pt-5 text-mut">Loading…</div>;
  if (error || !data) return <div className="px-4 md:px-6 pt-5 text-co">Couldn't load your household. Please refresh.</div>;
  return (
    <div className="px-4 md:px-6 pt-5 pb-16 grid gap-5 lg:grid-cols-2 items-start">
      {data.household ? <InHousehold /> : <NoHousehold />}
      <PrivacyPanel />
    </div>
  );
}

/* ------------------------------ no household yet ------------------------------ */

function NoHousehold() {
  const { data } = useHousehold();
  const pending = data?.requests.find((r) => r.requester_user_id === data.userId && r.status === "pending");
  const cancel = useRpc((id: string) => supabase.rpc("cancel_join_request", { _request_id: id }));
  if (pending) {
    return (
      <Panel>
        <PanelHeader title="Waiting for approval" />
        <div className="p-4 space-y-3">
          <p>
            You asked to join <b className="text-hi">{pending.household_name}</b>. The household leader needs to approve.
            {pending.claim_profile_id ? " The person who added the profile you're claiming must also confirm." : ""}
          </p>
          <div className="flex gap-2 text-[12px]">
            <Badge tone={pending.leader_decision === "approved" ? "em" : "amber"}>Leader: {pending.leader_decision ?? "pending"}</Badge>
            {pending.claim_profile_id ? <Badge tone={pending.creator_decision === "approved" ? "em" : "amber"}>Creator: {pending.creator_decision ?? "pending"}</Badge> : null}
          </div>
          <Btn variant="secondary" onClick={() => cancel.mutate(pending.id, { onError: fail })}>
            Cancel request
          </Btn>
        </div>
      </Panel>
    );
  }
  return (
    <div className="space-y-5">
      <CreateHousehold />
      <JoinHousehold />
    </div>
  );
}

function CreateHousehold() {
  const [name, setName] = useState("");
  const create = useRpc((n: string) => supabase.rpc("create_household", { _name: n }));
  return (
    <Panel>
      <PanelHeader title="Start a household" />
      <div className="p-4 space-y-3">
        <p className="text-mut">You become the household leader and approve anyone who wants to join.</p>
        <Field label="Household name">
          <TextInput sans value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Porwal family" maxLength={80} />
        </Field>
        <Btn disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name.trim(), { onSuccess: () => toast.success("Household created"), onError: fail })}>
          Create household
        </Btn>
      </div>
    </Panel>
  );
}

interface Found {
  id: string;
  name: string;
  member_count: number;
  claimable: { id: string; display_name: string; relationship: string }[];
}

function JoinHousehold() {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [claim, setClaim] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const join = useRpc((a: { code: string; claim: string | null }) =>
    supabase.rpc("request_join", { _code: a.code, _claim_profile_id: a.claim as unknown as string, _consent: true }),
  );

  async function lookup() {
    setBusy(true);
    const { data, error } = await supabase.rpc("lookup_household", { _code: code });
    setBusy(false);
    if (error) {
      fail(error);
      return;
    }
    if (!data) {
      setFound(null);
      toast.error("No household matches that ID");
      return;
    }
    setFound(data as unknown as Found);
    setClaim("");
    setConsent(false);
  }

  return (
    <Panel>
      <PanelHeader title="Join an existing household" />
      <div className="p-4 space-y-3">
        <Field label="Household ID" hint="Ask the household leader for their ID.">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="12-character ID" maxLength={20} />
        </Field>
        <Btn variant="secondary" disabled={code.trim().length < 10 || busy} onClick={() => void lookup()}>
          Find household
        </Btn>
        {found ? (
          <div className="border-t border-line pt-3 space-y-3">
            <p>
              <b className="text-hi">{found.name}</b> · {found.member_count} member{found.member_count === 1 ? "" : "s"}
            </p>
            {found.claimable.length ? (
              <Field label="Has someone already added you?" hint="If a family member created a profile for you, claim it so your history comes with you.">
                <SelectInput value={claim} onChange={(e) => setClaim(e.target.value)}>
                  <option value="">No, I'm new</option>
                  {found.claimable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name} ({c.relationship})
                    </option>
                  ))}
                </SelectInput>
              </Field>
            ) : null}
            <label className="flex gap-2 items-start text-[12.5px] text-soft">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
              <span>
                I understand that the people in this household will see my investments, loans and policies in the household view, except the items I mark private.
              </span>
            </label>
            <Btn
              disabled={!consent || join.isPending}
              onClick={() => join.mutate({ code, claim: claim || null }, { onSuccess: () => toast.success("Request sent to the household leader"), onError: fail })}
            >
              Ask to join
            </Btn>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/* ------------------------------ in a household ------------------------------ */

function InHousehold() {
  const { data } = useHousehold();
  const qc = useQueryClient();
  const h = data!.household!;
  const isLeader = data!.role === "leader";
  const leave = useRpc(() => supabase.rpc("leave_household"));
  const [confirmLeave, setConfirmLeave] = useState(false);
  const mine = data!.userId;
  const byId = new Map(data!.profiles.map((p) => [p.id, p]));
  const todo = data!.requests.filter((r) => {
    if (r.household_id !== h.id) return false;
    const leaderTodo = isLeader && r.status === "pending" && !r.leader_decision;
    const creatorTodo = !!r.claim_profile_id && r.creator_decision === null && ["pending", "approved"].includes(r.status) && byId.get(r.claim_profile_id)?.managed_by_user_id === mine;
    return leaderTodo || creatorTodo;
  });

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title={h.name}>
          <Badge tone={isLeader ? "em" : "slate"} className="ml-auto">
            {isLeader ? "Leader" : "Member"}
          </Badge>
        </PanelHeader>
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            {data!.members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2">
                <span className="text-hi">{m.name}</span>
                {m.user_id === mine ? <Badge tone="outline">you</Badge> : null}
                {m.role === "leader" ? <Badge tone="em">leader</Badge> : null}
                <span className="ml-auto text-[11px] text-mut">joined {new Date(m.joined_at).toLocaleDateString("en-IN")}</span>
              </div>
            ))}
          </div>
          {confirmLeave ? (
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-co">Leave this household? Your data stays yours.</span>
              <Btn variant="danger" size="sm" onClick={() => leave.mutate(undefined as never, { onSuccess: () => toast.success("You left the household"), onError: fail })}>
                Yes, leave
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}>
                Stay
              </Btn>
            </div>
          ) : (
            <Btn variant="ghost" onClick={() => setConfirmLeave(true)}>
              Leave household
            </Btn>
          )}
        </div>
      </Panel>

      {todo.length ? (
        <Panel>
          <PanelHeader title="Needs your decision" />
          <div className="p-4 space-y-4">
            {todo.map((r) => (
              <RequestRow key={r.id} r={r} isLeader={isLeader} claimName={r.claim_profile_id ? byId.get(r.claim_profile_id)?.display_name : undefined} mine={mine} claimCreator={r.claim_profile_id ? byId.get(r.claim_profile_id)?.managed_by_user_id : null} />
            ))}
          </div>
        </Panel>
      ) : null}

      {isLeader ? <InviteCode /> : null}
      <ManagedProfiles onChanged={() => void qc.invalidateQueries({ queryKey: householdQuery.queryKey })} />
    </div>
  );
}

function RequestRow({ r, isLeader, claimName, mine, claimCreator }: { r: JoinRequest; isLeader: boolean; claimName: string | undefined; mine: string; claimCreator: string | null | undefined }) {
  const join = useRpc((a: boolean) => supabase.rpc("decide_join", { _request_id: r.id, _approve: a }));
  const claim = useRpc((a: boolean) => supabase.rpc("decide_claim", { _request_id: r.id, _approve: a }));
  const needsLeader = isLeader && r.status === "pending" && !r.leader_decision;
  const needsCreator = !!r.claim_profile_id && r.creator_decision === null && claimCreator === mine;
  return (
    <div className="space-y-2">
      <div>
        <b className="text-hi">{r.requester_name}</b> {needsLeader ? "wants to join your household." : "says they are a profile you added."}
        {claimName ? <span className="text-mut"> Claiming “{claimName}”.</span> : null}
      </div>
      <div className="text-[11.5px] text-mut">They agreed to the consent notice on {new Date(r.consent_at).toLocaleDateString("en-IN")}.</div>
      <div className="flex gap-2 flex-wrap">
        {needsLeader ? (
          <>
            <Btn size="sm" onClick={() => join.mutate(true, { onError: fail })}>Approve to join</Btn>
            <Btn size="sm" variant="danger" onClick={() => join.mutate(false, { onError: fail })}>Decline</Btn>
          </>
        ) : null}
        {needsCreator ? (
          <>
            <Btn size="sm" variant="secondary" onClick={() => claim.mutate(true, { onError: fail })}>Yes, that's them</Btn>
            <Btn size="sm" variant="danger" onClick={() => claim.mutate(false, { onError: fail })}>No</Btn>
          </>
        ) : null}
      </div>
    </div>
  );
}

function InviteCode() {
  const [rotated, setRotated] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["invite-code"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invite_code");
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const qc = useQueryClient();
  const code = rotated ?? data ?? "";
  async function rotate() {
    const { data: c, error } = await supabase.rpc("rotate_invite_code");
    if (error) {
      fail(error);
      return;
    }
    setRotated(c);
    void qc.invalidateQueries({ queryKey: ["invite-code"] });
    toast.success("New household ID created. The old one no longer works.");
  }
  return (
    <Panel>
      <PanelHeader title="Household ID" />
      <div className="p-4 space-y-3">
        <p className="text-mut">Share this ID with family. They still need your approval to join.</p>
        <div className="n text-[20px] tracking-[0.2em] text-hi">{code || "…"}</div>
        <div className="flex gap-2">
          <Btn variant="secondary" disabled={!code} onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success("Copied"))}>
            Copy
          </Btn>
          <Btn variant="ghost" onClick={() => void rotate()}>
            Create a new ID
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

function ManagedProfiles({ onChanged }: { onChanged: () => void }) {
  const { data } = useHousehold();
  const [name, setName] = useState("");
  const [rel, setRel] = useState("");
  const add = useRpc((a: { name: string; rel: string }) => supabase.rpc("add_managed_profile", { _name: a.name, _relationship: a.rel }));
  const managed = (data?.profiles ?? []).filter((p) => p.owner_user_id === null && p.managed_by_user_id === data?.userId);
  return (
    <Panel>
      <PanelHeader title="People without a login" />
      <div className="p-4 space-y-3">
        <p className="text-mut">Track a parent or child here. If they sign up later, they can claim the profile with your approval.</p>
        {managed.map((p) => (
          <div key={p.id} className="flex gap-2">
            <span className="text-hi">{p.display_name}</span>
            <span className="text-mut">{p.relationship}</span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name"><TextInput sans value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="Relationship"><TextInput sans value={rel} onChange={(e) => setRel(e.target.value)} placeholder="Mother, Son…" maxLength={40} /></Field>
        </div>
        <Btn
          variant="secondary"
          disabled={!name.trim() || !rel.trim() || add.isPending}
          onClick={() => add.mutate({ name: name.trim(), rel: rel.trim() }, { onSuccess: () => { setName(""); setRel(""); onChanged(); toast.success("Profile added"); }, onError: fail })}
        >
          Add person
        </Btn>
      </div>
    </Panel>
  );
}

/* ------------------------------ privacy ------------------------------ */

function PrivacyPanel() {
  const { data } = useHousehold();
  const qc = useQueryClient();
  const me = data?.myProfile;
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  async function toggle(v: boolean) {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ hide_everything: v }).eq("id", me!.id);
    setBusy(false);
    if (error) {
      fail(error);
      return;
    }
    await qc.invalidateQueries();
    toast.success(v ? "Everything of yours is now private from the household" : "Your household can see what you haven't marked private");
  }
  return (
    <Panel>
      <PanelHeader title="Privacy" />
      <div className="p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={me.hide_everything} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
          <span>
            <span className="text-hi">Make everything of mine private</span>
            <span className="block text-mut text-[12px]">Nobody in your household sees your holdings, loans or policies, and they are left out of household totals. You still see everything in your own view.</span>
          </span>
        </label>
        <p className="text-mut text-[12px]">To hide a single item, open it and switch on “Keep private”. The household leader can't see private items either.</p>
      </div>
    </Panel>
  );
}
