import 'server-only';
import {inspectDividend} from '../dividends/inspect';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getIssuerData} from '../xstocks/client';
import {saveMonitorChange} from '../jobs/monitor';
import {assets} from '../xstocks/assets';
import {trackingRequest} from '../supabase/tracking';
import {readUserWallet} from '../privy/server';
import {getDelegation} from '../privy/delegation';
import {createGoldPreview} from './preview';
import {readPreview} from './preview-token';
import {convertDividend,conversionStatus} from './convert';
export const queuedTrackingSchema=z.object({tracking_id:z.string().uuid(),user_id:z.string(),wallet_address:z.string(),stock_mint:z.string()});
export type QueuedTracking=z.infer<typeof queuedTrackingSchema>;
export function issuerBatch(){
 const data=new Map<string,ReturnType<typeof getIssuerData>>();
 return (stock:typeof assets[number])=>{let promise=data.get(stock.mint);if(!promise){promise=getIssuerData(stock);data.set(stock.mint,promise);}return promise;};
}
export async function processQueuedTracking(row:QueuedTracking,runId:string,issuer:ReturnType<typeof issuerBatch>){
 try{
  const stock=assets.find(a=>a.mint===row.stock_mint);if(!stock)throw Error('Unsupported stock');
  const user=await readUserWallet(row.user_id);
  if(user.wallet!==row.wallet_address||!user.walletId)throw Error('Wallet ownership unavailable');
  const check=await inspectDividend(row.user_id,user.wallet,stock,undefined,{issuer:issuer(stock)});
  const changed=await saveMonitorChange(row.tracking_id,runId,check.monitorObservation);
  // Monitoring data never becomes reservation/signing evidence. Execution below makes fresh checks.
  if(process.env.DIVIDEND_EXECUTION_ENABLED!=='true')return {status:check.historyVerified?'eligible-awaiting-execution':'monitoring',changed};
   // Reconcile already-started claims even if permission has since been revoked.
   const pending=z.array(z.object({request_id:z.string().uuid()})).parse(await trackingRequest(`dividend_claim_reservations?${new URLSearchParams({user_id:`eq.${row.user_id}`,wallet_address:`eq.${user.wallet}`,stock_mint:`eq.${stock.mint}`,or:'(status.neq.confirmed,rollover_status.eq.pending)',select:'request_id',order:'reserved_at.asc',limit:'1'})}`));
   if(pending.length){const state=await conversionStatus(row.user_id,user.wallet,user.walletId,stock,pending[0].request_id);return {status:state&&'rollover' in state&&state.rollover==='pending'?'rollover-pending':state?.status??'review-required'};}
   if(!check.historyVerified)return {status:'monitoring',changed};
   if(!(await getDelegation(user.wallet,user.walletId)).authorized)return {status:'not-authorized'};
   const preview=await createGoldPreview(row.user_id,user.wallet,stock);
   const verified=readPreview(preview.token,process.env.SWAP_PREVIEW_SECRET??'',row.user_id,user.wallet);
   // Stable for the same eligibility fingerprint across worker retries.
   const id=createHash('sha256').update(JSON.stringify([row.user_id,user.wallet,stock.mint,verified.fingerprint])).digest().subarray(0,16);id[6]=(id[6]&15)|80;id[8]=(id[8]&63)|128;
   const hex=id.toString('hex'),requestId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
   const result=await convertDividend(row.user_id,user.wallet,user.walletId,stock,requestId,preview.token);
   return {status:result.status};

 }catch{
  await saveMonitorChange(row.tracking_id,runId,{error:'monitoring-or-execution-unavailable'});
  return {status:'failed'};
 }
}
