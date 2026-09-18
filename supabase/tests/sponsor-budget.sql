do $$
declare suffix text:=gen_random_uuid()::text; u text; t uuid; v uuid; c uuid; ids uuid[]:='{}'; raw text; rejected boolean; i integer;
begin
 u:='sponsor-test-'||suffix;
 insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline) values(u,suffix,suffix,'TEST',clock_timestamp()-interval '2 days','{}') returning id into t;
 for i in 1..12 loop
  insert into public.dividend_verifications(tracking_id,event_id,event_version,status,evidence) values(t,suffix||i,1,'history-checked',jsonb_build_object('blockers','[]'::jsonb,'history',jsonb_build_object('status','no-activity-observed'),'current',jsonb_build_object('rawBaseUnits','1000'),'event',jsonb_build_object('effectiveTimeUtc',clock_timestamp()-interval '1 day','multiplierOld','1','multiplierNew','1.25'))) returning id into v;
  c:=public.reserve_dividend_claim(u,v,gen_random_uuid());ids:=array_append(ids,c);
  raw:=encode(convert_to(suffix||i,'UTF8'),'base64');
  perform public.prepare_dividend_execution(u,c,encode(sha256(decode(raw,'base64')),'hex'),raw,100,(extract(epoch from clock_timestamp())*1000)::bigint+60000);
 end loop;
 rejected:=false;
 begin perform public.begin_sponsored_dividend_signing('wrong',ids[1],repeat('2',44),10000000); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL wrong owner'; end if;
 rejected:=false;
 begin perform public.begin_sponsored_dividend_signing(u,ids[1],repeat('2',44),10100001); exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL transaction cap'; end if;
 if not public.begin_sponsored_dividend_signing(u,ids[1],repeat('2',44),10000000) then raise exception 'FAIL first budget'; end if;
 if public.begin_sponsored_dividend_signing(u,ids[1],repeat('2',44),10000000) then raise exception 'FAIL duplicate signing'; end if;
 if not public.begin_sponsored_dividend_signing(u,ids[2],repeat('2',44),10000000) then raise exception 'FAIL second budget'; end if;
 rejected:=false;
 begin perform public.begin_sponsored_dividend_signing(u,ids[3],repeat('3',44),1); exception when others then if sqlerrm<>'Sponsorship budget exhausted' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL per-user cap across sponsor rotation'; end if;
 if not exists(select 1 from public.dividend_executions where claim_id=ids[3] and status='prepared') then raise exception 'FAIL failed budget consumed signing gate'; end if;
 if (select count(*) from public.dividend_sponsor_spend where user_id=u)<>2 then raise exception 'FAIL budget double counted'; end if;
 update public.dividend_executions set quote_expires_at=1 where claim_id=ids[4];
 rejected:=false;
 begin perform public.begin_sponsored_dividend_signing(u,ids[4],repeat('2',44),1); exception when others then if sqlerrm<>'Quote expired' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL expired attempt'; end if;
 -- Seed the remainder of today's global budget using only these synthetic claims.
 for i in 5..12 loop
  insert into public.dividend_sponsor_spend(claim_id,user_id,sponsor_address,cost_lamports,budget_day) values(ids[i],u||i,repeat('2',44),10000000,(clock_timestamp() at time zone 'UTC')::date);
 end loop;
 update public.dividend_claim_reservations set user_id=u||'other' where id=ids[3];
 rejected:=false;
 begin perform public.begin_sponsored_dividend_signing(u||'other',ids[3],repeat('3',44),1); exception when others then if sqlerrm<>'Sponsorship budget exhausted' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL global cap across users and sponsors'; end if;
end; $$;
