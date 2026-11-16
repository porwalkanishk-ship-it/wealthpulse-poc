-- ---------- holdings: statement facts ----------
ALTER TABLE public.holdings
  ADD COLUMN statement_nav numeric,
  ADD COLUMN statement_value numeric,
  ADD COLUMN statement_date date,
  ADD COLUMN cas_verified_at timestamptz;

-- ---------- successful CAS imports ----------
CREATE TABLE public.cas_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  imported_at timestamptz NOT NULL DEFAULT now(),
  statement_from date,
  statement_to date NOT NULL,
  funds_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'parser' CHECK (source IN ('parser', 'ai')),
  reminder_sent_at timestamptz
);
CREATE INDEX cas_imports_profile_idx ON public.cas_imports (profile_id, imported_at DESC);

GRANT SELECT ON public.cas_imports TO authenticated;
GRANT ALL ON public.cas_imports TO service_role;
ALTER TABLE public.cas_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read imports of own profiles" ON public.cas_imports FOR SELECT TO authenticated USING (public.can_write_profile(profile_id));

-- ---------- mutual fund transactions ----------
CREATE TABLE public.mf_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  holding_id uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_hidden boolean NOT NULL DEFAULT false,
  txn_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'sip', 'redemption', 'switch_in', 'switch_out', 'dividend_reinvest', 'dividend_payout', 'other')),
  amount numeric NOT NULL DEFAULT 0,
  units numeric NOT NULL DEFAULT 0,
  nav numeric,
  balance_units numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mf_transactions_dedupe UNIQUE (holding_id, txn_date, type, amount, units)
);
CREATE INDEX mf_transactions_owner_idx ON public.mf_transactions (owner_profile_id);
CREATE INDEX mf_transactions_holding_idx ON public.mf_transactions (holding_id, txn_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mf_transactions TO authenticated;
GRANT ALL ON public.mf_transactions TO service_role;
ALTER TABLE public.mf_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read visible transactions" ON public.mf_transactions FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add transactions to own profiles" ON public.mf_transactions FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit transactions on own profiles" ON public.mf_transactions FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete transactions on own profiles" ON public.mf_transactions FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

-- transactions inherit owner + privacy from their fund
CREATE OR REPLACE FUNCTION public.sync_mf_txn_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT h.owner_profile_id, h.is_hidden INTO NEW.owner_profile_id, NEW.is_hidden FROM public.holdings h WHERE h.id = NEW.holding_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mf_transactions_sync_owner BEFORE INSERT OR UPDATE ON public.mf_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_mf_txn_owner();

CREATE OR REPLACE FUNCTION public.cascade_holding_privacy_txns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.mf_transactions SET owner_profile_id = NEW.owner_profile_id, is_hidden = NEW.is_hidden WHERE holding_id = NEW.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER holdings_cascade_privacy_txns AFTER UPDATE OF owner_profile_id, is_hidden ON public.holdings
FOR EACH ROW WHEN (OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id OR OLD.is_hidden IS DISTINCT FROM NEW.is_hidden)
EXECUTE FUNCTION public.cascade_holding_privacy_txns();

-- ---------- AI fallback quota ----------
CREATE TABLE public.cas_ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cas_ai_calls_user_idx ON public.cas_ai_calls (user_id, created_at DESC);
GRANT SELECT ON public.cas_ai_calls TO authenticated;
GRANT ALL ON public.cas_ai_calls TO service_role;
ALTER TABLE public.cas_ai_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own ai calls" ON public.cas_ai_calls FOR SELECT TO authenticated USING (user_id = auth.uid());

/** Uses one of today's (IST) 3 AI statement reads. Returns false when none are left. */
CREATE OR REPLACE FUNCTION public.consume_cas_ai_call()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _used int;
  _day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata';
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cas_ai:' || _uid::text));
  SELECT count(*) INTO _used FROM public.cas_ai_calls WHERE user_id = _uid AND created_at >= _day_start;
  IF _used >= 3 THEN RETURN false; END IF;
  INSERT INTO public.cas_ai_calls (user_id) VALUES (_uid);
  RETURN true;
END;
$$;

-- ---------- next allowed import date (day 1, day 91, day 181 …) ----------
CREATE OR REPLACE FUNCTION public.cas_next_import_date(_profile_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max((imported_at AT TIME ZONE 'Asia/Kolkata')::date) + 90 FROM public.cas_imports WHERE profile_id = _profile_id
$$;

-- ---------- import a reviewed Detailed CAS in one transaction ----------
CREATE OR REPLACE FUNCTION public.import_cas(_profile_id uuid, _statement jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _to date;
  _from date;
  _opens date;
  _source text := coalesce(nullif(_statement->>'source', ''), 'parser');
  _f jsonb;
  _sip jsonb;
  _hid uuid;
  _scheme text;
  _units numeric;
  _nav numeric;
  _nav_date date;
  _stmt_nav numeric;
  _stmt_value numeric;
  _sip_on boolean;
  _added int := 0;
  _updated int := 0;
  _txns int := 0;
  _n int;
  _inst record;
  _m_date date;
  _m_units numeric;
  _m_nav numeric;
  _import_id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.can_write_profile(_profile_id) THEN
    RAISE EXCEPTION 'You can only import statements for profiles you manage' USING ERRCODE = '42501';
  END IF;
  BEGIN
    _to := (_statement->>'statement_to')::date;
    _from := nullif(_statement->>'statement_from', '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'The statement dates could not be read';
  END;
  IF _to IS NULL THEN RAISE EXCEPTION 'The statement end date is missing'; END IF;
  IF _to > _today + 1 THEN RAISE EXCEPTION 'The statement end date is in the future'; END IF;
  IF _source NOT IN ('parser', 'ai') THEN _source := 'parser'; END IF;
  IF jsonb_typeof(_statement->'funds') IS DISTINCT FROM 'array' OR jsonb_array_length(_statement->'funds') = 0 THEN
    RAISE EXCEPTION 'There are no funds to import';
  END IF;
  IF jsonb_array_length(_statement->'funds') > 300 THEN RAISE EXCEPTION 'Too many funds in one statement'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cas_import:' || _profile_id::text));
  _opens := public.cas_next_import_date(_profile_id);
  IF _opens IS NOT NULL AND _today < _opens THEN
    RAISE EXCEPTION 'The next statement for this profile can be imported from %', to_char(_opens, 'DD Mon YYYY') USING ERRCODE = 'P0001';
  END IF;

  FOR _f IN SELECT value FROM jsonb_array_elements(_statement->'funds') LOOP
    _hid := NULL;
    _units := coalesce((_f->>'units')::numeric, 0);
    IF _units < 0 THEN RAISE EXCEPTION 'A fund has negative units'; END IF;
    _scheme := nullif(_f->>'scheme_code', '');
    IF _scheme IS NOT NULL AND _scheme !~ '^\d{3,7}$' THEN _scheme := NULL; END IF;
    _stmt_nav := nullif(_f->>'statement_nav', '')::numeric;
    _stmt_value := nullif(_f->>'statement_value', '')::numeric;
    _nav := nullif(_f->>'nav', '')::numeric;
    _nav_date := nullif(_f->>'nav_date', '')::date;
    _sip := _f->'sip';

    IF nullif(_f->>'holding_id', '') IS NOT NULL THEN
      SELECT id INTO _hid FROM public.holdings
      WHERE id = (_f->>'holding_id')::uuid AND owner_profile_id = _profile_id AND category = 'mutual_fund';
      IF _hid IS NULL THEN RAISE EXCEPTION 'A fund in this statement no longer belongs to this profile'; END IF;
    ELSIF nullif(_f->>'isin', '') IS NOT NULL THEN
      SELECT id INTO _hid FROM public.holdings
      WHERE owner_profile_id = _profile_id AND category = 'mutual_fund' AND isin = _f->>'isin'
        AND coalesce(folio, '') = coalesce(nullif(_f->>'folio', ''), '')
      ORDER BY created_at LIMIT 1;
    END IF;

    _sip_on := jsonb_typeof(_sip) = 'object' AND coalesce((_sip->>'active')::boolean, false)
      AND coalesce((_sip->>'amount')::numeric, 0) > 0;

    IF _hid IS NULL THEN
      INSERT INTO public.holdings (
        user_id, owner_profile_id, category, name, folio, isin, scheme_code, units,
        nav, nav_date, as_of, statement_nav, statement_value, statement_date, cas_verified_at,
        sip_amount, sip_day, sip_active, sip_start
      ) VALUES (
        _uid, _profile_id, 'mutual_fund', left(coalesce(nullif(_f->>'name', ''), 'Mutual fund'), 160),
        left(nullif(_f->>'folio', ''), 40), left(nullif(_f->>'isin', ''), 12), _scheme, _units,
        coalesce(_nav, _stmt_nav), coalesce(_nav_date, _to), _to, _stmt_nav, _stmt_value, _to, now(),
        CASE WHEN _sip_on THEN (_sip->>'amount')::numeric END,
        CASE WHEN _sip_on THEN least(28, greatest(1, coalesce((_sip->>'day')::int, 5))) END,
        _sip_on,
        CASE WHEN _sip_on THEN _to + 1 END
      ) RETURNING id INTO _hid;
      _added := _added + 1;
    ELSE
      UPDATE public.holdings h SET
        units = _units,
        as_of = _to,
        folio = coalesce(left(nullif(_f->>'folio', ''), 40), h.folio),
        isin = coalesce(left(nullif(_f->>'isin', ''), 12), h.isin),
        scheme_code = coalesce(_scheme, h.scheme_code),
        nav = CASE WHEN coalesce(_scheme, h.scheme_code) IS NULL THEN coalesce(_stmt_nav, h.nav)
                   WHEN _nav IS NOT NULL THEN _nav ELSE h.nav END,
        nav_date = CASE WHEN coalesce(_scheme, h.scheme_code) IS NULL THEN _to
                        WHEN _nav IS NOT NULL THEN coalesce(_nav_date, h.nav_date) ELSE h.nav_date END,
        statement_nav = _stmt_nav,
        statement_value = _stmt_value,
        statement_date = _to,
        cas_verified_at = now(),
        sip_amount = CASE WHEN _sip_on THEN (_sip->>'amount')::numeric ELSE h.sip_amount END,
        sip_day = CASE WHEN _sip_on THEN least(28, greatest(1, coalesce((_sip->>'day')::int, 5))) ELSE h.sip_day END,
        sip_active = CASE WHEN jsonb_typeof(_sip) = 'object' THEN _sip_on ELSE h.sip_active END,
        sip_start = CASE
          WHEN (CASE WHEN jsonb_typeof(_sip) = 'object' THEN _sip_on ELSE h.sip_active END)
            THEN greatest(coalesce(h.sip_start, _to + 1), _to + 1)
          ELSE h.sip_start END,
        updated_at = now()
      WHERE h.id = _hid;
      _updated := _updated + 1;
    END IF;

    IF jsonb_typeof(_f->'transactions') = 'array' THEN
      IF jsonb_array_length(_f->'transactions') > 5000 THEN RAISE EXCEPTION 'Too many transactions for one fund'; END IF;
      INSERT INTO public.mf_transactions (user_id, holding_id, txn_date, type, amount, units, nav, balance_units)
      SELECT _uid, _hid, (t->>'date')::date,
        CASE WHEN t->>'type' IN ('purchase', 'sip', 'redemption', 'switch_in', 'switch_out', 'dividend_reinvest', 'dividend_payout') THEN t->>'type' ELSE 'other' END,
        coalesce((t->>'amount')::numeric, 0), coalesce((t->>'units')::numeric, 0),
        nullif(t->>'nav', '')::numeric, nullif(t->>'balance_units', '')::numeric
      FROM jsonb_array_elements(_f->'transactions') t
      WHERE nullif(t->>'date', '') IS NOT NULL
      ON CONFLICT ON CONSTRAINT mf_transactions_dedupe DO NOTHING;
      GET DIAGNOSTICS _n = ROW_COUNT;
      _txns := _txns + _n;
    END IF;

    -- Actual allotments replace estimated SIP units up to the statement date.
    FOR _inst IN
      SELECT id, due_date, amount FROM public.sip_installments
      WHERE holding_id = _hid AND due_date <= _to AND status <> 'reconciled'
    LOOP
      _m_date := NULL; _m_units := NULL; _m_nav := NULL;
      SELECT t.txn_date, t.units, t.nav INTO _m_date, _m_units, _m_nav
      FROM public.mf_transactions t
      WHERE t.holding_id = _hid AND t.units > 0 AND t.type IN ('sip', 'purchase')
        AND t.txn_date BETWEEN _inst.due_date - 3 AND _inst.due_date + 7
        AND abs(t.amount - _inst.amount) <= greatest(5, _inst.amount * 0.02)
      ORDER BY abs(t.txn_date - _inst.due_date) LIMIT 1;
      UPDATE public.sip_installments SET
        status = 'reconciled',
        units = coalesce(_m_units, units),
        nav = coalesce(_m_nav, nav),
        nav_date = coalesce(_m_date, nav_date)
      WHERE id = _inst.id;
    END LOOP;
  END LOOP;

  IF _from IS NULL THEN
    SELECT min(t.txn_date) INTO _from FROM public.mf_transactions t
    JOIN public.holdings h ON h.id = t.holding_id WHERE h.owner_profile_id = _profile_id;
  END IF;

  INSERT INTO public.cas_imports (profile_id, user_id, statement_from, statement_to, funds_count, source)
  VALUES (_profile_id, _uid, _from, _to, _added + _updated, _source)
  RETURNING id INTO _import_id;

  RETURN jsonb_build_object('import_id', _import_id, 'added', _added, 'updated', _updated, 'transactions', _txns,
    'next_import', (_today + 90)::text);
END;
$$;

-- ---------- fresh-CAS reminder, checked on app load ----------
CREATE OR REPLACE FUNCTION public.check_cas_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _r record;
  _last date;
  _n int := 0;
BEGIN
  IF _uid IS NULL THEN RETURN 0; END IF;
  FOR _r IN
    SELECT DISTINCT ON (c.profile_id) c.id, c.profile_id, c.imported_at, c.reminder_sent_at, p.display_name, p.owner_user_id
    FROM public.cas_imports c JOIN public.profiles p ON p.id = c.profile_id
    WHERE public.can_write_profile(c.profile_id)
    ORDER BY c.profile_id, c.imported_at DESC
  LOOP
    _last := (_r.imported_at AT TIME ZONE 'Asia/Kolkata')::date;
    IF _r.reminder_sent_at IS NULL AND _today >= greatest((_last + interval '3 months')::date, _last + 90) THEN
      PERFORM public._notify(
        _uid, 'cas_reminder',
        CASE WHEN _r.owner_user_id = _uid THEN 'Time for a fresh CAS statement' ELSE 'Time for a fresh CAS for ' || _r.display_name END,
        'It has been three months since the last Detailed CAS import. Upload a new one to keep units and SIPs accurate.',
        '/holdings'
      );
      UPDATE public.cas_imports SET reminder_sent_at = now() WHERE id = _r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mf_txn_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cascade_holding_privacy_txns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_cas_ai_call() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cas_next_import_date(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_cas(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_cas_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_cas_ai_call() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cas_next_import_date(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_cas(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_cas_reminders() TO authenticated;