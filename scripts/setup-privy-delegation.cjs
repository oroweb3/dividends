/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node CommonJS setup utility */
// Run with node --env-file=.env scripts/setup-privy-delegation.cjs [--create-policy].
// Never prints credentials, API bodies, or key material. Does not attach signers.
const fs=require('node:fs');
const {createPrivateKey,createPublicKey}=require('node:crypto');
const policy=require('../config/privy-dividend-policy.json');
async function main(){
 const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET,id=process.env.PRIVY_SIGNER_ID;
 if(!appId||!secret||!id)throw Error('Required configuration is missing');
 const raw=process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim();if(!raw)throw Error('Authorization key missing');
 let key;try{key=createPrivateKey(raw.includes('BEGIN')?raw:{key:Buffer.from(raw.replace(/^wallet-auth:/,''),'base64'),format:'der',type:'pkcs8'});}catch{throw Error('Authorization key format invalid');}
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Expected a P-256 authorization key');
 const pub=createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');
 async function api(path,body){
  const r=await fetch('https://api.privy.io/v1/'+path,{method:body?'POST':'GET',headers:{'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Privy request failed (HTTP '+r.status+')');return r.json();
 }
 const quorum=await api('key_quorums/'+encodeURIComponent(id));
 if(quorum.id!==id||quorum.authorization_threshold!==1||quorum.authorization_keys?.length!==1||quorum.user_ids?.length||quorum.key_quorum_ids?.length||quorum.authorization_keys[0].public_key.replace(/\s/g,'')!==pub)throw Error('Signer does not match the dedicated authorization key');
 console.log('Dedicated signer and authorization key verified.');
 if(process.env.PRIVY_SIGNER_POLICY_ID?.trim()){
  const checked=await api('policies/'+encodeURIComponent(process.env.PRIVY_SIGNER_POLICY_ID.trim()));
  const expected=policy.rules[0],actual=checked.rules?.[0];
  if(checked.chain_type!=='solana'||checked.version!=='1.0'||checked.rules?.length!==1||actual.method!==expected.method||actual.action!==expected.action||JSON.stringify(actual.conditions)!==JSON.stringify(expected.conditions))throw Error('Policy does not match the local restrictions');
  console.log('Configured policy verified against local restrictions.');
 }
 if(!process.argv.includes('--create-policy'))return;
 if(process.env.PRIVY_SIGNER_POLICY_ID?.trim()){console.log('Policy already configured; no new policy created.');return;}
 const made=await api('policies',policy);
 if(typeof made.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(made.id))throw Error('Policy created but returned ID invalid; inspect Privy before retrying');
 // Persist immediately so retries do not create duplicate policies.
 const env=fs.readFileSync('.env','utf8');const line='PRIVY_SIGNER_POLICY_ID='+made.id;
 fs.writeFileSync('.env',/^PRIVY_SIGNER_POLICY_ID=.*$/m.test(env)?env.replace(/^PRIVY_SIGNER_POLICY_ID=.*$/m,line):env+'\n'+line+'\n');
 const checked=await api('policies/'+encodeURIComponent(made.id));
 if(checked.chain_type!=='solana'||checked.rules?.length!==1||checked.rules[0].method!=='signTransaction')throw Error('Policy read-back failed; inspect policy before enabling delegation');
 console.log('Restricted policy created and ID saved locally. No wallet was delegated.');
}
main().catch(e=>{console.error(e instanceof Error&&/^(Required|Authorization|Expected|Privy request|Signer|Policy)/.test(e.message)?e.message:'Privy setup could not complete; no secret details logged.');process.exitCode=1;});
