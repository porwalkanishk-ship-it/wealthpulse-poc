-- ---------- invite codes ----------
CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  code text := '';
  i int;
BEGIN
  FOR i IN 0..11 LOOP
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- ---------- tables ----------
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  invite_code text NOT NULL UNIQUE DEFAULT public.gen_invite_code() CHECK (char_length(invite_code) >= 10),
  display_currency text NOT NULL DEFAULT 'INR' CHECK (display_currency IN ('INR','USD','EUR','GBP','AED','SGD','CAD','AUD')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  CONSTRAINT household_members_one_household UNIQUE (user_id)
);
CREATE UNIQUE INDEX household_members_one_leader ON public.household_members (household_id) WHERE role = 'leader';

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid,
  managed_by_user_id uuid,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  relationship text NOT NULL DEFAULT 'self' CHECK (char_length(relationship) BETWEEN 1 AND 40),
  hide_everything boolean NOT NULL DEFAULT false,
  country text CHECK (country IS NULL OR char_length(country) <= 60),
  base_currency text NOT NULL DEFAULT 'INR' CHECK (base_currency IN ('INR','USD','EUR','GBP','AED','SGD','CAD','AUD')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_has_controller CHECK (owner_user_id IS NOT NULL OR managed_by_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX profiles_one_self ON public.profiles (owner_user_id) WHERE relationship = 'self';
CREATE INDEX profiles_owner_idx ON public.profiles (owner_user_id);
CREATE INDEX profiles_manager_idx ON public.profiles (managed_by_user_id);

CREATE TABLE public.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  household_name text NOT NULL,
  requester_user_id uuid NOT NULL,
  requester_name text NOT NULL,
  claim_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  leader_decision text CHECK (leader_decision IN ('approved','declined')),
  creator_decision text CHECK (creator_decision IN ('approved','declined')),
  consent_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  claim_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX join_requests_one_pending ON public.join_requests (requester_user_id) WHERE status = 'pending';
CREATE INDEX join_requests_household_idx ON public.join_requests (household_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- ---------- ownership + privacy on data rows ----------
ALTER TABLE public.holdings ADD COLUMN owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.loans ADD COLUMN owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.policies ADD COLUMN owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.sip_installments ADD COLUMN owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.loan_events ADD COLUMN owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
CREATE INDEX holdings_owner_idx ON public.holdings (owner_profile_id);
CREATE INDEX loans_owner_idx ON public.loans (owner_profile_id);
CREATE INDEX policies_owner_idx ON public.policies (owner_profile_id);
CREATE INDEX sip_installments_owner_idx ON public.sip_installments (owner_profile_id);
CREATE INDEX loan_events_owner_idx ON public.loan_events (owner_profile_id);

-- ---------- helper functions (security definer, used by policies) ----------
CREATE OR REPLACE FUNCTION public.my_household_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_household_leader(_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household_id AND user_id = auth.uid() AND role = 'leader')
$$;

CREATE OR REPLACE FUNCTION public.can_write_profile(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _profile_id
      AND (p.owner_user_id = auth.uid() OR (p.owner_user_id IS NULL AND p.managed_by_user_id = auth.uid()))
  )
$$;

CREATE OR REPLACE FUNCTION public.profile_household_id(_profile_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hm.household_id
  FROM public.profiles p
  JOIN public.household_members hm ON hm.user_id = COALESCE(p.owner_user_id, p.managed_by_user_id)
  WHERE p.id = _profile_id
$$;

CREATE OR REPLACE FUNCTION public.can_see_profile(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_write_profile(_profile_id)
      OR (public.profile_household_id(_profile_id) IS NOT NULL AND public.profile_household_id(_profile_id) = public.my_household_id())
$$;

CREATE OR REPLACE FUNCTION public.can_read_row(_profile_id uuid, _is_hidden boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_write_profile(_profile_id) OR (
    NOT COALESCE(_is_hidden, true) AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.household_members ho ON ho.user_id = COALESCE(p.owner_user_id, p.managed_by_user_id)
      JOIN public.household_members hv ON hv.household_id = ho.household_id AND hv.user_id = auth.uid()
      WHERE p.id = _profile_id AND NOT p.hide_everything
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_profile_creator(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _profile_id AND managed_by_user_id = auth.uid())
$$;

-- ---------- child rows inherit owner + privacy from their parent ----------
CREATE OR REPLACE FUNCTION public.sync_installment_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT h.owner_profile_id, h.is_hidden INTO NEW.owner_profile_id, NEW.is_hidden FROM public.holdings h WHERE h.id = NEW.holding_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sip_installments_sync_owner BEFORE INSERT OR UPDATE ON public.sip_installments
FOR EACH ROW EXECUTE FUNCTION public.sync_installment_owner();

CREATE OR REPLACE FUNCTION public.sync_loan_event_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT l.owner_profile_id, l.is_hidden INTO NEW.owner_profile_id, NEW.is_hidden FROM public.loans l WHERE l.id = NEW.loan_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER loan_events_sync_owner BEFORE INSERT OR UPDATE ON public.loan_events
FOR EACH ROW EXECUTE FUNCTION public.sync_loan_event_owner();

CREATE OR REPLACE FUNCTION public.cascade_holding_privacy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sip_installments SET is_hidden = NEW.is_hidden WHERE holding_id = NEW.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER holdings_cascade_privacy AFTER UPDATE OF owner_profile_id, is_hidden ON public.holdings
FOR EACH ROW WHEN (OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id OR OLD.is_hidden IS DISTINCT FROM NEW.is_hidden)
EXECUTE FUNCTION public.cascade_holding_privacy();

CREATE OR REPLACE FUNCTION public.cascade_loan_privacy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.loan_events SET is_hidden = NEW.is_hidden WHERE loan_id = NEW.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER loans_cascade_privacy AFTER UPDATE OF owner_profile_id, is_hidden ON public.loans
FOR EACH ROW WHEN (OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id OR OLD.is_hidden IS DISTINCT FROM NEW.is_hidden)
EXECUTE FUNCTION public.cascade_loan_privacy();

-- ---------- notifications helper ----------
CREATE OR REPLACE FUNCTION public._notify(_user uuid, _type text, _title text, _body text, _link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, type, title, body, link) VALUES (_user, _type, left(_title, 200), left(_body, 500), _link)
$$;

-- ---------- onboarding + household actions ----------
CREATE OR REPLACE FUNCTION public.complete_onboarding(_full_name text, _country text, _base_currency text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  _full_name := btrim(coalesce(_full_name, ''));
  IF char_length(_full_name) < 1 OR char_length(_full_name) > 80 THEN RAISE EXCEPTION 'Enter your full name'; END IF;
  IF coalesce(_base_currency, '') NOT IN ('INR','USD','EUR','GBP','AED','SGD','CAD','AUD') THEN RAISE EXCEPTION 'Pick a supported currency'; END IF;
  INSERT INTO public.profiles (owner_user_id, display_name, relationship, country, base_currency)
  VALUES (uid, _full_name, 'self', nullif(left(btrim(coalesce(_country, '')), 60), ''), _base_currency)
  ON CONFLICT (owner_user_id) WHERE relationship = 'self'
  DO UPDATE SET display_name = EXCLUDED.display_name, country = EXCLUDED.country, base_currency = EXCLUDED.base_currency
  RETURNING id INTO pid;
  RETURN pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_household(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  me public.profiles;
  hid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  SELECT * INTO me FROM public.profiles WHERE owner_user_id = uid AND relationship = 'self';
  IF NOT FOUND THEN RAISE EXCEPTION 'Finish your profile first'; END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = uid) THEN RAISE EXCEPTION 'You are already in a household'; END IF;
  _name := btrim(coalesce(_name, ''));
  IF _name = '' THEN _name := split_part(me.display_name, ' ', 1) || '''s household'; END IF;
  INSERT INTO public.households (name, display_currency) VALUES (left(_name, 80), me.base_currency) RETURNING id INTO hid;
  INSERT INTO public.household_members (household_id, user_id, role) VALUES (hid, uid, 'leader');
  UPDATE public.join_requests SET status = 'cancelled' WHERE requester_user_id = uid AND status = 'pending';
  RETURN hid;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_household(_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h public.households;
  norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF char_length(norm) < 10 THEN RETURN NULL; END IF;
  SELECT * INTO h FROM public.households WHERE invite_code = norm;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'member_count', (SELECT count(*) FROM public.household_members WHERE household_id = h.id),
    'claimable', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'relationship', p.relationship) ORDER BY p.display_name)
      FROM public.profiles p
      JOIN public.household_members hm ON hm.user_id = p.managed_by_user_id AND hm.household_id = h.id
      WHERE p.owner_user_id IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_join(_code text, _claim_profile_id uuid, _consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  me public.profiles;
  h public.households;
  claim public.profiles;
  leader uuid;
  rid uuid;
  norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF NOT coalesce(_consent, false) THEN RAISE EXCEPTION 'Please confirm you understand what the household will see'; END IF;
  SELECT * INTO me FROM public.profiles WHERE owner_user_id = uid AND relationship = 'self';
  IF NOT FOUND THEN RAISE EXCEPTION 'Finish your profile first'; END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = uid) THEN RAISE EXCEPTION 'You are already in a household. Leave it first.'; END IF;
  IF EXISTS (SELECT 1 FROM public.join_requests WHERE requester_user_id = uid AND status = 'pending') THEN RAISE EXCEPTION 'You already have a pending request. Cancel it first.'; END IF;
  SELECT * INTO h FROM public.households WHERE invite_code = norm;
  IF NOT FOUND THEN RAISE EXCEPTION 'No household matches that ID'; END IF;
  IF _claim_profile_id IS NOT NULL THEN
    SELECT p.* INTO claim FROM public.profiles p
    JOIN public.household_members hm ON hm.user_id = p.managed_by_user_id AND hm.household_id = h.id
    WHERE p.id = _claim_profile_id AND p.owner_user_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'That profile can no longer be claimed'; END IF;
  END IF;
  INSERT INTO public.join_requests (household_id, household_name, requester_user_id, requester_name, claim_profile_id)
  VALUES (h.id, h.name, uid, me.display_name, _claim_profile_id)
  RETURNING id INTO rid;
  SELECT user_id INTO leader FROM public.household_members WHERE household_id = h.id AND role = 'leader';
  PERFORM public._notify(leader, 'join_request', me.display_name || ' wants to join ' || h.name,
    CASE WHEN _claim_profile_id IS NOT NULL THEN 'They say they are "' || claim.display_name || '".' ELSE 'Review the request on the Household page.' END,
    '/household');
  IF _claim_profile_id IS NOT NULL AND claim.managed_by_user_id IS DISTINCT FROM leader THEN
    PERFORM public._notify(claim.managed_by_user_id, 'claim_request', me.display_name || ' says they are "' || claim.display_name || '"',
      'You added this profile. Confirm on the Household page if it is them.', '/household');
  END IF;
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_join_request(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.join_requests SET status = 'cancelled', decided_at = now()
  WHERE id = _request_id AND requester_user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'That request is no longer pending'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._try_complete_claim(_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.join_requests;
  p public.profiles;
  req_hide boolean;
BEGIN
  SELECT * INTO r FROM public.join_requests WHERE id = _request_id FOR UPDATE;
  IF r.claim_profile_id IS NULL OR r.claim_completed_at IS NOT NULL THEN RETURN false; END IF;
  IF r.status <> 'approved' OR r.leader_decision IS DISTINCT FROM 'approved' OR r.creator_decision IS DISTINCT FROM 'approved' THEN RETURN false; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = r.claim_profile_id FOR UPDATE;
  IF NOT FOUND OR p.owner_user_id IS NOT NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE user_id = r.requester_user_id AND household_id = r.household_id) THEN RETURN false; END IF;
  SELECT hide_everything INTO req_hide FROM public.profiles WHERE owner_user_id = r.requester_user_id AND relationship = 'self';
  UPDATE public.profiles SET owner_user_id = r.requester_user_id, hide_everything = coalesce(req_hide, false) WHERE id = p.id;
  UPDATE public.join_requests SET claim_completed_at = now() WHERE id = r.id;
  PERFORM public._notify(r.requester_user_id, 'claim_completed', 'You now own "' || p.display_name || '"',
    'Everything on that profile is yours to edit and hide.', '/household');
  PERFORM public._notify(p.managed_by_user_id, 'claim_completed', r.requester_name || ' now owns "' || p.display_name || '"',
    'You can still see what they leave visible, but can no longer edit it.', '/household');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_join(_request_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.join_requests;
BEGIN
  SELECT * INTO r FROM public.join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_household_leader(r.household_id) THEN RAISE EXCEPTION 'Only the household leader can decide this request'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request was already handled'; END IF;
  IF _approve THEN
    IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = r.requester_user_id) THEN
      UPDATE public.join_requests SET status = 'cancelled', decided_at = now() WHERE id = r.id;
      RAISE EXCEPTION 'They have already joined another household';
    END IF;
    INSERT INTO public.household_members (household_id, user_id, role) VALUES (r.household_id, r.requester_user_id, 'member');
    UPDATE public.join_requests SET status = 'approved', leader_decision = 'approved', decided_at = now() WHERE id = r.id;
    PERFORM public._notify(r.requester_user_id, 'join_approved', 'You joined ' || r.household_name,
      CASE WHEN r.claim_profile_id IS NOT NULL AND r.creator_decision IS NULL THEN 'Your profile claim is waiting for the person who added it.' ELSE 'Members now see what you leave visible.' END,
      '/household');
    PERFORM public._try_complete_claim(r.id);
  ELSE
    UPDATE public.join_requests SET status = 'declined', leader_decision = 'declined', decided_at = now() WHERE id = r.id;
    PERFORM public._notify(r.requester_user_id, 'join_declined', 'Your request to join ' || r.household_name || ' was declined', NULL, '/household');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_claim(_request_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.join_requests;
  p public.profiles;
BEGIN
  SELECT * INTO r FROM public.join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR r.claim_profile_id IS NULL THEN RAISE EXCEPTION 'There is no profile claim on this request'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = r.claim_profile_id;
  IF p.managed_by_user_id IS DISTINCT FROM auth.uid() OR p.owner_user_id IS NOT NULL THEN RAISE EXCEPTION 'Only the person who added this profile can confirm the claim'; END IF;
  IF r.status NOT IN ('pending', 'approved') OR r.creator_decision IS NOT NULL THEN RAISE EXCEPTION 'This claim was already handled'; END IF;
  UPDATE public.join_requests SET creator_decision = CASE WHEN _approve THEN 'approved' ELSE 'declined' END WHERE id = r.id;
  IF _approve THEN
    IF NOT public._try_complete_claim(r.id) THEN
      PERFORM public._notify(r.requester_user_id, 'claim_approved', 'Your claim on "' || p.display_name || '" was confirmed',
        'It takes effect once the household leader approves your request.', '/household');
    END IF;
  ELSE
    PERFORM public._notify(r.requester_user_id, 'claim_declined', 'Your claim on "' || p.display_name || '" was not confirmed',
      CASE WHEN r.status = 'pending' THEN 'Your request to join is still with the leader.' ELSE NULL END, '/household');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  m public.household_members;
  next_leader uuid;
  hname text;
  myname text;
  rec record;
BEGIN
  SELECT * INTO m FROM public.household_members WHERE user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not in a household'; END IF;
  SELECT name INTO hname FROM public.households WHERE id = m.household_id;
  SELECT display_name INTO myname FROM public.profiles WHERE owner_user_id = uid AND relationship = 'self';
  DELETE FROM public.household_members WHERE user_id = uid;

  -- Claims on no-login profiles I added can no longer complete.
  FOR rec IN
    UPDATE public.join_requests jr SET creator_decision = 'declined'
    FROM public.profiles p
    WHERE p.id = jr.claim_profile_id AND p.managed_by_user_id = uid AND p.owner_user_id IS NULL
      AND jr.claim_completed_at IS NULL AND jr.creator_decision IS NULL AND jr.status IN ('pending', 'approved')
    RETURNING jr.requester_user_id, p.display_name
  LOOP
    PERFORM public._notify(rec.requester_user_id, 'claim_declined', 'Your claim on "' || rec.display_name || '" can''t complete',
      'The person who added that profile left the household.', '/household');
  END LOOP;

  IF m.role = 'leader' THEN
    SELECT user_id INTO next_leader FROM public.household_members WHERE household_id = m.household_id ORDER BY joined_at, user_id LIMIT 1;
    IF next_leader IS NULL THEN
      FOR rec IN SELECT requester_user_id FROM public.join_requests WHERE household_id = m.household_id AND status = 'pending' LOOP
        PERFORM public._notify(rec.requester_user_id, 'join_declined', hname || ' was closed', 'The household no longer exists, so your request was cancelled.', '/household');
      END LOOP;
      DELETE FROM public.households WHERE id = m.household_id;
    ELSE
      UPDATE public.household_members SET role = 'leader' WHERE household_id = m.household_id AND user_id = next_leader;
      PERFORM public._notify(next_leader, 'leadership', 'You are now the leader of ' || hname,
        coalesce(myname, 'The previous leader') || ' left. You can now approve requests and share the invite code.', '/household');
    END IF;
  ELSE
    SELECT user_id INTO next_leader FROM public.household_members WHERE household_id = m.household_id AND role = 'leader';
    IF next_leader IS NOT NULL THEN
      PERFORM public._notify(next_leader, 'member_left', coalesce(myname, 'A member') || ' left ' || hname, NULL, '/household');
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_managed_profile(_name text, _relationship text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rel text := btrim(coalesce(_relationship, ''));
  pid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  _name := btrim(coalesce(_name, ''));
  IF char_length(_name) < 1 OR char_length(_name) > 80 THEN RAISE EXCEPTION 'Enter a name'; END IF;
  IF rel = '' OR lower(rel) = 'self' THEN rel := 'Family'; END IF;
  INSERT INTO public.profiles (owner_user_id, managed_by_user_id, display_name, relationship, base_currency)
  VALUES (NULL, uid, _name, left(rel, 40), coalesce((SELECT base_currency FROM public.profiles WHERE owner_user_id = uid AND relationship = 'self'), 'INR'))
  RETURNING id INTO pid;
  RETURN pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_invite_code()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.invite_code FROM public.households h
  JOIN public.household_members hm ON hm.household_id = h.id
  WHERE hm.user_id = auth.uid() AND hm.role = 'leader'
$$;

CREATE OR REPLACE FUNCTION public.rotate_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hid uuid;
  code text;
BEGIN
  SELECT household_id INTO hid FROM public.household_members WHERE user_id = auth.uid() AND role = 'leader';
  IF hid IS NULL THEN RAISE EXCEPTION 'Only the household leader can do this'; END IF;
  UPDATE public.households SET invite_code = public.gen_invite_code() WHERE id = hid RETURNING invite_code INTO code;
  RETURN code;
END;
$$;

-- ---------- function privileges ----------
REVOKE ALL ON FUNCTION public.gen_invite_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notify(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._try_complete_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_installment_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_loan_event_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cascade_holding_privacy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cascade_loan_privacy() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.my_household_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_household_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_household_leader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_household_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_see_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_row(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_profile_creator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_onboarding(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_household(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lookup_household(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_join(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_join_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_join(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_claim(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_household() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_managed_profile(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_invite_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotate_invite_code() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_household_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_leader(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_household_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_row(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_household(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_join(text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_join(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_claim(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_household() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_managed_profile(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_invite_code() TO authenticated;

-- ---------- table grants ----------
GRANT SELECT (id, name, display_currency, created_at) ON public.households TO authenticated;
GRANT UPDATE (name, display_currency) ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;

GRANT SELECT ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;

GRANT SELECT, DELETE ON public.profiles TO authenticated;
GRANT UPDATE (display_name, hide_everything, country, base_currency) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.join_requests TO authenticated;
GRANT ALL ON public.join_requests TO service_role;

GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings, public.loans, public.policies, public.sip_installments, public.loan_events TO authenticated;
GRANT ALL ON public.holdings, public.loans, public.policies, public.sip_installments, public.loan_events TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read their household" ON public.households FOR SELECT TO authenticated USING (public.is_household_member(id));
CREATE POLICY "leader updates household" ON public.households FOR UPDATE TO authenticated USING (public.is_household_leader(id)) WITH CHECK (public.is_household_leader(id));

CREATE POLICY "members read membership" ON public.household_members FOR SELECT TO authenticated USING (household_id = public.my_household_id());

CREATE POLICY "read visible profiles" ON public.profiles FOR SELECT TO authenticated USING (public.can_see_profile(id));
CREATE POLICY "edit own or managed profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.can_write_profile(id)) WITH CHECK (public.can_write_profile(id));
CREATE POLICY "delete unclaimed managed profiles" ON public.profiles FOR DELETE TO authenticated USING (owner_user_id IS NULL AND managed_by_user_id = auth.uid());

CREATE POLICY "read related join requests" ON public.join_requests FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid() OR public.is_household_leader(household_id) OR (claim_profile_id IS NOT NULL AND public.is_profile_creator(claim_profile_id)));

CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mark own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own holdings" ON public.holdings;
DROP POLICY IF EXISTS "own loans" ON public.loans;
DROP POLICY IF EXISTS "own policies" ON public.policies;
DROP POLICY IF EXISTS "own installments" ON public.sip_installments;
DROP POLICY IF EXISTS "own loan events" ON public.loan_events;

CREATE POLICY "read visible holdings" ON public.holdings FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add holdings to own profiles" ON public.holdings FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit holdings on own profiles" ON public.holdings FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete holdings on own profiles" ON public.holdings FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

CREATE POLICY "read visible loans" ON public.loans FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add loans to own profiles" ON public.loans FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit loans on own profiles" ON public.loans FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete loans on own profiles" ON public.loans FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

CREATE POLICY "read visible policies" ON public.policies FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add policies to own profiles" ON public.policies FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit policies on own profiles" ON public.policies FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete policies on own profiles" ON public.policies FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

CREATE POLICY "read visible installments" ON public.sip_installments FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add installments to own profiles" ON public.sip_installments FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit installments on own profiles" ON public.sip_installments FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete installments on own profiles" ON public.sip_installments FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

CREATE POLICY "read visible loan events" ON public.loan_events FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add loan events to own profiles" ON public.loan_events FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit loan events on own profiles" ON public.loan_events FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete loan events on own profiles" ON public.loan_events FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));