import {verifySignedTransaction} from './signed-transaction';
export type PreparedExecution={claimId:string;wallet:string;walletId:string;unsignedTransaction:string;transactionHash:string;lastValidBlockHeight:number;expiresAt:number;sponsor?:{address:string;walletId:string;costLamports:number}};
export type ExecutionDependencies={
 // Caller must recheck evidence against the reserved claim, not treat it as a new claim.
 validate:(attempt:PreparedExecution)=>Promise<void>;
 authorized:(attempt:PreparedExecution)=>Promise<boolean>;
 beginSigning:(claimId:string)=>Promise<boolean>;
 sign:(attempt:PreparedExecution)=>Promise<string>;
 recordSignature:(claimId:string,signed:string,signature:string)=>Promise<void>;
 broadcast:(signed:string)=>Promise<string>;
 advance:(claimId:string,status:'submitted'|'review-required')=>Promise<void>;
 now:()=>number;
};
/** Internal only. No route or worker invokes this until execution is enabled. */
export async function signAndSubmit(attempt:PreparedExecution,deps:ExecutionDependencies){
 await deps.validate(attempt);
 if(!await deps.authorized(attempt))throw Error('Delegated access is not active');
 if(deps.now()>=attempt.expiresAt)throw Error('Execution quote expired');
 if(!await deps.beginSigning(attempt.claimId))return {status:'reconciliation-required' as const};
 let signed:ReturnType<typeof verifySignedTransaction>;
 try{
  // Check again after acquiring the signing gate. Never use a stale consent flag.
  if(!await deps.authorized(attempt)||deps.now()>=attempt.expiresAt)throw Error('Execution permission or quote changed');
  signed=verifySignedTransaction(attempt.unsignedTransaction,await deps.sign(attempt),attempt.wallet,attempt.transactionHash);
  // Durable signed bytes and signature are recorded BEFORE any broadcast.
  await deps.recordSignature(attempt.claimId,signed.signedTransaction,signed.signature);
 }catch{
  await deps.advance(attempt.claimId,'review-required').catch(()=>{});
  return {status:'reconciliation-required' as const};
 }
 if(deps.now()>=attempt.expiresAt){await deps.advance(attempt.claimId,'review-required');return {status:'reconciliation-required' as const};}
 try{
  if(!await deps.authorized(attempt)){await deps.advance(attempt.claimId,'review-required');return {status:'reconciliation-required' as const};}
  const returned=await deps.broadcast(signed.signedTransaction);
  if(returned!==signed.signature)throw Error('RPC signature mismatch');
  await deps.advance(attempt.claimId,'submitted');
  return {status:'submitted' as const,signature:signed.signature};
 }catch{
  // The RPC may have received it. Preserve bytes for signature-based reconciliation.
  return {status:'reconciliation-required' as const,signature:signed.signature};
 }
}
