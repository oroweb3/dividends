import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {trackingRequest} from '../supabase/tracking';
import {runConversionPage} from '../swaps/job';
export async function runScheduledTracking(){
 const runId=randomUUID();
 const acquired=await trackingRequest('rpc/acquire_dividend_job',{method:'POST',body:JSON.stringify({p_run_id:runId})});
 if(acquired===null)return {status:'already-running'};
 const lease=z.object({cursor:z.string().uuid().nullable()}).parse(acquired);
 try{
  const result=await runConversionPage(lease.cursor??undefined);
  const failed=result.results.some(r=>['skipped-or-unconfirmed','wallet-unavailable'].includes(r.status));
  await trackingRequest('rpc/finish_dividend_job',{method:'POST',body:JSON.stringify({p_run_id:runId,p_cursor:result.nextCursor,p_status:failed?'needs-attention':'completed'})});
  return {status:failed?'needs-attention':'completed',...result};
 }catch{
  await trackingRequest('rpc/finish_dividend_job',{method:'POST',body:JSON.stringify({p_run_id:runId,p_cursor:lease.cursor,p_status:'failed'})}).catch(()=>{});
  throw Error('Scheduled tracking failed');
 }
}
