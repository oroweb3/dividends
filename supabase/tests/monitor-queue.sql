do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); t uuid; other uuid; item jsonb; old_timestamp timestamptz; old_tuple tid; rejected boolean;
begin
 -- Test-only transaction isolates fixtures from any real queued accounts.
 update public.dividend_check_queue set next_check_at=clock_timestamp()+interval '1 day';
 update public.dividend_job_state set lease_until=null,run_id=null where name='tracking';
 insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,baseline) values('queue-test-'||a,a::text,a::text,'TEST','{}') returning id into t;
 insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,baseline) values('queue-test-'||b,b::text,b::text,'TEST','{}') returning id into other;
 perform public.acquire_dividend_job(a);
 item:=public.claim_dividend_check(a);
 if (item->>'tracking_id')::uuid is distinct from t then raise exception 'FAIL queue insert or due ordering'; end if;
 if (public.claim_dividend_check(a)->>'tracking_id')::uuid is distinct from other then raise exception 'FAIL duplicate claim'; end if;
 if public.claim_dividend_check(a) is not null then raise exception 'FAIL exhausted queue'; end if;
 if not public.record_dividend_monitor_change(t,a,repeat('a',64),'{"balance":"10"}') then raise exception 'FAIL initial observation'; end if;
 select changed_at,ctid into old_timestamp,old_tuple from public.dividend_monitor_state where tracking_id=t;
 if public.record_dividend_monitor_change(t,a,repeat('a',64),'{"balance":"10"}') then raise exception 'FAIL unchanged write'; end if;
 if not exists(select 1 from public.dividend_monitor_state where tracking_id=t and changed_at=old_timestamp and ctid=old_tuple) then raise exception 'FAIL unchanged observation physically updated'; end if;
 if not public.record_dividend_monitor_change(t,a,repeat('b',64),'{"balance":"11"}') then raise exception 'FAIL changed observation not saved'; end if;
 rejected:=false;
 begin perform public.record_dividend_monitor_change(t,b,repeat('c',64),'{}'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL stale worker write'; end if;
 perform public.finish_dividend_check(a,t,true);
 if public.claim_dividend_check(a) is not null then raise exception 'FAIL healthy row immediately requeued'; end if;
 perform public.finish_dividend_check(a,other,false);
 if not exists(select 1 from public.dividend_check_queue where tracking_id=other and consecutive_failures=1 and next_check_at>clock_timestamp()+interval '4 minutes') then raise exception 'FAIL failure scheduling'; end if;
 -- Expired per-account lease can be reclaimed, without duplicate queue rows.
 update public.dividend_check_queue set next_check_at=clock_timestamp()-interval '1 minute',lease_run_id=b,lease_until=clock_timestamp()-interval '1 second' where tracking_id=other;
 if (public.claim_dividend_check(a)->>'tracking_id')::uuid is distinct from other then raise exception 'FAIL expired lease recovery'; end if;
 perform public.finish_dividend_check(a,other,false);
 if not exists(select 1 from public.dividend_check_queue where tracking_id=other and consecutive_failures=2 and next_check_at>clock_timestamp()+interval '9 minutes') then raise exception 'FAIL exponential backoff'; end if;
 if exists(select 1 from public.dividend_verifications where tracking_id in (t,other)) then raise exception 'FAIL monitoring created authorization evidence'; end if;
 perform public.finish_dividend_job(a,null,'completed');
end; $$;
