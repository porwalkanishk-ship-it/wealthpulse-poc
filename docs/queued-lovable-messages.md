# Messages to send to Lovable when credits are available

Send in this order. Each is database-only; the app code is written in this repo.

## 1. Gold in grams (needed for the gold feature)

Database changes only, small. Keep all existing rows and tests passing.

1. holdings: add gold_purity numeric null with a check (gold_purity is null or (gold_purity > 0 and gold_purity <= 24)), meaning carats (24, 22, 18). Existing rows stay null. For category 'gold', quantity will mean grams.
2. New table commodity_prices: symbol text not null, price_date date not null, price numeric not null check (price > 0), currency text not null, source text not null, fetched_at timestamptz not null default now(), primary key (symbol, price_date). Row-level security on: any signed-in user can SELECT; only service_role can insert, update or delete (no write grants to anon or authenticated). No data. Symbol 'XAU_USD_OZ' is the price of one troy ounce of gold in USD.
3. Tests: a signed-in user can read commodity_prices but cannot insert or update it; gold_purity rejects 0 and 25. Run the full suite, report every failure by name, regenerate types, do not touch app screens, list what you changed.

## 2. Tighten table access (hygiene)

Audit result: signed-out visitors currently hold full table privileges on most tables (the row-level security policies still stop them reading anything). Revoke ALL from anon on every public table and on normalize_company_name, set_updated_at, check_repayment_parent. For authenticated keep select/insert/update/delete only where the app writes (equity_holdings, holdings, loans, loan_events, policies, rsu_grants, rsu_vests, receivable_repayments, sip_installments; notifications update read_at and delete; profiles update hide_everything; user_settings as now), read-only on the rest, no write at all on securities, security_prices, notification_log, cas_ai_calls, cas_imports, household_members, join_requests. Restore the narrower column limits on households, profiles and notifications. Do not change any row-level security policy. Run the full suite, report every failure by name, regenerate types, list what you changed.
