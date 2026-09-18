import 'server-only';
import {z} from 'zod';
import {verifySponsor} from './sponsor';
import {transactionSigners,verifyPartialSignature,combineSponsoredSignatures} from '../swaps/signed-transaction';
import {authorizationSignature} from './authorization-signature';
import {getDelegation} from './delegation';
import type {PreparedExecution} from '../swaps/executor';
/** No browser endpoint exposes this signer. Execution remains disabled by default. */
export async function signPreparedTransaction(attempt:PreparedExecution){
 if(process.env.DIVIDEND_EXECUTION_ENABLED!=='true')throw Error('Execution is disabled');
 const id=process.env.NEXT_PUBLIC_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET,key=process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
 if(!id||!secret||!key)throw Error('Signing configuration unavailable');
 z.string().uuid().parse(attempt.claimId);
 if(Date.now()>=attempt.expiresAt)throw Error('Quote expired');
 const permission=await getDelegation(attempt.wallet,attempt.walletId);
 if(!permission.configured||!permission.authorized)throw Error('Delegated access is not active');
 const sponsor=await verifySponsor();
 const signers=transactionSigners(attempt.unsignedTransaction,attempt.wallet);
 if(!attempt.sponsor||attempt.sponsor.address!==sponsor.address||attempt.sponsor.walletId!==sponsor.walletId||signers.length!==2||signers[0]!==sponsor.address)throw Error('Sponsor transaction mismatch');
 async function request(walletId:string,authKey:string,suffix:string){
  if(Date.now()>=attempt.expiresAt)throw Error('Quote expired');
  const url=`https://api.privy.io/v1/wallets/${encodeURIComponent(walletId)}/rpc`;
  const body={method:'signTransaction',params:{transaction:attempt.unsignedTransaction,encoding:'base64'}};
  const headers={'privy-app-id':id!,'privy-idempotency-key':attempt.claimId+suffix,'privy-request-expiry':String(attempt.expiresAt)};
  const signature=authorizationSignature(authKey,url,body,headers);
  const response=await fetch(url,{method:'POST',headers:{...headers,'privy-authorization-signature':signature,Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw Error('Privy signing request was not confirmed');
  return z.object({method:z.literal('signTransaction'),data:z.object({signed_transaction:z.string().max(1644),encoding:z.literal('base64')})}).parse(await response.json()).data.signed_transaction;
 }
 const userSigned=await request(attempt.walletId,key,':user');
 verifyPartialSignature(attempt.unsignedTransaction,userSigned,attempt.wallet,attempt.transactionHash,attempt.wallet);
 if(!(await getDelegation(attempt.wallet,attempt.walletId)).authorized)throw Error('Delegated access changed');
 const sponsorSigned=await request(sponsor.walletId,sponsor.key,':sponsor');
 return combineSponsoredSignatures(attempt.unsignedTransaction,userSigned,sponsorSigned,attempt.wallet,sponsor.address,attempt.transactionHash);
}
