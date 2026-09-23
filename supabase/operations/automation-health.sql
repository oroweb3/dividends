-- Read-only operational view. No wallet identifiers, signed bytes or credentials.
begin read only;
select clock_timestamp() as checked_at, last_started_at,last_finished_at,last_status,lease_until
from public.dividend_job_state where name='tracking';

select count(*) as enrollments,
 count(*) filter(where next_check_at<clock_timestamp()-interval '15 minutes') as overdue_15m,
 count(*) filter(where consecutive_failures>0) as failing,
 min(last_checked_at) as oldest_check,max(last_checked_at) as latest_check,
 max(consecutive_failures) as max_failures
from public.dividend_check_queue;

select status,rollover_status,count(*) as claims,min(reserved_at) as oldest_reservation
from public.dividend_claim_reservations group by status,rollover_status;

select status,count(*) as executions from public.dividend_executions group by status;

select count(*) as budgeted_attempts,coalesce(sum(cost_lamports),0) as budgeted_lamports
from public.dividend_sponsor_spend
where budget_day=(clock_timestamp() at time zone 'UTC')::date;
rollback;
