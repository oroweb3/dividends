do $$
declare
 suffix text:=gen_random_uuid()::text; t uuid; v uuid; c uuid; u text; b jsonb; n jsonb; proof jsonb; bad jsonb; rejected boolean; enabled timestamptz:=clock_timestamp()-interval '2 days';
 h text:=encode(sha256(decode('AQ==','base64')),'hex');
begin
 u:='rollover-test-'||suffix;
 b:=jsonb_build_object('id',gen_random_uuid(),'user_id',u,'wallet_address',suffix,'stock_mint',suffix,'raw_balance','1000','active_multiplier','1','decimals',6,'balance_slot',10,'mint_slot',11,'chain_timestamp',100,'observed_at',enabled,'token_accounts',jsonb_build_array(jsonb_build_object('address','account','rawBaseUnits','1000')));
 insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline) values(u,suffix,suffix,'TEST',enabled,b) returning id into t;
 insert into public.dividend_verifications(tracking_id,event_id,event_version,status,evidence) values(t,suffix,1,'history-checked',jsonb_build_object('baselineId',b->>'id','blockers','[]'::jsonb,'history',jsonb_build_object('status','no-activity-observed'),'current',jsonb_build_object('rawBaseUnits','1000'),'event',jsonb_build_object('effectiveTimeUtc',clock_timestamp()-interval '1 day','multiplierOld','1','multiplierNew','1.25'))) returning id into v;
 c:=public.reserve_dividend_claim(u,v,gen_random_uuid());
 perform public.prepare_dividend_execution(u,c,h,'AQ==',100,(extract(epoch from clock_timestamp())*1000)::bigint+60000);
 n:=b||jsonb_build_object('id',gen_random_uuid(),'raw_balance','800','active_multiplier','1.25','balance_slot',21,'mint_slot',22,'chain_timestamp',210,'observed_at',clock_timestamp(),'token_accounts',jsonb_build_array(jsonb_build_object('address','account','rawBaseUnits','800')));
 proof:=jsonb_build_object('signature',repeat('2',88),'history','no-activity-observed');
 rejected:=false;
 begin perform public.rollover_dividend_baseline(u,c,n,20,proof); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL unconfirmed rollover'; end if;
 if not public.begin_dividend_signing(u,c) then raise exception 'FAIL first signing gate'; end if;
 if public.begin_dividend_signing(u,c) then raise exception 'FAIL duplicate signing gate'; end if;
 perform public.record_dividend_signature(u,c,'Ag==',repeat('2',88));
 perform public.advance_dividend_execution(u,c,'submitted');
 perform public.advance_dividend_execution(u,c,'confirmed');
 -- Later mutable verification cannot rewrite the captured conversion context.
 update public.dividend_verifications set evidence=jsonb_set(evidence,'{event,multiplierNew}','"9"') where id=v;
 rejected:=false;
 begin perform public.rollover_dividend_baseline('other',c,n,20,proof); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL owner'; end if;
 for bad in select value from jsonb_array_elements(jsonb_build_array(n||'{"balance_slot":null}',n||'{"raw_balance":"801"}',n||'{"active_multiplier":"9"}',n||'{"balance_slot":20}',n||'{"token_accounts":[]}',n||'{"observed_at":"2000-01-01"}')) loop
  rejected:=false;
  begin perform public.rollover_dividend_baseline(u,c,bad,20,proof); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL invalid checkpoint accepted'; end if;
 end loop;
 update public.dividend_tracking set baseline=b||'{"id":"changed"}' where id=t;
 rejected:=false;
 begin perform public.rollover_dividend_baseline(u,c,n,20,proof); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL stale lineage'; end if;
 update public.dividend_tracking set baseline=b where id=t;
 perform public.rollover_dividend_baseline(u,c,n,20,proof);
 perform public.rollover_dividend_baseline(u,c,n,20,proof);
 if not exists(select 1 from public.dividend_tracking where id=t and baseline=n and initial_baseline=b and enabled_at=enabled) then raise exception 'FAIL enrollment preservation'; end if;
 if (select count(*) from public.dividend_baseline_rollovers where claim_id=c)<>1 then raise exception 'FAIL duplicate rollover'; end if;
 if not exists(select 1 from public.dividend_claim_reservations where id=c and rollover_status='complete') then raise exception 'FAIL completion'; end if;
end; $$;
