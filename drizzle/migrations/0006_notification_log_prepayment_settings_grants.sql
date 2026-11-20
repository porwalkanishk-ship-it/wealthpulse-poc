-- 1. Settings: make column limits real. New tables here inherit full table privileges by default,
-- which overrode the column-level grants. Remove them, then grant only what's intended.
REVOKE ALL ON public.user_settings FROM anon, authenticated;
GRANT SELECT ON public.user_settings TO authenticated;
GRANT INSERT (user_id, email_notifications) ON public.user_settings TO authenticated;
GRANT UPDATE (email_notifications) ON public.user_settings TO authenticated;

REVOKE ALL ON public.receivable_repayments FROM anon;

-- 2. Notification log: a key, once logged, is never notified again
CREATE TABLE public.notification_log (
  user_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dedupe_key)
);
REVOKE ALL ON public.notification_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role and SECURITY DEFINER functions reach it.

INSERT INTO public.notification_log (user_id, dedupe_key, created_at)
SELECT user_id, dedupe_key, created_at FROM public.notifications WHERE dedupe_key IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._notify_once(_user uuid, _type text, _title text, _body text, _link text, _key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user IS NULL OR _key IS NULL THEN RAISE EXCEPTION 'A notification needs a user and a dedupe key'; END IF;
  INSERT INTO public.notification_log (user_id, dedupe_key) VALUES (_user, _key) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF; -- already sent once, even if since deleted
  INSERT INTO public.notifications (user_id, type, title, body, link, dedupe_key)
  VALUES (_user, _type, left(_title, 200), left(_body, 500), _link, _key)
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public._notify_once(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify_once(uuid, text, text, text, text, text) TO service_role;

-- 3. Atomic prepayment
CREATE OR REPLACE FUNCTION public.record_prepayment(_loan_id uuid, _amount numeric, _event_date date, _new_outstanding numeric, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  l public.loans;
  _eid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Please sign in again' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_write_profile(l.owner_profile_id) THEN
    RAISE EXCEPTION 'You can only record prepayments on loans you manage' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Enter a prepayment amount above zero'; END IF;
  IF _event_date IS NULL THEN RAISE EXCEPTION 'Enter the prepayment date'; END IF;
  IF _event_date < l.as_of THEN
    RAISE EXCEPTION 'The prepayment date can''t be before %', to_char(l.as_of, 'DD Mon YYYY');
  END IF;
  IF _event_date > _today THEN RAISE EXCEPTION 'The prepayment date can''t be in the future'; END IF;
  IF _new_outstanding IS NULL OR _new_outstanding < 0 THEN RAISE EXCEPTION 'The new outstanding can''t be negative'; END IF;

  UPDATE public.loans SET outstanding = _new_outstanding, as_of = _event_date WHERE id = l.id;
  INSERT INTO public.loan_events (user_id, loan_id, event_date, kind, amount, note, owner_profile_id, is_hidden)
  VALUES (_uid, l.id, _event_date, 'prepayment', _amount, nullif(left(btrim(coalesce(_note, '')), 500), ''), l.owner_profile_id, l.is_hidden)
  RETURNING id INTO _eid;
  RETURN _eid;
END;
$$;
REVOKE ALL ON FUNCTION public.record_prepayment(uuid, numeric, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_prepayment(uuid, numeric, date, numeric, text) TO authenticated, service_role;

-- 4. delete_my_data also clears the caller's notification log
CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _pids uuid[];
  _left boolean := false;
  _n int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;

  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = _uid) THEN
    PERFORM public.leave_household();
    _left := true;
  END IF;

  -- Own profile(s) plus no-login profiles this person added that nobody has claimed
  SELECT coalesce(array_agg(id), '{}') INTO _pids FROM public.profiles
  WHERE owner_user_id = _uid OR (owner_user_id IS NULL AND managed_by_user_id = _uid);

  DELETE FROM public.rsu_grants WHERE owner_profile_id = ANY(_pids);
  DELETE FROM public.equity_holdings WHERE owner_profile_id = ANY(_pids);
  DELETE FROM public.cas_imports WHERE profile_id = ANY(_pids);
  DELETE FROM public.mf_transactions WHERE owner_profile_id = ANY(_pids) OR (owner_profile_id IS NULL AND user_id = _uid);
  DELETE FROM public.sip_installments WHERE owner_profile_id = ANY(_pids) OR (owner_profile_id IS NULL AND user_id = _uid);
  DELETE FROM public.holdings WHERE owner_profile_id = ANY(_pids) OR (owner_profile_id IS NULL AND user_id = _uid);
  DELETE FROM public.loan_events WHERE owner_profile_id = ANY(_pids) OR (owner_profile_id IS NULL AND user_id = _uid);
  DELETE FROM public.loans WHERE owner_profile_id = ANY(_pids) OR (owner_profile_id IS NULL AND user_id = _uid);
  DELETE FROM public.policies WHERE owner_profile_id = ANY(_pids) OR (owner_profile_id IS NULL AND user_id = _uid);
  DELETE FROM public.members WHERE user_id = _uid;
  DELETE FROM public.cas_ai_calls WHERE user_id = _uid;
  DELETE FROM public.notifications WHERE user_id = _uid;
  DELETE FROM public.notification_log WHERE user_id = _uid;
  DELETE FROM public.join_requests WHERE requester_user_id = _uid;
  DELETE FROM public.user_settings WHERE user_id = _uid;
  DELETE FROM public.profiles WHERE id = ANY(_pids);
  GET DIAGNOSTICS _n = ROW_COUNT;

  RETURN jsonb_build_object('left_household', _left, 'profiles_deleted', _n);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;