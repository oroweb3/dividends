do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); rejected boolean;
begin
 if (select lease_until>clock_timestamp() from public.dividend_job_state where name='tracking') then raise exception 'Existing job active; test later'; end if;
 if public.acquire_dividend_job(a) is null then raise exception 'FAIL initial lease'; end if;
 if public.acquire_dividend_job(b) is not null then raise exception 'FAIL concurrent lease'; end if;
 rejected:=false;
 begin perform public.finish_dividend_job(b,c,'completed'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL other worker completion'; end if;
 perform public.finish_dividend_job(a,c,'completed');
 if (public.acquire_dividend_job(b)->>'cursor')::uuid is distinct from c then raise exception 'FAIL cursor not resumed'; end if;
 update public.dividend_job_state set lease_until=clock_timestamp()-interval '1 second' where name='tracking';
 if public.acquire_dividend_job(a) is null then raise exception 'FAIL abandoned run not recoverable'; end if;
 rejected:=false;
 begin perform public.finish_dividend_job(b,null,'completed'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL stale worker overwrote new run'; end if;
 perform public.finish_dividend_job(a,null,'completed');
 if public.acquire_dividend_job(b)->>'cursor' is not null then raise exception 'FAIL full scan did not restart'; end if;
 perform public.finish_dividend_job(b,null,'failed');
end; $$;
