-- Run against the chosen TEST database after migrations 001–003.
-- Uses synthetic identities and rolls back every fixture. Does not test concurrency.
begin;
do $$
declare
  suffix text := gen_random_uuid()::text;
  tracking uuid;
  verification uuid;
  request uuid := gen_random_uuid();
  claim uuid;
  again uuid;
  initial_time timestamptz;
  evidence jsonb;
  rejected boolean;
  amount numeric;
begin
  insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,enabled_at,baseline)
  values('test-user-'||suffix,'test-wallet-'||suffix,'test-mint-'||suffix,'TEST',clock_timestamp()-interval '2 days','{"raw_balance":"1000000000"}')
  returning id,enabled_at into tracking,initial_time;

  insert into public.dividend_tracking(user_id,wallet_address,stock_mint,symbol,baseline)
  values('test-user-'||suffix,'test-wallet-'||suffix,'test-mint-'||suffix,'TEST','{"raw_balance":"999"}')
  on conflict(user_id,wallet_address,stock_mint) do nothing;
  if not exists(select 1 from public.dividend_tracking where id=tracking and enabled_at=initial_time and baseline->>'raw_balance'='1000000000') then
    raise exception 'FAIL: enrollment retry changed baseline';
  end if;

  evidence := jsonb_build_object('blockers','[]'::jsonb,'history',jsonb_build_object('status','no-activity-observed'),
    'current',jsonb_build_object('rawBaseUnits','1000000000'),
    'event',jsonb_build_object('effectiveTimeUtc',clock_timestamp()-interval '1 day','multiplierOld','1','multiplierNew','1.002'));
  insert into public.dividend_verifications(tracking_id,event_id,event_version,status,evidence)
  values(tracking,'test-event-'||suffix,1,'history-checked',evidence) returning id into verification;

  rejected := false;
  begin
    perform public.reserve_dividend_claim('different-user',verification,gen_random_uuid());
  exception when others then
    if sqlerrm<>'Claim owner mismatch' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: cross-user reservation accepted'; end if;

  update public.dividend_verifications set checked_at=clock_timestamp()-interval '1 minute' where id=verification;
  rejected := false;
  begin
    perform public.reserve_dividend_claim('test-user-'||suffix,verification,request);
  exception when others then
    if sqlerrm<>'Fresh successful verification required' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: stale verification accepted'; end if;

  update public.dividend_verifications set checked_at=clock_timestamp(),status='blocked' where id=verification;
  rejected := false;
  begin
    perform public.reserve_dividend_claim('test-user-'||suffix,verification,request);
  exception when others then
    if sqlerrm<>'Fresh successful verification required' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: blocked verification accepted'; end if;

  update public.dividend_verifications set checked_at=clock_timestamp(),status='history-checked' where id=verification;
  claim := public.reserve_dividend_claim('test-user-'||suffix,verification,request);
  again := public.reserve_dividend_claim('test-user-'||suffix,verification,request);
  if claim<>again then raise exception 'FAIL: identical retry created a second claim'; end if;
  select raw_amount into amount from public.dividend_claim_reservations where id=claim;
  if amount<>1996007 then raise exception 'FAIL: unexpected dividend quantity %',amount; end if;

  rejected := false;
  begin
    perform public.reserve_dividend_claim('test-user-'||suffix,verification,gen_random_uuid());
  exception when unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'FAIL: duplicate event claim accepted'; end if;
  if (select count(*) from public.dividend_claim_reservations where verification_id=verification)<>1 then
    raise exception 'FAIL: expected exactly one reservation';
  end if;
  raise notice 'PASS: enrollment preservation, owner rejection, stale/blocked rejection, exact amount, retry identity, duplicate event rejection';
end;
$$;
rollback;
