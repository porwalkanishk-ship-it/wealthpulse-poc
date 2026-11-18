-- 1. Security fix: only answer for profiles the caller can edit
CREATE OR REPLACE FUNCTION public.cas_next_import_date(_profile_id uuid)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.can_write_profile(_profile_id) THEN
    (SELECT max((imported_at AT TIME ZONE 'Asia/Kolkata')::date) + 90 FROM public.cas_imports WHERE profile_id = _profile_id)
  END
$$;

-- 2. Receivables: interest type and repayments
ALTER TABLE public.holdings
  ADD COLUMN interest_type text NOT NULL DEFAULT 'simple' CHECK (interest_type IN ('simple', 'compound')),
  ADD COLUMN compounding_frequency text CHECK (compounding_frequency IN ('monthly', 'quarterly', 'annual'));
ALTER TABLE public.holdings ADD CONSTRAINT holdings_compound_receivable_frequency
  CHECK (NOT (interest_type = 'compound' AND category = 'receivable') OR compounding_frequency IS NOT NULL);

CREATE TABLE public.receivable_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  repayment_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receivable_repayments_holding_date_idx ON public.receivable_repayments (holding_id, repayment_date);

CREATE OR REPLACE FUNCTION public.can_read_holding(_holding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.holdings h WHERE h.id = _holding_id AND public.can_read_row(h.owner_profile_id, h.is_hidden))
$$;
CREATE OR REPLACE FUNCTION public.can_write_holding(_holding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.holdings h WHERE h.id = _holding_id AND public.can_write_profile(h.owner_profile_id))
$$;
REVOKE ALL ON FUNCTION public.can_read_holding(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_holding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_holding(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_holding(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_repayment_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.holdings WHERE id = NEW.holding_id AND category = 'receivable') THEN
    RAISE EXCEPTION 'Repayments can only be added to money you have lent';
  END IF;
  RETURN NEW;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivable_repayments TO authenticated;
GRANT ALL ON public.receivable_repayments TO service_role;
ALTER TABLE public.receivable_repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read repayments of visible receivables" ON public.receivable_repayments
  FOR SELECT TO authenticated USING (public.can_read_holding(holding_id));
CREATE POLICY "add repayments to own receivables" ON public.receivable_repayments
  FOR INSERT TO authenticated WITH CHECK (public.can_write_holding(holding_id));
CREATE POLICY "edit repayments on own receivables" ON public.receivable_repayments
  FOR UPDATE TO authenticated USING (public.can_write_holding(holding_id)) WITH CHECK (public.can_write_holding(holding_id));
CREATE POLICY "delete repayments on own receivables" ON public.receivable_repayments
  FOR DELETE TO authenticated USING (public.can_write_holding(holding_id));

CREATE TRIGGER receivable_repayments_check_parent BEFORE INSERT OR UPDATE OF holding_id ON public.receivable_repayments
  FOR EACH ROW EXECUTE FUNCTION public.check_repayment_parent();

-- 3. Notification groundwork
ALTER TABLE public.notifications ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notifications_user_dedupe_key ON public.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Write check for an explicit user (background use, where auth.uid() is not set). Not used by any policy.
CREATE OR REPLACE FUNCTION public._profile_writable_by(_user uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _profile_id
      AND (p.owner_user_id = _user OR (p.owner_user_id IS NULL AND p.managed_by_user_id = _user))
  )
$$;
REVOKE ALL ON FUNCTION public._profile_writable_by(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._profile_writable_by(uuid, uuid) TO service_role;

-- Insert a notification once per (user, key); returns true only when a new row was created
CREATE OR REPLACE FUNCTION public._notify_once(_user uuid, _type text, _title text, _body text, _link text, _key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, dedupe_key)
  VALUES (_user, _type, left(_title, 200), left(_body, 500), _link, _key)
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public._notify_once(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._notify_once(uuid, text, text, text, text, text) TO service_role;

-- CAS reminders
CREATE OR REPLACE FUNCTION public.check_cas_reminders_for(_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _r record;
  _last date;
  _n int := 0;
BEGIN
  IF _user IS NULL THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cas_notify:' || _user::text));
  FOR _r IN
    SELECT DISTINCT ON (c.profile_id) c.id, c.profile_id, c.imported_at, c.reminder_sent_at, p.display_name, p.owner_user_id
    FROM public.cas_imports c JOIN public.profiles p ON p.id = c.profile_id
    WHERE public._profile_writable_by(_user, c.profile_id)
    ORDER BY c.profile_id, c.imported_at DESC
  LOOP
    _last := (_r.imported_at AT TIME ZONE 'Asia/Kolkata')::date;
    IF _r.reminder_sent_at IS NULL AND _today >= greatest((_last + interval '3 months')::date, _last + 90) THEN
      IF public._notify_once(
        _user, 'cas_reminder',
        CASE WHEN _r.owner_user_id = _user THEN 'Time for a fresh CAS statement' ELSE 'Time for a fresh CAS for ' || _r.display_name END,
        'It has been three months since the last Detailed CAS import. Upload a new one to keep units and SIPs accurate.',
        '/holdings',
        'cas_reminder:' || _r.id::text
      ) THEN
        _n := _n + 1;
      END IF;
      UPDATE public.cas_imports SET reminder_sent_at = now() WHERE id = _r.id;
    END IF;
  END LOOP;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.check_cas_reminders_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cas_reminders_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_cas_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  RETURN public.check_cas_reminders_for(auth.uid());
END;
$$;

-- RSU notifications
CREATE OR REPLACE FUNCTION public.check_rsu_notifications_for(_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _r record;
  _n int := 0;
BEGIN
  IF _user IS NULL THEN RETURN 0; END IF;
  -- One run per user at a time, so two open tabs (or the daily run) can't race.
  PERFORM pg_advisory_xact_lock(hashtext('rsu_notify:' || _user::text));

  -- (a) Vests that are due and not yet notified
  FOR _r IN
    UPDATE public.rsu_vests v SET notified_at = now()
    FROM public.rsu_grants g
    WHERE g.id = v.grant_id
      AND public._profile_writable_by(_user, g.owner_profile_id)
      AND v.status = 'pending' AND v.vest_date <= _today AND v.notified_at IS NULL
    RETURNING v.id, v.vest_date, v.shares, g.company_name
  LOOP
    IF public._notify_once(_user, 'rsu_vest_due',
      'Confirm shares delivered for ' || _r.company_name,
      trim_scale(_r.shares)::text || ' shares were due to vest on ' || to_char(_r.vest_date, 'DD Mon YYYY') || '. Confirm how many were delivered after tax.',
      '/holdings?vest=' || _r.id::text,
      'rsu_vest:' || _r.id::text) THEN
      _n := _n + 1;
    END IF;
  END LOOP;

  -- (b) Yearly "has it listed?" check for unlisted grants
  FOR _r IN
    UPDATE public.rsu_grants g SET last_listing_check_at = now()
    WHERE public._profile_writable_by(_user, g.owner_profile_id)
      AND NOT g.listed
      AND (g.last_listing_check_at IS NULL OR g.last_listing_check_at < now() - interval '1 year')
      AND (g.listing_snoozed_until IS NULL OR g.listing_snoozed_until < _today)
    RETURNING g.id, g.company_name
  LOOP
    IF public._notify_once(_user, 'rsu_listing_check',
      'Has ' || _r.company_name || ' listed?',
      'If it now trades on an exchange, link the grant to it so its value follows the market price.',
      '/holdings?grant=' || _r.id::text,
      'rsu_listing:' || _r.id::text || ':' || _today::text) THEN
      _n := _n + 1;
    END IF;
  END LOOP;

  -- (c) Unlisted grants whose company name matches an active security, once per grant per security
  FOR _r IN
    SELECT g.id, g.company_name, s.id AS security_id, s.name AS security_name, s.symbol, s.exchange
    FROM public.rsu_grants g
    JOIN public.securities s
      ON s.active
     AND public.normalize_company_name(s.name) = public.normalize_company_name(g.company_name)
    WHERE public._profile_writable_by(_user, g.owner_profile_id)
      AND NOT g.listed
      AND public.normalize_company_name(g.company_name) <> ''
    ORDER BY g.id, s.country, s.exchange, s.symbol
  LOOP
    IF public._notify_once(_user, 'rsu_listing_match',
      _r.company_name || ' looks like it is now listed as ' || _r.security_name || '. Link it?',
      'Matched ' || _r.symbol || ' on ' || _r.exchange || '. Open the grant to link it.',
      '/holdings?grant=' || _r.id::text,
      'rsu_match:' || _r.id::text || ':' || _r.security_id::text) THEN
      _n := _n + 1;
    END IF;
  END LOOP;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.check_rsu_notifications_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rsu_notifications_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_rsu_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  RETURN public.check_rsu_notifications_for(auth.uid());
END;
$$;

-- Renewal / maturity / due-date reminders
CREATE OR REPLACE FUNCTION public.check_renewal_notifications_for(_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _r record;
  _n int := 0;
BEGIN
  IF _user IS NULL THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('renewal_notify:' || _user::text));

  -- Policy premiums due within 14 days
  FOR _r IN
    SELECT p.id, p.name, p.next_due FROM public.policies p
    WHERE public._profile_writable_by(_user, p.owner_profile_id)
      AND p.next_due BETWEEN _today AND _today + 14
  LOOP
    IF public._notify_once(_user, 'renewal_due',
      'Premium due for ' || _r.name,
      'The premium is due on ' || to_char(_r.next_due, 'DD Mon YYYY') || '.',
      '/renewals',
      'policy_due:' || _r.id::text || ':' || _r.next_due::text) THEN
      _n := _n + 1;
    END IF;
  END LOOP;

  -- Maturity dates (FDs and anything else with one) within 30 days
  FOR _r IN
    SELECT h.id, h.name, h.maturity_date FROM public.holdings h
    WHERE public._profile_writable_by(_user, h.owner_profile_id)
      AND h.maturity_date BETWEEN _today AND _today + 30
  LOOP
    IF public._notify_once(_user, 'maturity_due',
      _r.name || ' matures on ' || to_char(_r.maturity_date, 'DD Mon YYYY'),
      'Decide whether to renew it or move the money.',
      '/renewals',
      'maturity:' || _r.id::text || ':' || _r.maturity_date::text) THEN
      _n := _n + 1;
    END IF;
  END LOOP;

  -- Other due dates on holdings within 14 days
  FOR _r IN
    SELECT h.id, h.name, h.next_due FROM public.holdings h
    WHERE public._profile_writable_by(_user, h.owner_profile_id)
      AND h.next_due BETWEEN _today AND _today + 14
  LOOP
    IF public._notify_once(_user, 'holding_due',
      'Payment due for ' || _r.name,
      'Due on ' || to_char(_r.next_due, 'DD Mon YYYY') || '.',
      '/renewals',
      'holding_due:' || _r.id::text || ':' || _r.next_due::text) THEN
      _n := _n + 1;
    END IF;
  END LOOP;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.check_renewal_notifications_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_renewal_notifications_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_renewal_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  RETURN public.check_renewal_notifications_for(auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.check_renewal_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_renewal_notifications() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_daily_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _u uuid;
  _n int := 0;
BEGIN
  FOR _u IN
    SELECT owner_user_id FROM public.profiles WHERE owner_user_id IS NOT NULL
    UNION
    SELECT managed_by_user_id FROM public.profiles WHERE owner_user_id IS NULL AND managed_by_user_id IS NOT NULL
  LOOP
    _n := _n + public.check_cas_reminders_for(_u)
              + public.check_rsu_notifications_for(_u)
              + public.check_renewal_notifications_for(_u);
  END LOOP;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.run_daily_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_notifications() TO service_role;

-- 4. Per-person settings
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  email_notifications boolean NOT NULL DEFAULT false,
  email_unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  terms_accepted_at timestamptz,
  terms_version text CHECK (terms_version IS NULL OR char_length(terms_version) BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_settings_unsubscribe_token_key ON public.user_settings (email_unsubscribe_token);

GRANT SELECT ON public.user_settings TO authenticated;
GRANT INSERT (user_id, email_notifications) ON public.user_settings TO authenticated;
GRANT UPDATE (email_notifications) ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own settings" ON public.user_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "create own settings" ON public.user_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "edit own settings" ON public.user_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER user_settings_set_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.accept_terms(_version text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _v text := btrim(coalesce(_version, ''));
  _at timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF char_length(_v) < 1 OR char_length(_v) > 40 THEN RAISE EXCEPTION 'Unknown terms version'; END IF;
  INSERT INTO public.user_settings (user_id, terms_accepted_at, terms_version)
  VALUES (_uid, now(), _v)
  ON CONFLICT (user_id) DO UPDATE SET terms_accepted_at = now(), terms_version = EXCLUDED.terms_version
  RETURNING terms_accepted_at INTO _at;
  RETURN _at;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_terms(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_terms(text) TO authenticated;

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
  DELETE FROM public.join_requests WHERE requester_user_id = _uid;
  DELETE FROM public.user_settings WHERE user_id = _uid;
  DELETE FROM public.profiles WHERE id = ANY(_pids);
  GET DIAGNOSTICS _n = ROW_COUNT;

  RETURN jsonb_build_object('left_household', _left, 'profiles_deleted', _n);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;