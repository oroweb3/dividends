import 'server-only';
import {z} from 'zod';
import {sponsorConfig} from '../privy/sponsor';
import {rolloverConfirmedClaim} from '../dividends/rollover';
import type {Stock} from '../xstocks/assets';
import {trackingRequest} from '../supabase/tracking';
import {reserveDividendClaim} from '../supabase/claims';
import {executionJournal} from '../supabase/executions';
import {getDelegation} from '../privy/delegation';
import {inspectDividend} from '../dividends/inspect';
import {prepareTitanSwap} from '../titan/simulate';
import {readPreview} from './preview-token';
import {prepareGoldConversion,dividendFingerprint,PreviewBlocked} from './preview';
import {executePreparedClaim,reconcileClaim} from './execution-service';
import {conversionFlow} from './conversion-flow';
const claimSchema=z.object({id:z.string().uuid(),stock_mint:z.string(),wallet_address:z.string(),status:z.string(),raw_amount:z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().safe()]).transform(String),transaction_signature:z.string().nullable()});
async function requestClaim(userId:string,wallet:string,stock:Stock,requestId:string){
 z.string().uuid().parse(requestId);
 const claims=z.array(claimSchema).parse(await trackingRequest(`dividend_claim_reservations?${new URLSearchParams({request_id:`eq.${requestId}`,user_id:`eq.${userId}`,select:'id,stock_mint,wallet_address,status,raw_amount,transaction_signature',limit:'1'})}`));
 if(claims[0]&&(claims[0].wallet_address!==wallet||claims[0].stock_mint!==stock.mint))throw Error('Request identity mismatch');
 return claims[0]??null;
}
export async function conversionStatus(userId:string,wallet:string,walletId:string,stock:Stock,requestId:string){
 const claim=await requestClaim(userId,wallet,stock,requestId);if(!claim)return null;
 if(claim.status==='confirmed')return {claimId:claim.id,status:'confirmed',signature:claim.transaction_signature,...await rolloverConfirmedClaim(userId,wallet,stock,claim.id)};
 const attempts=z.array(z.object({claim_id:z.string()})).parse(await trackingRequest(`dividend_executions?${new URLSearchParams({claim_id:`eq.${claim.id}`,select:'claim_id',limit:'1'})}`));
 if(!attempts.length)return {claimId:claim.id,status:'review-required',signature:claim.transaction_signature};
 const action=await reconcileClaim(userId,claim.id,wallet,walletId);
 const updated=await requestClaim(userId,wallet,stock,requestId);
 if(updated?.status==='confirmed')return {claimId:claim.id,status:'confirmed',signature:updated.transaction_signature,...await rolloverConfirmedClaim(userId,wallet,stock,claim.id)};
 return {claimId:claim.id,status:action==='mark-confirmed'||action==='complete'?'confirmed':action==='manual-review'||action==='fresh-validation-required'?'review-required':updated?.status??claim.status,signature:updated?.transaction_signature??claim.transaction_signature};
}
export async function convertDividend(userId:string,wallet:string,walletId:string,stock:Stock,requestId:string,token?:string){
 if(process.env.DIVIDEND_EXECUTION_ENABLED!=='true')throw new PreviewBlocked(['Conversions are disabled while live validation is pending.']);
 const journal=executionJournal(userId);
 type Prepared=Awaited<ReturnType<typeof prepareGoldConversion>>;
 function attempt(p:Prepared,claimId:string){
  if(!p.prepared)throw Error('Validated transaction unavailable');
  return {claimId,wallet,walletId,unsignedTransaction:p.prepared.unsignedTransaction,transactionHash:p.prepared.simulation.transactionHash,lastValidBlockHeight:p.prepared.lifetime.lastValidBlockHeight,expiresAt:p.expiresAt,sponsor:{address:p.prepared.simulation.feePayer,walletId:sponsorConfig().walletId,costLamports:p.prepared.simulation.networkFeeLamports+p.prepared.simulation.rentLamports}};
 }
 return conversionFlow({
  existing:()=>conversionStatus(userId,wallet,walletId,stock,requestId),
  prepare:async()=>{
   if(!(await getDelegation(wallet,walletId)).authorized)throw new PreviewBlocked(['Authorize automation before converting.']);
   const previous=readPreview(token??'',process.env.SWAP_PREVIEW_SECRET??'',userId,wallet);
   if(previous.symbol!==stock.symbol)throw new PreviewBlocked(['Preview stock mismatch.']);
   const p=await prepareGoldConversion(userId,wallet,stock,previous);
   if(!p.check.verificationId||!p.prepared)throw Error('Fresh verification unavailable');return p;
  },
  reserve:async(p)=>{
   const id=await reserveDividendClaim(userId,p.check.verificationId!,requestId);
   const claim=await requestClaim(userId,wallet,stock,requestId);
   if(claim?.id!==id||claim.raw_amount!==p.amount||claim.status!=='reserved')throw Error('Reserved amount or claim changed');return id;
  },
  persist:async(p,id)=>{await journal.prepare(attempt(p,id));},
  execute:async(p,id)=>{
   const result=await executePreparedClaim(userId,attempt(p,id),async()=>{
    // The sole reservation exception is this user's exact reserved claim.
    const fresh=await inspectDividend(userId,wallet,stock,id);
    if(!fresh.historyVerified||dividendFingerprint(fresh)!==p.fingerprint)throw Error('Dividend evidence changed after reservation');
    const verified=await prepareTitanSwap({route:p.quote.rawRoute,wallet,inputMint:stock.mint,outputMint:p.outputMint,amount:p.amount,minimum:p.quote.otherAmountThreshold,sourceAccounts:fresh.current.tokenAccounts,expiresAt:p.expiresAt,expiresAfterSlot:p.quote.expiresAfterSlot,lifetime:p.prepared!.lifetime});
    if(verified.simulation.networkFeeLamports+verified.simulation.rentLamports>p.prepared!.simulation.networkFeeLamports+p.prepared!.simulation.rentLamports)throw Error('Sponsor cost increased');
    if(verified.simulation.transactionHash!==p.prepared!.simulation.transactionHash)throw Error('Validated transaction changed');
   });
   return {claimId:id,status:result.status,signature:'signature' in result?result.signature??null:null};
  },
 });
}
