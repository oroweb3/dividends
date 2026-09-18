create table public.dividend_job_state (
 name text primary key check(name='tracking'), cursor uuid,
 run_id uuid, lease_until timestamptz,
 last_started_at timestamptz, last_finished_at timestamptz,
 last_status text not null default 'idle' check(last_status in ('idle','running','completed','needs-attention','failed'))
);
insert into public.dividend_job_state(name) values('tracking');
alter table public.dividend_job_state enable row level security;
revoke all on public.dividend_job_state from public,anon,authenticated,service_role;
grant select on public.dividend_job_state to service_role;
create function public.acquire_dividend_job(p_run_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare state public.dividend_job_state%rowtype;
begin
 if p_run_id is null then raise exception 'Run ID required'; end if;
 select * into strict state from public.dividend_job_state where name='tracking' for update;
 if state.lease_until>clock_timestamp() then return null; end if;
 update public.dividend_job_state set run_id=p_run_id,lease_until=clock_timestamp()+interval '10 minutes',last_started_at=clock_timestamp(),last_status='running' where name='tracking';
 return jsonb_build_object('cursor',state.cursor);
end; $$;
create function public.finish_dividend_job(p_run_id uuid,p_cursor uuid,p_status text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_run_id is null or p_status is null or p_status not in ('completed','needs-attention','failed') then raise exception 'Invalid completion'; end if;
 update public.dividend_job_state set cursor=p_cursor,run_id=null,lease_until=null,last_finished_at=clock_timestamp(),last_status=p_status where name='tracking' and run_id=p_run_id and lease_until>clock_timestamp();
 if not found then raise exception 'Job lease lost'; end if;
end; $$;
revoke all on function public.acquire_dividend_job(uuid) from public,anon,authenticated;
revoke all on function public.finish_dividend_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.acquire_dividend_job(uuid) to service_role;
grant execute on function public.finish_dividend_job(uuid,uuid,text) to service_role;
