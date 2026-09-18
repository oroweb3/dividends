-- Durable execution identity. No signing/submission is enabled by this migration.
-- One transaction per reservation. Never delete/release an uncertain attempt.
create table public.dividend_executions (
  claim_id uuid primary key references public.dividend_claim_reservations(id),
  transaction_hash text not null unique check(transaction_hash ~ '^[0-9a-f]{64}$'),
  unsigned_transaction text not null,
  quote_expires_at bigint not null check(quote_expires_at > 0),
  last_valid_block_height bigint not null check(last_valid_block_height >= 0),
  status text not null default 'prepared' check(status in ('prepared','signing','signed','submitted','confirmed','review-required')),
  signed_transaction text,
  transaction_signature text unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check((signed_transaction is null) = (transaction_signature is null)),
  check(status not in ('signed','submitted','confirmed') or signed_transaction is not null)
);
alter table public.dividend_executions enable row level security;
revoke all on public.dividend_executions from public,anon,authenticated,service_role;
grant select on public.dividend_executions to service_role;

-- Preparation persists the exact unsigned bytes before any external signature request.
create function public.prepare_dividend_execution(p_user_id text,p_claim_id uuid,p_hash text,p_unsigned text,p_last_valid_block_height bigint,p_expires_at bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.dividend_claim_reservations%rowtype; e public.dividend_executions%rowtype;
begin
 select * into strict c from public.dividend_claim_reservations where id=p_claim_id for update;
 if c.user_id is distinct from p_user_id then raise exception 'Claim owner mismatch'; end if;
 select * into e from public.dividend_executions where claim_id=p_claim_id;
 if found then
  if e.transaction_hash is distinct from p_hash or e.unsigned_transaction is distinct from p_unsigned or e.last_valid_block_height is distinct from p_last_valid_block_height or e.quote_expires_at is distinct from p_expires_at then raise exception 'Execution identity mismatch'; end if;
  return;
 end if;
 if c.status<>'reserved' then raise exception 'Claim unavailable'; end if;
 if p_expires_at is null or p_expires_at<=extract(epoch from clock_timestamp())*1000 then raise exception 'Quote expired'; end if;
 if p_hash is null or p_unsigned is null or p_last_valid_block_height is null or p_last_valid_block_height<0 or length(p_unsigned)>1644 or octet_length(decode(p_unsigned,'base64')) not between 1 and 1232 then raise exception 'Invalid unsigned transaction'; end if;
 if p_hash<>encode(sha256(decode(p_unsigned,'base64')),'hex') then raise exception 'Transaction hash mismatch'; end if;
 insert into public.dividend_executions(claim_id,transaction_hash,unsigned_transaction,last_valid_block_height,quote_expires_at)
 values(p_claim_id,p_hash,p_unsigned,p_last_valid_block_height,p_expires_at);
end;
$$;

-- Atomic prepared -> signing is consumed by exactly one worker. A crash after this
-- transition requires reconciliation; retries must not request a fresh signature.
create function public.begin_dividend_signing(p_user_id text,p_claim_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 perform 1 from public.dividend_claim_reservations where id=p_claim_id and user_id=p_user_id and status='reserved' for update;
 if not found then raise exception 'Claim unavailable'; end if;
 update public.dividend_executions set status='signing',updated_at=clock_timestamp() where claim_id=p_claim_id and status='prepared';
 get diagnostics changed=row_count;
 return changed=1;
end;
$$;
revoke all on function public.prepare_dividend_execution(text,uuid,text,text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.begin_dividend_signing(text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_dividend_execution(text,uuid,text,text,bigint,bigint) to service_role;
grant execute on function public.begin_dividend_signing(text,uuid) to service_role;

-- Caller must verify the signature and exact message match before recording bytes.
create function public.record_dividend_signature(p_user_id text,p_claim_id uuid,p_signed text,p_signature text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.dividend_executions%rowtype;
begin
 perform 1 from public.dividend_claim_reservations where id=p_claim_id and user_id=p_user_id for update;
 if not found then raise exception 'Claim owner mismatch'; end if;
 select * into strict e from public.dividend_executions where claim_id=p_claim_id for update;
 if e.signed_transaction is not null then
  if e.signed_transaction is distinct from p_signed or e.transaction_signature is distinct from p_signature then raise exception 'Signature identity mismatch'; end if;
  return;
 end if;
 if e.status<>'signing' then raise exception 'Execution not signing'; end if;
 if p_signed is null or p_signature is null or p_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' or length(p_signed)>1644 or octet_length(decode(p_signed,'base64')) not between 1 and 1232 then raise exception 'Invalid signed transaction'; end if;
 update public.dividend_executions set signed_transaction=p_signed,transaction_signature=p_signature,status='signed',updated_at=clock_timestamp() where claim_id=p_claim_id;
 update public.dividend_claim_reservations set transaction_signature=p_signature where id=p_claim_id;
end;
$$;
create function public.advance_dividend_execution(p_user_id text,p_claim_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.dividend_executions%rowtype;
begin
 perform 1 from public.dividend_claim_reservations where id=p_claim_id and user_id=p_user_id for update;
 if not found then raise exception 'Claim owner mismatch'; end if;
 select * into strict e from public.dividend_executions where claim_id=p_claim_id for update;
 if p_status=e.status then return; end if;
 if not ((p_status='submitted' and e.status='signed') or (p_status='confirmed' and e.status in ('signed','submitted')) or (p_status='review-required' and e.status in ('prepared','signing','signed','submitted'))) or p_status is null then raise exception 'Invalid execution transition'; end if;
 update public.dividend_executions set status=p_status,updated_at=clock_timestamp() where claim_id=p_claim_id;
 update public.dividend_claim_reservations set status=p_status where id=p_claim_id;
end;
$$;
revoke all on function public.record_dividend_signature(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.advance_dividend_execution(text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_dividend_signature(text,uuid,text,text) to service_role;
grant execute on function public.advance_dividend_execution(text,uuid,text) to service_role;
