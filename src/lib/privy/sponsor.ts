import 'server-only';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {z} from 'zod';
import {assertDelegationPolicy} from './delegation-policy';
/** Read configuration only; no fallback to charging users when sponsorship is configured incorrectly. */
export function sponsorConfig(){
 const address=process.env.PRIVY_SPONSOR_WALLET_ADDRESS?.trim(),walletId=process.env.PRIVY_SPONSOR_WALLET_ID?.trim(),ownerId=process.env.PRIVY_SPONSOR_OWNER_ID?.trim(),policyId=process.env.PRIVY_SPONSOR_POLICY_ID?.trim(),key=process.env.PRIVY_SPONSOR_AUTHORIZATION_PRIVATE_KEY?.trim();
 if(!address||!walletId||!ownerId||!policyId||!key)throw Error('Sponsor configuration unavailable');
 return {address,walletId,ownerId,policyId,key};
}
export async function verifySponsor(){
 const config=sponsorConfig(),app=process.env.NEXT_PUBLIC_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET;
 if(!app||!secret||config.ownerId===process.env.PRIVY_SIGNER_ID)throw Error('Sponsor configuration invalid');
 const key=createPrivateKey(config.key.includes('BEGIN')?config.key:{key:Buffer.from(config.key.replace(/^wallet-auth:/,''),'base64'),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Sponsor key invalid');
 const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');
 async function get(path:string){
  const r=await fetch('https://api.privy.io/v1/'+path,{headers:{'privy-app-id':app!,Authorization:'Basic '+Buffer.from(app+':'+secret).toString('base64')},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Sponsor verification unavailable');return r.json();
 }
 const [wallet,quorum,policy]=await Promise.all([get('wallets/'+encodeURIComponent(config.walletId)),get('key_quorums/'+encodeURIComponent(config.ownerId)),get('policies/'+encodeURIComponent(config.policyId))]);
 z.object({id:z.literal(config.walletId),address:z.literal(config.address),chain_type:z.literal('solana'),owner_id:z.literal(config.ownerId),policy_ids:z.tuple([z.literal(config.policyId)]),additional_signers:z.array(z.unknown()).length(0),archived_at:z.null(),exported_at:z.null(),imported_at:z.null()}).parse(wallet);
 z.object({id:z.literal(config.ownerId),authorization_threshold:z.literal(1),authorization_keys:z.array(z.object({public_key:z.string().refine(k=>k.replace(/\s/g,'')===publicKey)})).length(1),user_ids:z.array(z.unknown()).length(0).optional(),key_quorum_ids:z.array(z.unknown()).length(0).optional()}).parse(quorum);
 assertDelegationPolicy(policy,config.policyId);
 return config;
}
