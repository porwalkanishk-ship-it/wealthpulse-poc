# Messages to send to Lovable when credits are available

Send in this order. Each is database-only; the app code is written in this repo.

## 1. Gold and silver in grams (needed for the metals feature)

Database changes only, small. Keep all existing rows and tests passing.

1. holdings: add purity_fineness numeric null with a check (purity_fineness is null or (purity_fineness > 0 and purity_fineness <= 1000)), meaning parts per thousand (999, 916, 750 for gold; 999, 925 for silver). Existing rows stay null. For categories 'gold' and the new 'silver', quantity will mean grams. Confirm no check constraint or enum on holdings.category blocks the new value 'silver' and say what you found.
2. New table commodity_prices: symbol text not null, price_date date not null, price numeric not null check (price > 0), currency text not null, source text not null, fetched_at timestamptz not null default now(), primary key (symbol, price_date). Row-level security on: any signed-in user can SELECT; only service_role can insert, update or delete (no write grants to anon or authenticated). No data. Prices are India rupees per gram of the pure metal: symbols 'GOLD_INR_G' (24K / 999 gold) and 'SILVER_INR_G' (999 silver); other purities are derived in the app. source is the provider name or 'manual'. Also add RPC set_metal_rate(_symbol text, _price numeric) SECURITY DEFINER with a fixed search_path, callable by authenticated users, that upserts today's (IST) row with source 'manual' for those two symbols only, rejects price <= 0, and returns the row.
3. Tests: a signed-in user can read commodity_prices but cannot insert or update it; purity_fineness rejects 0 and 1001, and a holding with category 'silver' can be inserted. Run the full suite, report every failure by name, regenerate types, do not touch app screens, list what you changed.

## 2. Tighten table access (hygiene)

Audit result: signed-out visitors currently hold full table privileges on most tables (the row-level security policies still stop them reading anything). Revoke ALL from anon on every public table and on normalize_company_name, set_updated_at, check_repayment_parent. For authenticated keep select/insert/update/delete only where the app writes (equity_holdings, holdings, loans, loan_events, policies, rsu_grants, rsu_vests, receivable_repayments, sip_installments; notifications update read_at and delete; profiles update hide_everything; user_settings as now), read-only on the rest, no write at all on securities, security_prices, notification_log, cas_ai_calls, cas_imports, household_members, join_requests. Restore the narrower column limits on households, profiles and notifications. Do not change any row-level security policy. Run the full suite, report every failure by name, regenerate types, list what you changed.
