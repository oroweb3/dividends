import 'server-only';
import {inspectDividend} from '../dividends/inspect';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assets} from '../xstocks/assets';
import {trackingRequest} from '../supabase/tracking';
import {readUserWallet} from '../privy/server';
import {getDelegation} from '../privy/delegation';
import {createGoldPreview} from './preview';
import {readPreview} from './preview-token';
import {convertDividend,conversionStatus} from './convert';
/** One bounded page; caller follows nextCursor. No conversions without the switch. */
export async function runConversionPage(cursor?:string){
 const enabled=process.env.DIVIDEND_EXECUTION_ENABLED==='true';
 if(cursor)z.string().uuid().parse(cursor);
 const query=new URLSearchParams({select:'id,user_id,wallet_address,stock_mint',order:'id.asc',limit:'1',...(cursor?{id:`gt.${cursor}`}:{})});
 const rows=z.array(z.object({id:z.string().uuid(),user_id:z.string(),wallet_address:z.string(),stock_mint:z.string()})).parse(await trackingRequest(`dividend_tracking?${query}`));
 const results=[];
 // Sequential to respect the Titan adapter's single-flight guard.
 for(const row of rows){
  try{
   const stock=assets.find(a=>a.mint===row.stock_mint);if(!stock)continue;
   const user=await readUserWallet(row.user_id);
   if(user.wallet!==row.wallet_address||!user.walletId){results.push({trackingId:row.id,status:'wallet-unavailable'});continue;}
   if(!enabled){
    const check=await inspectDividend(row.user_id,user.wallet,stock);
    results.push({trackingId:row.id,status:check.historyVerified?'eligible-awaiting-execution':'monitoring',blockers:check.blockers});
    continue;
   }
   // Reconcile already-started claims even if permission has since been revoked.
   const pending=z.array(z.object({request_id:z.string().uuid()})).parse(await trackingRequest(`dividend_claim_reservations?${new URLSearchParams({user_id:`eq.${row.user_id}`,wallet_address:`eq.${user.wallet}`,stock_mint:`eq.${stock.mint}`,or:'(status.neq.confirmed,rollover_status.eq.pending)',select:'request_id',order:'reserved_at.asc',limit:'1'})}`));
   if(pending.length){const state=await conversionStatus(row.user_id,user.wallet,user.walletId,stock,pending[0].request_id);results.push({trackingId:row.id,status:state&&'rollover' in state&&state.rollover==='pending'?'rollover-pending':state?.status??'review-required'});continue;}
   if(!(await getDelegation(user.wallet,user.walletId)).authorized){results.push({trackingId:row.id,status:'not-authorized'});continue;}
   const preview=await createGoldPreview(row.user_id,user.wallet,stock);
   const verified=readPreview(preview.token,process.env.SWAP_PREVIEW_SECRET??'',row.user_id,user.wallet);
   // Stable for the same eligibility fingerprint across worker retries.
   const id=createHash('sha256').update(JSON.stringify([row.user_id,user.wallet,stock.mint,verified.fingerprint])).digest().subarray(0,16);id[6]=(id[6]&15)|80;id[8]=(id[8]&63)|128;
   const hex=id.toString('hex'),requestId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
   const result=await convertDividend(row.user_id,user.wallet,user.walletId,stock,requestId,preview.token);
   results.push({trackingId:row.id,status:result.status});
  }catch{results.push({trackingId:row.id,status:'skipped-or-unconfirmed'});}
 }
 return {enabled,results,nextCursor:rows.length===1?rows[rows.length-1].id:null};
}
