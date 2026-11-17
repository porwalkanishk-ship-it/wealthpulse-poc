-- 1. RSU grants (same privacy as equity_holdings)
CREATE TABLE public.rsu_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_name text NOT NULL,
  security_id uuid REFERENCES public.securities(id),
  listed boolean NOT NULL DEFAULT false,
  grant_date date NOT NULL,
  total_shares numeric NOT NULL CHECK (total_shares > 0),
  vesting_type text NOT NULL CHECK (vesting_type IN ('cliff_monthly', 'cliff_quarterly', 'annual_pct', 'custom')),
  preset_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  withholding_pct numeric NOT NULL DEFAULT 0 CHECK (withholding_pct >= 0 AND withholding_pct <= 100),
  manual_price numeric,
  manual_price_currency text,
  manual_price_date date,
  last_listing_check_at timestamptz,
  listing_snoozed_until date,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rsu_grants_owner_profile_idx ON public.rsu_grants (owner_profile_id);
CREATE INDEX rsu_grants_security_idx ON public.rsu_grants (security_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rsu_grants TO authenticated;
GRANT ALL ON public.rsu_grants TO service_role;
ALTER TABLE public.rsu_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read visible rsu grants" ON public.rsu_grants
  FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add rsu grants to own profiles" ON public.rsu_grants
  FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit rsu grants on own profiles" ON public.rsu_grants
  FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete rsu grants on own profiles" ON public.rsu_grants
  FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

CREATE TRIGGER rsu_grants_set_updated_at BEFORE UPDATE ON public.rsu_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Vests (access derived from the parent grant)
CREATE TABLE public.rsu_vests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.rsu_grants(id) ON DELETE CASCADE,
  vest_date date NOT NULL,
  shares numeric NOT NULL CHECK (shares > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
  delivered_shares numeric,
  price_on_vest numeric,
  price_currency text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rsu_vests_grant_date_idx ON public.rsu_vests (grant_id, vest_date);

CREATE OR REPLACE FUNCTION public.can_read_rsu_grant(_grant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.rsu_grants g WHERE g.id = _grant_id AND public.can_read_row(g.owner_profile_id, g.is_hidden))
$$;

CREATE OR REPLACE FUNCTION public.can_write_rsu_grant(_grant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.rsu_grants g WHERE g.id = _grant_id AND public.can_write_profile(g.owner_profile_id))
$$;
REVOKE ALL ON FUNCTION public.can_read_rsu_grant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_rsu_grant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_rsu_grant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_rsu_grant(uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rsu_vests TO authenticated;
GRANT ALL ON public.rsu_vests TO service_role;
ALTER TABLE public.rsu_vests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read vests of visible rsu grants" ON public.rsu_vests
  FOR SELECT TO authenticated USING (public.can_read_rsu_grant(grant_id));
CREATE POLICY "add vests to own rsu grants" ON public.rsu_vests
  FOR INSERT TO authenticated WITH CHECK (public.can_write_rsu_grant(grant_id));
CREATE POLICY "edit vests on own rsu grants" ON public.rsu_vests
  FOR UPDATE TO authenticated USING (public.can_write_rsu_grant(grant_id)) WITH CHECK (public.can_write_rsu_grant(grant_id));
CREATE POLICY "delete vests on own rsu grants" ON public.rsu_vests
  FOR DELETE TO authenticated USING (public.can_write_rsu_grant(grant_id));

-- 3. Company-name normaliser used for listing matches
CREATE OR REPLACE FUNCTION public.normalize_company_name(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  n text := lower(coalesce(_name, ''));
  prev text;
BEGIN
  n := regexp_replace(n, '[^a-z0-9\s]', '', 'g');
  n := btrim(regexp_replace(n, '\s+', ' ', 'g'));
  LOOP
    prev := n;
    n := regexp_replace(n, '\s(inc|incorporated|corp|corporation|ltd|limited|llc|plc|technologies|holdings)$', '');
    EXIT WHEN n = prev;
  END LOOP;
  RETURN n;
END;
$$;
CREATE INDEX securities_normalized_name_idx ON public.securities (public.normalize_company_name(name));

-- 4. Vest-due, yearly listing check and listing-match notifications
CREATE OR REPLACE FUNCTION public.check_rsu_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _r record;
  _title text;
  _link text;
  _n int := 0;
BEGIN
  IF _uid IS NULL THEN RETURN 0; END IF;
  -- One run per user at a time, so two open tabs can't create the same notification twice.
  PERFORM pg_advisory_xact_lock(hashtext('rsu_notify:' || _uid::text));

  -- (a) Vests that are due and not yet notified
  FOR _r IN
    UPDATE public.rsu_vests v SET notified_at = now()
    FROM public.rsu_grants g
    WHERE g.id = v.grant_id
      AND public.can_write_profile(g.owner_profile_id)
      AND v.status = 'pending' AND v.vest_date <= _today AND v.notified_at IS NULL
    RETURNING v.id, v.vest_date, v.shares, g.company_name
  LOOP
    PERFORM public._notify(_uid, 'rsu_vest_due',
      'Confirm shares delivered for ' || _r.company_name,
      trim_scale(_r.shares)::text || ' shares were due to vest on ' || to_char(_r.vest_date, 'DD Mon YYYY') || '. Confirm how many were delivered after tax.',
      '/holdings?vest=' || _r.id::text);
    _n := _n + 1;
  END LOOP;

  -- (b) Yearly "has it listed?" check for unlisted grants
  FOR _r IN
    UPDATE public.rsu_grants g SET last_listing_check_at = now()
    WHERE public.can_write_profile(g.owner_profile_id)
      AND NOT g.listed
      AND (g.last_listing_check_at IS NULL OR g.last_listing_check_at < now() - interval '1 year')
      AND (g.listing_snoozed_until IS NULL OR g.listing_snoozed_until < _today)
    RETURNING g.id, g.company_name
  LOOP
    PERFORM public._notify(_uid, 'rsu_listing_check',
      'Has ' || _r.company_name || ' listed?',
      'If it now trades on an exchange, link the grant to it so its value follows the market price.',
      '/holdings?grant=' || _r.id::text);
    _n := _n + 1;
  END LOOP;

  -- (c) Unlisted grants whose company name matches an active security
  FOR _r IN
    SELECT g.id, g.company_name, s.name AS security_name, s.symbol, s.exchange
    FROM public.rsu_grants g
    JOIN public.securities s
      ON s.active
     AND public.normalize_company_name(s.name) = public.normalize_company_name(g.company_name)
    WHERE public.can_write_profile(g.owner_profile_id)
      AND NOT g.listed
      AND public.normalize_company_name(g.company_name) <> ''
    ORDER BY g.id, s.country, s.exchange, s.symbol
  LOOP
    _title := left(_r.company_name || ' looks like it is now listed as ' || _r.security_name || '. Link it?', 200);
    _link := '/holdings?grant=' || _r.id::text;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications nt
      WHERE nt.user_id = _uid AND nt.type = 'rsu_listing_match' AND nt.link = _link AND nt.title = _title
    );
    PERFORM public._notify(_uid, 'rsu_listing_match', _title,
      'Matched ' || _r.symbol || ' on ' || _r.exchange || '. Open the grant to link it.',
      _link);
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.check_rsu_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rsu_notifications() TO authenticated, service_role;