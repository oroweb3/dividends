begin;
-- Observation checkpoints, NOT proof of historical dividend entitlement.
create table if not exists public.dividend_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  wallet_address text not null,
  stock_mint text not null,
  symbol text not null,
  raw_balance numeric(78,0) not null check (raw_balance >= 0),
  decimals smallint not null check (decimals between 0 and 255),
  previous_multiplier numeric not null check (previous_multiplier > 0),
  new_multiplier numeric not null check (new_multiplier > 0),
  active_multiplier numeric not null check (active_multiplier > 0),
  multiplier_effective_timestamp bigint not null,
  balance_slot bigint not null,
  mint_slot bigint not null check (mint_slot >= balance_slot),
  chain_timestamp bigint not null,
  token_accounts jsonb not null,
  commitment text not null default 'finalized' check (commitment = 'finalized'),
  eligibility text not null default 'unverified' check (eligibility = 'unverified'),
  observed_at timestamptz not null default now(),
  unique (wallet_address, stock_mint, balance_slot, mint_slot)
);
create index if not exists dividend_snapshot_wallet_mint_slot_idx
  on public.dividend_balance_snapshots(wallet_address, stock_mint, balance_slot desc);
alter table public.dividend_balance_snapshots enable row level security;
revoke all on public.dividend_balance_snapshots from anon, authenticated;
grant select, insert on public.dividend_balance_snapshots to service_role;
comment on table public.dividend_balance_snapshots is
  'Server-verified current balance observations. Separate balance/mint slots; no historical entitlement or transaction-history completeness is implied.';
commit;
