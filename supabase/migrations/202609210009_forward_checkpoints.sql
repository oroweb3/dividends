-- Explicit forward-only restarts, separate from proven dividend conversion rollovers.
create table public.dividend_tracking_checkpoints (
 id uuid primary key default gen_random_uuid(),
 tracking_id uuid not null references public.dividend_tracking(id),
 before_baseline jsonb not null, after_baseline jsonb not null,
 reason text not null check(reason='user-requested-forward-checkpoint'),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.dividend_tracking_checkpoints enable row level security;
revoke all on public.dividend_tracking_checkpoints from public,anon,authenticated,service_role;
grant select on public.dividend_tracking_checkpoints to service_role;

-- Serialize new reservations with checkpoint changes and reject stale verification lineage.
create function public.guard_dividend_claim_checkpoint() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.dividend_tracking%rowtype; v public.dividend_verifications%rowtype;
begin
 select * into strict v from public.dividend_verifications where id=new.verification_id;
 select * into strict t from public.dividend_tracking where id=v.tracking_id for update;
 if new.user_id is distinct from t.user_id or new.wallet_address is distinct from t.wallet_address or new.stock_mint is distinct from t.stock_mint or v.evidence->>'baselineId' is distinct from t.baseline->>'id' then raise exception 'Verification checkpoint changed'; end if;
 if v.evidence->'event'->>'effectiveTimeUtc' is null or (v.evidence->'event'->>'effectiveTimeUtc')::timestamptz<=(t.baseline->>'observed_at')::timestamptz or extract(epoch from (v.evidence->'event'->>'effectiveTimeUtc')::timestamptz)<=(t.baseline->>'chain_timestamp')::numeric then raise exception 'Dividend predates checkpoint'; end if;
 return new;
end; $$;
create trigger dividend_claim_checkpoint before insert on public.dividend_claim_reservations for each row execute function public.guard_dividend_claim_checkpoint();
revoke all on function public.guard_dividend_claim_checkpoint() from public,anon,authenticated;

create function public.restart_dividend_checkpoint(p_user_id text,p_tracking_id uuid,p_expected_baseline_id text,p_baseline jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.dividend_tracking%rowtype;
begin
 select * into strict t from public.dividend_tracking where id=p_tracking_id for update;
 if t.user_id is distinct from p_user_id or t.baseline->>'id' is distinct from p_expected_baseline_id then raise exception 'Tracking checkpoint changed'; end if;
 if exists(select 1 from public.dividend_claim_reservations c where c.wallet_address=t.wallet_address and c.stock_mint=t.stock_mint and (c.status<>'confirmed' or c.rollover_status<>'complete')) then raise exception 'Resolve existing conversion before updating checkpoint'; end if;
 if p_baseline is null or exists(select 1 from unnest(array['id','user_id','wallet_address','stock_mint','raw_balance','active_multiplier','decimals','balance_slot','mint_slot','chain_timestamp','observed_at','token_accounts']) k where p_baseline->>k is null) then raise exception 'Incomplete checkpoint'; end if;
 if p_baseline->>'id'=p_expected_baseline_id or p_baseline->>'user_id' is distinct from t.user_id or p_baseline->>'wallet_address' is distinct from t.wallet_address or p_baseline->>'stock_mint' is distinct from t.stock_mint then raise exception 'Checkpoint identity mismatch'; end if;
 if p_baseline->>'raw_balance' !~ '^[0-9]+$' or (p_baseline->>'raw_balance')::numeric<=0 or p_baseline->>'active_multiplier' !~ '^[0-9]+(\.[0-9]+)?$' or (p_baseline->>'active_multiplier')::numeric<=0 or p_baseline->>'decimals' is distinct from t.baseline->>'decimals' or jsonb_typeof(p_baseline->'token_accounts') is distinct from 'array' then raise exception 'Invalid checkpoint values'; end if;
 if exists(select 1 from jsonb_array_elements(p_baseline->'token_accounts') a where a->>'address' is null or a->>'rawBaseUnits' is null or a->>'rawBaseUnits' !~ '^[0-9]+$') then raise exception 'Invalid account evidence'; end if;
 if (select count(*)<>count(distinct a->>'address') or sum((a->>'rawBaseUnits')::numeric) is distinct from (p_baseline->>'raw_balance')::numeric from jsonb_array_elements(p_baseline->'token_accounts') a) then raise exception 'Account totals mismatch'; end if;
 if (p_baseline->>'balance_slot')::bigint<=(t.baseline->>'mint_slot')::bigint or (p_baseline->>'mint_slot')::bigint<(p_baseline->>'balance_slot')::bigint or (p_baseline->>'chain_timestamp')::bigint<(t.baseline->>'chain_timestamp')::bigint or (p_baseline->>'observed_at')::timestamptz<=(t.baseline->>'observed_at')::timestamptz or (p_baseline->>'observed_at')::timestamptz<clock_timestamp()-interval '30 seconds' or (p_baseline->>'observed_at')::timestamptz>clock_timestamp() then raise exception 'Stale checkpoint'; end if;
 insert into public.dividend_tracking_checkpoints(tracking_id,before_baseline,after_baseline,reason) values(t.id,t.baseline,p_baseline,'user-requested-forward-checkpoint');
 update public.dividend_tracking set baseline=p_baseline where id=t.id;
 -- Original enrollment, initial baseline, and all historical verification evidence remain unchanged.
end; $$;
revoke all on function public.restart_dividend_checkpoint(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.restart_dividend_checkpoint(text,uuid,text,jsonb) to service_role;
