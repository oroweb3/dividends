-- Synthetic fixtures, rollback-only. Requires migrations 001–004.
begin;
do $$
declare
 suffix text:=gen_random_uuid()::text; t uuid; v uuid; c uuid;
 deadline bigint:=(extract(epoch from clock_timestamp())*1000)::bigint+60000; u text; h text:=encode(sha256(decode('AQ==','base64')),'hex'); rejected boolean;
begin
 u:='execution-test-'||suffix;
 insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline)
 values(u,'test-wallet-'||suffix,'test-mint-'||suffix,'TEST',clock_timestamp()-interval '2 days','{}') returning id into t;
 insert into public.dividend_verifications(tracking_id,event_id,event_version,status,evidence)
 values(t,'test-event-'||suffix,1,'history-checked',jsonb_build_object('blockers','[]'::jsonb,'history',jsonb_build_object('status','no-activity-observed'),'current',jsonb_build_object('rawBaseUnits','1000000000'),'event',jsonb_build_object('effectiveTimeUtc',clock_timestamp()-interval '1 day','multiplierOld','1','multiplierNew','1.002'))) returning id into v;
 c:=public.reserve_dividend_claim(u,v,gen_random_uuid());
 perform public.prepare_dividend_execution(u,c,h,'AQ==',100,deadline);
 perform public.prepare_dividend_execution(u,c,h,'AQ==',100,deadline);
 rejected:=false;
 begin perform public.prepare_dividend_execution(u,c,h,'Ag==',100,deadline); exception when others then if sqlerrm<>'Execution identity mismatch' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL changed identity accepted'; end if;
 rejected:=false;
 begin perform public.begin_dividend_signing('other',c); exception when others then if sqlerrm<>'Claim unavailable' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL owner check'; end if;
 if not public.begin_dividend_signing(u,c) then raise exception 'FAIL first signing'; end if;
 if public.begin_dividend_signing(u,c) then raise exception 'FAIL duplicate signing'; end if;
 perform public.record_dividend_signature(u,c,'Ag==',repeat('2',88));
 perform public.record_dividend_signature(u,c,'Ag==',repeat('2',88));
 rejected:=false;
 begin perform public.record_dividend_signature(u,c,'Aw==',repeat('3',88)); exception when others then if sqlerrm<>'Signature identity mismatch' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL changed signature'; end if;
 perform public.advance_dividend_execution(u,c,'submitted');
 perform public.advance_dividend_execution(u,c,'confirmed');
 rejected:=false;
 begin perform public.advance_dividend_execution(u,c,'submitted'); exception when others then if sqlerrm<>'Invalid execution transition' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'FAIL terminal transition'; end if;
 if not exists(select 1 from public.dividend_claim_reservations where id=c and status='confirmed') then raise exception 'FAIL reservation not synchronized'; end if;
end;
$$;
rollback;
