import 'server-only';
import { assertDelegationPolicy,inspectDelegation } from './delegation-policy';
async function getPrivy(path:string){
 const id=process.env.NEXT_PUBLIC_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET;
 if(!id||!secret)throw new Error('Delegation configuration missing');
 const response=await fetch(`https://api.privy.io/v1/${path}`,{headers:{'privy-app-id':id,Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Delegation verification unavailable');
 return response.json();
}
export async function getDelegation(wallet:string,walletId?:string){
 const signerId=process.env.PRIVY_SIGNER_ID?.trim(),policyId=process.env.PRIVY_SIGNER_POLICY_ID?.trim();
 if(!walletId||!signerId||!policyId||!process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim())return {wallet,configured:false,authorized:false,hasSigners:false,canAuthorize:false,executionEnabled:false};
 const [policy,record]=await Promise.all([getPrivy(`policies/${encodeURIComponent(policyId)}`),getPrivy(`wallets/${encodeURIComponent(walletId)}`)]);
 const state=inspectDelegation(record,walletId,wallet,signerId,policyId);
 // Policy drift disables new authorization. Keep revocation available.
 try{assertDelegationPolicy(policy,policyId);}catch{return {wallet,configured:false,...state,authorized:false,canAuthorize:false,executionEnabled:false};}
 return {wallet,configured:true,...state,signerId,policyId,executionEnabled:process.env.DIVIDEND_EXECUTION_ENABLED==='true'};
}
