import 'server-only';
import {randomUUID} from 'node:crypto';
import {trackingRequest} from '../supabase/tracking';
import {issuerBatch,queuedTrackingSchema,processQueuedTracking} from '../swaps/job';
import {drainQueue} from './queue-runner';
export async function runScheduledTracking(){
 const runId=randomUUID();
 const acquired=await trackingRequest('rpc/acquire_dividend_job',{method:'POST',body:JSON.stringify({p_run_id:runId})});
 if(acquired===null)return {status:'already-running'};
 const enabled=process.env.DIVIDEND_EXECUTION_ENABLED==='true',issuer=issuerBatch();
 const call=(name:string,params:Record<string,unknown>={})=>trackingRequest('rpc/'+name,{method:'POST',body:JSON.stringify({p_run_id:runId,...params})});
 try{
  const result=await drainQueue({concurrency:enabled?1:3,maxItems:20,startUntil:Date.now()+120000},{
   now:Date.now,
   claim:async()=>{const row=await call('claim_dividend_check');return row===null?null:queuedTrackingSchema.parse(row);},
   process:async row=>(await processQueuedTracking(row,runId,issuer)).status!=='failed',
   finish:async(row,success)=>{await call('finish_dividend_check',{p_tracking_id:row.tracking_id,p_success:success});},
  });
  await call('finish_dividend_job',{p_cursor:null,p_status:result.failed?'needs-attention':'completed'});
  return {status:result.failed?'needs-attention':'completed',enabled,...result};
 }catch{
  await call('finish_dividend_job',{p_cursor:null,p_status:'failed'}).catch(()=>{});
  throw Error('Scheduled tracking failed');
 }
}
