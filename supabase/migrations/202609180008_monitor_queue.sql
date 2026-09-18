-- Bounded scheduling state, one queue row and one current observation per enrollment.
create table public.dividend_check_queue (
 tracking_id uuid primary key references public.dividend_tracking(id) on delete cascade,
 next_check_at timestamptz not null default clock_timestamp(),
 lease_run_id uuid, lease_until timestamptz,
 last_checked_at timestamptz, consecutive_failures integer not null default 0 check(consecutive_failures>=0)
);
create index dividend_check_queue_due on public.dividend_check_queue(next_check_at,tracking_id);
insert into public.dividend_check_queue(tracking_id) select id from public.dividend_tracking;
create function public.enqueue_dividend_tracking() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.dividend_check_queue(tracking_id) values(new.id);return new;end; $$;
create trigger enqueue_dividend_tracking after insert on public.dividend_tracking for each row execute function public.enqueue_dividend_tracking();
create table public.dividend_monitor_state (
 tracking_id uuid primary key references public.dividend_tracking(id) on delete cascade,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 observation jsonb not null,
 changed_at timestamptz not null default clock_timestamp()
);
alter table public.dividend_check_queue enable row level security;
alter table public.dividend_monitor_state enable row level security;
revoke all on public.dividend_check_queue,public.dividend_monitor_state from public,anon,authenticated,service_role;
grant select on public.dividend_check_queue,public.dividend_monitor_state to service_role;
create function public.claim_dividend_check(p_run_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item uuid; result jsonb;
begin
 if p_run_id is null or not exists(select 1 from public.dividend_job_state where name='tracking' and run_id=p_run_id and lease_until>clock_timestamp()) then raise exception 'Job lease lost'; end if;
 select tracking_id into item from public.dividend_check_queue where next_check_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()) order by next_check_at,tracking_id for update skip locked limit 1;
 if not found then return null; end if;
 update public.dividend_check_queue set lease_run_id=p_run_id,lease_until=clock_timestamp()+interval '10 minutes' where tracking_id=item;
 select jsonb_build_object('tracking_id',id,'user_id',user_id,'wallet_address',wallet_address,'stock_mint',stock_mint) into strict result from public.dividend_tracking where id=item;
 return result;
end; $$;
create function public.finish_dividend_check(p_run_id uuid,p_tracking_id uuid,p_success boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_success is null or p_run_id is null or not exists(select 1 from public.dividend_job_state where name='tracking' and run_id=p_run_id and lease_until>clock_timestamp()) then raise exception 'Job lease lost'; end if;
 update public.dividend_check_queue set
  next_check_at=clock_timestamp()+make_interval(secs=>case when p_success then 300 else least(3600,300*power(2,least(consecutive_failures,4)))::integer end),
  last_checked_at=clock_timestamp(),consecutive_failures=case when p_success then 0 else least(consecutive_failures+1,1000000) end,
  lease_run_id=null,lease_until=null
 where tracking_id=p_tracking_id and lease_run_id=p_run_id and lease_until>clock_timestamp();
 if not found then raise exception 'Account lease lost'; end if;
end; $$;
create function public.record_dividend_monitor_change(p_tracking_id uuid,p_run_id uuid,p_fingerprint text,p_observation jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 if p_run_id is null or not exists(select 1 from public.dividend_job_state where name='tracking' and run_id=p_run_id and lease_until>clock_timestamp()) then raise exception 'Job lease lost'; end if;
 perform 1 from public.dividend_check_queue where tracking_id=p_tracking_id and lease_run_id=p_run_id and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Account lease lost'; end if;
 if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_observation is null or jsonb_typeof(p_observation)<>'object' or octet_length(p_observation::text)>65536 then raise exception 'Invalid monitoring state'; end if;
 insert into public.dividend_monitor_state(tracking_id,fingerprint,observation) values(p_tracking_id,p_fingerprint,p_observation)
 on conflict(tracking_id) do update set fingerprint=excluded.fingerprint,observation=excluded.observation,changed_at=clock_timestamp()
 where dividend_monitor_state.fingerprint is distinct from excluded.fingerprint;
 get diagnostics changed=row_count;return changed=1;
end; $$;
revoke all on function public.enqueue_dividend_tracking() from public,anon,authenticated;
revoke all on function public.claim_dividend_check(uuid) from public,anon,authenticated;
revoke all on function public.finish_dividend_check(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.record_dividend_monitor_change(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_dividend_check(uuid) to service_role;
grant execute on function public.finish_dividend_check(uuid,uuid,boolean) to service_role;
grant execute on function public.record_dividend_monitor_change(uuid,uuid,text,jsonb) to service_role;
