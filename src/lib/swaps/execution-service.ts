import 'server-only';
import {z} from 'zod';
import {trackingRequest} from '../supabase/tracking';
import {executionJournal} from '../supabase/executions';
import {verifySponsor} from '../privy/sponsor';
import {transactionSigners} from './signed-transaction';
import {getDelegation} from '../privy/delegation';
import {signPreparedTransaction} from '../privy/sign-transaction';
import {rpc} from '../solana/rpc';
import {signAndSubmit,type PreparedExecution} from './executor';
import {verifySignedTransaction} from './signed-transaction';
import {recoveryAction,type ChainObservation} from './execution-state';
const rowSchema=z.object({claim_id:z.string().uuid(),transaction_hash:z.string(),unsigned_transaction:z.string(),signed_transaction:z.string().nullable(),transaction_signature:z.string().nullable(),last_valid_block_height:z.number().int().safe(),quote_expires_at:z.number().int().safe(),status:z.enum(['prepared','signing','signed','submitted','confirmed','review-required'])});
async function ownedExecution(userId:string,claimId:string,wallet:string){
 z.string().uuid().parse(claimId);
 const claims=z.array(z.object({id:z.literal(claimId),wallet_address:z.literal(wallet)})).parse(await trackingRequest(`dividend_claim_reservations?${new URLSearchParams({id:`eq.${claimId}`,user_id:`eq.${userId}`,select:'id,wallet_address',limit:'1'})}`));
 if(claims.length!==1)throw Error('Execution ownership could not be verified');
 const rows=z.array(rowSchema).parse(await trackingRequest(`dividend_executions?${new URLSearchParams({claim_id:`eq.${claimId}`,select:'*',limit:'1'})}`));
 if(rows.length!==1)throw Error('Execution record unavailable');return rows[0];
}
/** Internal entrypoint. Caller supplies fresh reserved-claim eligibility/simulation.
 * Both the authenticated route and worker use this gate. */
export async function executePreparedClaim(userId:string,attempt:PreparedExecution,validate:(attempt:PreparedExecution)=>Promise<void>){
 if(process.env.DIVIDEND_EXECUTION_ENABLED!=='true')throw Error('Execution is disabled');
 const stored=await ownedExecution(userId,attempt.claimId,attempt.wallet);
 if(stored.transaction_hash!==attempt.transactionHash||stored.unsigned_transaction!==attempt.unsignedTransaction||stored.last_valid_block_height!==attempt.lastValidBlockHeight||stored.quote_expires_at!==attempt.expiresAt)throw Error('Execution identity changed');
 if(stored.status!=='prepared')return {status:'reconciliation-required' as const};
 const journal=executionJournal(userId);
 return signAndSubmit(attempt,{
  validate,authorized:async a=>(await getDelegation(a.wallet,a.walletId)).authorized,
  beginSigning:async()=>{
   const sponsor=await verifySponsor();
   if(!attempt.sponsor||sponsor.address!==attempt.sponsor.address||sponsor.walletId!==attempt.sponsor.walletId||transactionSigners(attempt.unsignedTransaction,attempt.wallet)[0]!==sponsor.address)throw Error('Sponsor mismatch');
   return journal.beginSponsoredSigning(attempt);
  },recordSignature:journal.recordSignature,advance:journal.advance,
  sign:signPreparedTransaction,now:Date.now,
  broadcast:async signed=>z.string().parse(await rpc('sendTransaction',[signed,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}])),
 });
}
/** Read chain evidence even after revocation; rebroadcast additionally requires
 * active delegation, unexpired quote and the explicit execution switch. */
export async function reconcileClaim(userId:string,claimId:string,wallet:string,walletId:string){
 const stored=await ownedExecution(userId,claimId,wallet),journal=executionJournal(userId);
 if(stored.status==='confirmed')return 'complete';
 if(stored.status==='prepared')return 'fresh-validation-required';
 if(stored.status==='signing'||stored.status==='review-required')return 'manual-review';
 if(!stored.signed_transaction||!stored.transaction_signature)throw Error('Signed execution evidence missing');
 const verified=verifySignedTransaction(stored.unsigned_transaction,stored.signed_transaction,wallet,stored.transaction_hash);
 if(verified.signature!==stored.transaction_signature)throw Error('Execution signature mismatch');
 let observation:ChainObservation;
 try{
  const result=z.object({value:z.array(z.object({err:z.unknown(),confirmationStatus:z.enum(['processed','confirmed','finalized']).nullable()}).nullable()).length(1)}).parse(await rpc('getSignatureStatuses',[[stored.transaction_signature],{searchTransactionHistory:true}]));
  const status=result.value[0];
  // Only finalized chain evidence settles the claim.
  if(status?.confirmationStatus==='finalized')observation=status.err===null?{status:'confirmed'}:{status:'failed'};
  else if(status)observation={status:'unavailable'};
  else observation={status:'not-found',blockHeight:z.number().int().nonnegative().safe().parse(await rpc('getBlockHeight',[{commitment:'finalized'}]))};
 }catch{observation={status:'unavailable'};}
 const action=recoveryAction(stored.status,observation,stored.last_valid_block_height);
 if(action==='mark-confirmed')await journal.advance(claimId,'confirmed');
 if(action==='manual-review')await journal.advance(claimId,'review-required');
 if(action==='rebroadcast-identical-bytes'){
  if(Date.now()>=stored.quote_expires_at){await journal.advance(claimId,'review-required');return 'manual-review';}
  if(process.env.DIVIDEND_EXECUTION_ENABLED!=='true'||!(await getDelegation(wallet,walletId)).authorized)return 'wait';
  try{
   const signers=transactionSigners(stored.unsigned_transaction,wallet);
   if(signers.length===2&&signers[0]!==(await verifySponsor()).address)return 'wait';
   const signature=await rpc('sendTransaction',[stored.signed_transaction,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]);
   if(signature!==stored.transaction_signature)return 'manual-review';
   if(stored.status==='signed')await journal.advance(claimId,'submitted');
  }catch{return 'wait';}
 }
 return action;
}
