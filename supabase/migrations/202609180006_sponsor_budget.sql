-- Conservative reservations: never refund ambiguous/failed signature attempts automatically.
create table public.dividend_sponsor_spend (
 claim_id uuid primary key references public.dividend_executions(claim_id),
 user_id text not null, sponsor_address text not null,
 cost_lamports bigint not null check(cost_lamports between 1 and 10100000),
 budget_day date not null, created_at timestamptz not null default clock_timestamp()
);
create index dividend_sponsor_spend_day on public.dividend_sponsor_spend(budget_day,user_id);
alter table public.dividend_sponsor_spend enable row level security;
revoke all on public.dividend_sponsor_spend from public,anon,authenticated,service_role;
grant select on public.dividend_sponsor_spend to service_role;
create function public.begin_sponsored_dividend_signing(p_user_id text,p_claim_id uuid,p_sponsor text,p_cost bigint)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare day date; total bigint; personal bigint; count_all bigint; count_user bigint;
begin
 if p_user_id is null or p_sponsor is null or p_sponsor !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' or p_cost is null or p_cost not between 1 and 10100000 then raise exception 'Invalid sponsorship'; end if;
 -- One global budget across sponsor addresses, including key rotations.
 perform pg_advisory_xact_lock(1886351475,1936748398);
 day:=(clock_timestamp() at time zone 'UTC')::date;
 -- Existing gate locks claim and verifies owner. All later failure rolls it back.
 if not public.begin_dividend_signing(p_user_id,p_claim_id) then return false; end if;
 if not exists(select 1 from public.dividend_executions where claim_id=p_claim_id and quote_expires_at>extract(epoch from clock_timestamp())*1000) then raise exception 'Quote expired'; end if;
 select coalesce(sum(cost_lamports),0),coalesce(sum(cost_lamports) filter(where user_id=p_user_id),0),count(*),count(*) filter(where user_id=p_user_id)
 into total,personal,count_all,count_user from public.dividend_sponsor_spend where budget_day=day;
 if total+p_cost>100000000 or personal+p_cost>20000000 or count_all>=100 or count_user>=10 then raise exception 'Sponsorship budget exhausted'; end if;
 insert into public.dividend_sponsor_spend(claim_id,user_id,sponsor_address,cost_lamports,budget_day) values(p_claim_id,p_user_id,p_sponsor,p_cost,day);
 return true;
end; $$;
revoke all on function public.begin_sponsored_dividend_signing(text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.begin_sponsored_dividend_signing(text,uuid,text,bigint) to service_role;
