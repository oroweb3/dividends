-- Preserve original enrollment; advance only after proved finalized conversion.
alter table public.dividend_tracking add column initial_baseline jsonb;
update public.dividend_tracking set initial_baseline=baseline;
alter table public.dividend_tracking alter column initial_baseline set not null;
create function public.capture_initial_dividend_baseline() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.initial_baseline:=new.baseline; return new; end; $$;
create trigger dividend_initial_baseline before insert on public.dividend_tracking for each row execute function public.capture_initial_dividend_baseline();

alter table public.dividend_executions add column rollover_context jsonb;
alter table public.dividend_claim_reservations add column rollover_status text not null default 'pending' check(rollover_status in ('pending','complete'));
create function public.capture_dividend_rollover_context() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.dividend_claim_reservations%rowtype; v public.dividend_verifications%rowtype; t public.dividend_tracking%rowtype;
begin
 select * into strict c from public.dividend_claim_reservations where id=new.claim_id;
 select * into strict v from public.dividend_verifications where id=c.verification_id;
 select * into strict t from public.dividend_tracking where id=v.tracking_id for update;
 if t.user_id<>c.user_id or t.wallet_address<>c.wallet_address or t.stock_mint<>c.stock_mint or v.event_id<>c.event_id then raise exception 'Rollover context identity mismatch'; end if;
 new.rollover_context:=jsonb_build_object('tracking_id',t.id,'baseline',t.baseline,'multiplier_new',v.evidence->'event'->>'multiplierNew');
 return new;
end; $$;
create trigger dividend_rollover_context before insert on public.dividend_executions for each row execute function public.capture_dividend_rollover_context();

create table public.dividend_baseline_rollovers (
 claim_id uuid primary key references public.dividend_claim_reservations(id),
 tracking_id uuid not null references public.dividend_tracking(id),
 before_baseline jsonb not null, after_baseline jsonb not null,
 transaction_slot bigint not null, evidence jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.dividend_baseline_rollovers enable row level security;
revoke all on public.dividend_baseline_rollovers from public,anon,authenticated,service_role;
grant select on public.dividend_baseline_rollovers to service_role;

create function public.rollover_dividend_baseline(p_user_id text,p_claim_id uuid,p_baseline jsonb,p_transaction_slot bigint,p_evidence jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.dividend_claim_reservations%rowtype; e public.dividend_executions%rowtype; t public.dividend_tracking%rowtype; existing public.dividend_baseline_rollovers%rowtype;
begin
 select * into strict c from public.dividend_claim_reservations where id=p_claim_id for update;
 if c.user_id is distinct from p_user_id then raise exception 'Claim owner mismatch'; end if;
 select * into existing from public.dividend_baseline_rollovers where claim_id=p_claim_id;
 if found then return; end if;
 select * into strict e from public.dividend_executions where claim_id=p_claim_id;
 if c.status<>'confirmed' or e.status<>'confirmed' or e.rollover_context is null or e.transaction_signature is null or e.transaction_signature is distinct from c.transaction_signature then raise exception 'Confirmed rollover evidence required'; end if;
 select * into strict t from public.dividend_tracking where id=(e.rollover_context->>'tracking_id')::uuid for update;
 if t.user_id is distinct from p_user_id or t.wallet_address<>c.wallet_address or t.stock_mint<>c.stock_mint or t.baseline is distinct from e.rollover_context->'baseline' then raise exception 'Baseline lineage changed'; end if;
 if p_baseline is null or exists(select 1 from unnest(array['id','raw_balance','active_multiplier','decimals','balance_slot','mint_slot','chain_timestamp','observed_at','token_accounts']) k where p_baseline->>k is null) then raise exception 'Incomplete checkpoint'; end if;
 if jsonb_typeof(p_baseline->'token_accounts') is distinct from 'array' or p_baseline->>'raw_balance' !~ '^[0-9]+$' or p_baseline->>'active_multiplier' !~ '^[0-9]+(\.[0-9]+)?$' or e.rollover_context->>'multiplier_new' is null then raise exception 'Invalid checkpoint values'; end if;
 if exists(select 1 from jsonb_array_elements(p_baseline->'token_accounts') a where a->>'address' is null or a->>'rawBaseUnits' is null or a->>'rawBaseUnits' !~ '^[0-9]+$') then raise exception 'Invalid account evidence'; end if;
 if (select count(*)<>count(distinct a->>'address') or sum((a->>'rawBaseUnits')::numeric) is distinct from (p_baseline->>'raw_balance')::numeric from jsonb_array_elements(p_baseline->'token_accounts') a) then raise exception 'Account totals mismatch'; end if;
 if p_evidence->>'signature' is distinct from e.transaction_signature or p_evidence->>'history' is distinct from 'no-activity-observed' then raise exception 'Rollover proof missing'; end if;
 if p_baseline->>'user_id' is distinct from p_user_id or p_baseline->>'wallet_address' is distinct from c.wallet_address or p_baseline->>'stock_mint' is distinct from c.stock_mint then raise exception 'Baseline owner mismatch'; end if;
 if (p_baseline->>'raw_balance')::numeric is distinct from (t.baseline->>'raw_balance')::numeric-c.raw_amount or (p_baseline->>'raw_balance')::numeric<=0 or (p_baseline->>'active_multiplier')::numeric is distinct from (e.rollover_context->>'multiplier_new')::numeric or p_baseline->>'decimals' is distinct from t.baseline->>'decimals' then raise exception 'Rollover amount mismatch'; end if;
 if p_transaction_slot is null or p_transaction_slot<=(t.baseline->>'mint_slot')::bigint or (p_baseline->>'balance_slot')::bigint<=p_transaction_slot or (p_baseline->>'mint_slot')::bigint<(p_baseline->>'balance_slot')::bigint or (p_baseline->>'observed_at')::timestamptz<clock_timestamp()-interval '30 seconds' or (p_baseline->>'observed_at')::timestamptz>clock_timestamp() then raise exception 'Stale rollover checkpoint'; end if;
 if not (p_baseline ?& array['id','raw_balance','active_multiplier','decimals','balance_slot','mint_slot','chain_timestamp','observed_at','token_accounts']) or jsonb_typeof(p_baseline->'token_accounts') is distinct from 'array' then raise exception 'Incomplete checkpoint'; end if;
 insert into public.dividend_baseline_rollovers values(p_claim_id,t.id,t.baseline,p_baseline,p_transaction_slot,p_evidence,clock_timestamp());
 update public.dividend_tracking set baseline=p_baseline where id=t.id;
 update public.dividend_claim_reservations set rollover_status='complete' where id=p_claim_id;
end; $$;
revoke all on function public.rollover_dividend_baseline(text,uuid,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.rollover_dividend_baseline(text,uuid,jsonb,bigint,jsonb) to service_role;
revoke all on function public.capture_dividend_rollover_context() from public,anon,authenticated;
revoke all on function public.capture_initial_dividend_baseline() from public,anon,authenticated;
