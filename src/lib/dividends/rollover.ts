import 'server-only';
import {z} from 'zod';
import {getTransactionDecoder,getCompiledTransactionMessageDecoder} from '@solana/kit';
import type {Stock} from '../xstocks/assets';
import {snapshotSchema} from './eligibility';
import {rolloverCheckpoint,rolloverTransactionSchema} from './rollover-proof';
import {trackingRequest} from '../supabase/tracking';
import {rpc} from '../solana/rpc';
import {readBalances} from '../solana/balances';
import {inspectIndexedHistory} from '../solana/history';
import {verifySignedTransaction} from '../swaps/signed-transaction';
export async function rolloverConfirmedClaim(userId:string,wallet:string,stock:Stock,claimId:string){
 try{
  z.string().uuid().parse(claimId);
  const query=new URLSearchParams({id:`eq.${claimId}`,user_id:`eq.${userId}`,wallet_address:`eq.${wallet}`,stock_mint:`eq.${stock.mint}`,select:'id,status,raw_amount,rollover_status,transaction_signature',limit:'1'});
  const claims=z.array(z.object({id:z.literal(claimId),status:z.literal('confirmed'),raw_amount:z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().safe()]).transform(String),rollover_status:z.enum(['pending','complete']),transaction_signature:z.string()})).length(1).parse(await trackingRequest(`dividend_claim_reservations?${query}`));
  if(claims[0].rollover_status==='complete')return {rollover:'complete' as const};
  const executions=z.array(z.object({status:z.literal('confirmed'),unsigned_transaction:z.string(),signed_transaction:z.string(),transaction_hash:z.string(),transaction_signature:z.literal(claims[0].transaction_signature),rollover_context:z.object({tracking_id:z.string().uuid(),baseline:snapshotSchema,multiplier_new:z.string().regex(/^\d+(\.\d+)?$/)})})).length(1).parse(await trackingRequest(`dividend_executions?${new URLSearchParams({claim_id:`eq.${claimId}`,select:'*',limit:'1'})}`));
  const execution=executions[0],context=execution.rollover_context;
  if(context.baseline.user_id!==userId||context.baseline.wallet_address!==wallet||context.baseline.stock_mint!==stock.mint)throw Error('Rollover identity mismatch');
  const verified=verifySignedTransaction(execution.unsigned_transaction,execution.signed_transaction,wallet,execution.transaction_hash);
  if(verified.signature!==execution.transaction_signature)throw Error('Rollover signature mismatch');
  const tx=rolloverTransactionSchema.parse(await rpc('getTransaction',[verified.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]));
  if(tx.transaction[0]!==execution.signed_transaction)throw Error('Finalized transaction does not match journal');
  const compiled=getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(Buffer.from(tx.transaction[0],'base64')).messageBytes);
  const keys=[...compiled.staticAccounts,...(tx.meta.loadedAddresses?.writable??[]),...(tx.meta.loadedAddresses?.readonly??[])];
  const current=(await readBalances(wallet)).find(b=>b.mint===stock.mint)!;
  // Prove effects before exempting this exact transaction from the history scan.
  rolloverCheckpoint(context.baseline,context.multiplier_new,claims[0].raw_amount,tx,keys,current);
  const history=await inspectIndexedHistory(wallet,context.baseline.balance_slot,current.mintSlot,stock.mint,[...context.baseline.token_accounts.map(a=>a.address),...current.tokenAccounts.map(a=>a.address)],{signature:verified.signature,slot:tx.slot});
  if(history.status!=='no-activity-observed')return {rollover:'pending' as const,rolloverReason:history.reason};
  const baseline=rolloverCheckpoint(context.baseline,context.multiplier_new,claims[0].raw_amount,tx,keys,current);
  await trackingRequest('rpc/rollover_dividend_baseline',{method:'POST',body:JSON.stringify({p_user_id:userId,p_claim_id:claimId,p_baseline:baseline,p_transaction_slot:tx.slot,p_evidence:{signature:verified.signature,history:history.status,fromSlot:context.baseline.balance_slot,toSlot:current.mintSlot}})});
  return {rollover:'complete' as const};
 }catch{return {rollover:'pending' as const,rolloverReason:'The conversion is confirmed, but the next checkpoint could not be verified. Holdings may have changed or finalized history may be unavailable. Future conversions remain blocked until the checkpoint is verified.'};}
}
