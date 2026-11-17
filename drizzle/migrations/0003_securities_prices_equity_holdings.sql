CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 1. Shared securities list
CREATE TABLE public.securities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text NOT NULL,
  exchange text NOT NULL,
  country text NOT NULL CHECK (country IN ('IN', 'US')),
  currency text NOT NULL CHECK (currency IN ('INR', 'USD')),
  isin text,
  type text NOT NULL DEFAULT 'equity',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT securities_exchange_symbol_key UNIQUE (exchange, symbol)
);
CREATE INDEX securities_lower_name_idx ON public.securities (lower(name) text_pattern_ops);
CREATE INDEX securities_lower_symbol_idx ON public.securities (lower(symbol) text_pattern_ops);
CREATE INDEX securities_isin_idx ON public.securities (isin);

GRANT SELECT ON public.securities TO authenticated;
GRANT ALL ON public.securities TO service_role;
ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in users read securities" ON public.securities
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER securities_set_updated_at BEFORE UPDATE ON public.securities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Shared daily prices
CREATE TABLE public.security_prices (
  security_id uuid NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
  price_date date NOT NULL,
  close numeric NOT NULL,
  prev_close numeric,
  currency text NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (security_id, price_date)
);

GRANT SELECT ON public.security_prices TO authenticated;
GRANT ALL ON public.security_prices TO service_role;
ALTER TABLE public.security_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in users read security prices" ON public.security_prices
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.latest_security_prices()
RETURNS SETOF public.security_prices
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (sp.security_id) sp.*
  FROM public.security_prices sp
  ORDER BY sp.security_id, sp.price_date DESC
$$;
REVOKE ALL ON FUNCTION public.latest_security_prices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.latest_security_prices() TO authenticated, service_role;

-- 3. Per-profile equity holdings (same privacy as holdings)
CREATE TABLE public.equity_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  security_id uuid NOT NULL REFERENCES public.securities(id),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  avg_buy_price numeric,
  currency text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equity_holdings_profile_security_key UNIQUE (owner_profile_id, security_id)
);
CREATE INDEX equity_holdings_security_idx ON public.equity_holdings (security_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equity_holdings TO authenticated;
GRANT ALL ON public.equity_holdings TO service_role;
ALTER TABLE public.equity_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read visible equity holdings" ON public.equity_holdings
  FOR SELECT TO authenticated USING (public.can_read_row(owner_profile_id, is_hidden));
CREATE POLICY "add equity holdings to own profiles" ON public.equity_holdings
  FOR INSERT TO authenticated WITH CHECK (public.can_write_profile(owner_profile_id) AND user_id = auth.uid());
CREATE POLICY "edit equity holdings on own profiles" ON public.equity_holdings
  FOR UPDATE TO authenticated USING (public.can_write_profile(owner_profile_id)) WITH CHECK (public.can_write_profile(owner_profile_id));
CREATE POLICY "delete equity holdings on own profiles" ON public.equity_holdings
  FOR DELETE TO authenticated USING (public.can_write_profile(owner_profile_id));

CREATE TRIGGER equity_holdings_set_updated_at BEFORE UPDATE ON public.equity_holdings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Ranked search over the securities list
CREATE OR REPLACE FUNCTION public.search_securities(_q text, _limit int DEFAULT 10)
RETURNS SETOF public.securities
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH q AS (
    SELECT lower(btrim(coalesce(_q, ''))) AS t,
           replace(replace(replace(lower(btrim(coalesce(_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') AS esc
  ),
  ranked AS (
    SELECT s.*,
      CASE
        WHEN lower(s.symbol) = q.t THEN 0
        WHEN lower(s.name) = q.t THEN 1
        WHEN lower(s.symbol) LIKE q.esc || '%' THEN 2
        WHEN lower(s.name) LIKE q.esc || '%' THEN 3
        WHEN lower(s.name) ~ ('(^|[\s.&,-])' || regexp_replace(q.t, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')) THEN 4
        ELSE 5
      END AS rnk
    FROM public.securities s, q
    WHERE q.t <> ''
      AND s.active
      AND (lower(s.symbol) LIKE '%' || q.esc || '%' OR lower(s.name) LIKE '%' || q.esc || '%')
  )
  SELECT id, symbol, name, exchange, country, currency, isin, type, active, updated_at
  FROM ranked
  ORDER BY rnk, length(name), name, exchange
  LIMIT least(greatest(coalesce(_limit, 10), 1), 10)
$$;
REVOKE ALL ON FUNCTION public.search_securities(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_securities(text, int) TO authenticated, service_role;