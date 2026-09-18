-- Reservation infrastructure only. No transaction submission is enabled.
create table public.dividend_claim_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  stock_mint text not null,
  event_id text not null,
  verification_id uuid not null references public.dividend_verifications(id),
  user_id text not null,
  request_id uuid not null unique,
  raw_amount numeric(78,0) not null check(raw_amount > 0),
  reserved_at timestamptz not null default clock_timestamp(),
  status text not null default 'reserved' check(status in ('reserved','submitted','confirmed','review-required')),
  transaction_signature text unique,
  unique(wallet_address,stock_mint,event_id)
);
alter table public.dividend_claim_reservations enable row level security;
revoke all on public.dividend_claim_reservations from public, anon, authenticated, service_role;
grant select on public.dividend_claim_reservations to service_role;

create or replace function public.reserve_dividend_claim(p_user_id text,p_verification_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.dividend_verifications%rowtype;
  t public.dividend_tracking%rowtype;
  existing public.dividend_claim_reservations%rowtype;
  amount_to_sell numeric;
  old_multiplier numeric;
  new_multiplier numeric;
  raw_balance numeric;
  reservation_id uuid;
begin
  -- Serialize checks against updates of this verification observation.
  select * into strict v from public.dividend_verifications where id=p_verification_id for update;
  select * into strict t from public.dividend_tracking where id=v.tracking_id;
  if t.user_id<>p_user_id then raise exception 'Claim owner mismatch'; end if;
  select * into existing from public.dividend_claim_reservations where request_id=p_request_id;
  if found then
    if existing.user_id<>p_user_id or existing.verification_id<>v.id then raise exception 'Request identity mismatch'; end if;
    return existing.id;
  end if;
  if v.status<>'history-checked' or v.checked_at<clock_timestamp()-interval '30 seconds' or v.checked_at>clock_timestamp() then
    raise exception 'Fresh successful verification required';
  end if;
  if jsonb_array_length(v.evidence->'blockers') is distinct from 0 or v.evidence->'history'->>'status' is distinct from 'no-activity-observed' then
    raise exception 'Incomplete verification evidence';
  end if;
  if (v.evidence->'event'->>'effectiveTimeUtc') is null or (v.evidence->'event'->>'effectiveTimeUtc')::timestamptz <= t.enabled_at then raise exception 'Late enrollment'; end if;
  raw_balance := (v.evidence->'current'->>'rawBaseUnits')::numeric;
  old_multiplier := (v.evidence->'event'->>'multiplierOld')::numeric;
  new_multiplier := (v.evidence->'event'->>'multiplierNew')::numeric;
  if raw_balance is null or old_multiplier is null or new_multiplier is null or raw_balance<=0 or old_multiplier<=0 or new_multiplier<=old_multiplier then
    raise exception 'Invalid dividend amount evidence';
  end if;
  amount_to_sell := div(raw_balance*(new_multiplier-old_multiplier),new_multiplier);
  if amount_to_sell<=0 or amount_to_sell>=raw_balance then raise exception 'No convertible amount'; end if;
  insert into public.dividend_claim_reservations(wallet_address,stock_mint,event_id,verification_id,user_id,request_id,raw_amount)
  values(t.wallet_address,t.stock_mint,v.event_id,v.id,p_user_id,p_request_id,amount_to_sell)
  returning id into reservation_id;
  -- Unique constraints reject parallel claims, including another enrollment.
  -- Reservations never expire automatically: uncertain submissions need reconciliation.
  return reservation_id;
end;
$$;
revoke all on function public.reserve_dividend_claim(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_dividend_claim(text,uuid,uuid) to service_role;
