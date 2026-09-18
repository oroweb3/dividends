import 'server-only';
import {z} from 'zod';
import {trackingRequest} from './tracking';
import type {PreparedExecution} from '../swaps/executor';
export function executionJournal(userId:string){
 async function call(name:string,claimId:string,params:Record<string,unknown>={}){
  z.string().uuid().parse(claimId);
  return trackingRequest(`rpc/${name}`,{method:'POST',body:JSON.stringify({p_user_id:userId,p_claim_id:claimId,...params})});
 }
 return {
  prepare:(a:PreparedExecution)=>call('prepare_dividend_execution',a.claimId,{p_hash:a.transactionHash,p_unsigned:a.unsignedTransaction,p_last_valid_block_height:a.lastValidBlockHeight,p_expires_at:a.expiresAt}),
  beginSponsoredSigning:async(a:PreparedExecution)=>z.boolean().parse(await call('begin_sponsored_dividend_signing',a.claimId,{p_sponsor:a.sponsor?.address,p_cost:a.sponsor?.costLamports})),
  beginSigning:async(claimId:string)=>z.boolean().parse(await call('begin_dividend_signing',claimId)),
  recordSignature:(claimId:string,signed:string,signature:string)=>call('record_dividend_signature',claimId,{p_signed:signed,p_signature:signature}).then(()=>{}),
  advance:(claimId:string,status:'submitted'|'confirmed'|'review-required')=>call('advance_dividend_execution',claimId,{p_status:status}).then(()=>{}),
 };
}
