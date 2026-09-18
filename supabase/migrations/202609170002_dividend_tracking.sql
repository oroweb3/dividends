-- Run after 202609170001_balance_snapshots.sql.
create table if not exists public.dividend_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  wallet_address text not null,
  stock_mint text not null,
  symbol text not null,
  enabled_at timestamptz not null default clock_timestamp(),
  baseline jsonb not null,
  unique (user_id, wallet_address, stock_mint)
);
create table if not exists public.dividend_verifications (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid not null references public.dividend_tracking(id),
  event_id text not null,
  event_version integer not null,
  checked_at timestamptz not null default clock_timestamp(),
  evidence jsonb not null,
  -- Verification is an observation, never a payment authorization.
  status text not null check (status in ('blocked', 'history-checked')),
  unique (tracking_id, event_id)
);
alter table public.dividend_tracking enable row level security;
alter table public.dividend_verifications enable row level security;
revoke all on public.dividend_tracking, public.dividend_verifications from anon, authenticated;
grant select, insert on public.dividend_tracking to service_role;
grant select, insert, update on public.dividend_verifications to service_role;
