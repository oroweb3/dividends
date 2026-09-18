/* eslint-disable @typescript-eslint/no-require-imports -- Standalone provisioning utility. */
// Provision only: never signs, broadcasts, funds wallets, or enables execution.
const fs=require('node:fs');
const {createPrivateKey,createPublicKey,randomUUID}=require('node:crypto');
const expected=require('../config/privy-dividend-policy.json');
function save(name,value){
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid returned identifier');
 const env=fs.readFileSync('.env','utf8'),pattern=new RegExp('^'+name+'=.*$','m');
 fs.writeFileSync('.env',pattern.test(env)?env.replace(pattern,name+'='+value):env+'\n'+name+'='+value+'\n');
 process.env[name]=value;
}
function publicKey(raw){
 if(!raw)throw Error('Missing sponsor authorization key');
 const key=createPrivateKey(raw.includes('BEGIN')?raw:{key:Buffer.from(raw.replace(/^wallet-auth:/,''),'base64'),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Expected P-256 authorization key');
 return createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');
}
async function main(){
 const app=process.env.NEXT_PUBLIC_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET,owner=process.env.PRIVY_SPONSOR_OWNER_ID?.trim(),policy=(process.env.PRIVY_SPONSOR_POLICY_ID||process.env.PRIVY_SIGNER_POLICY_ID)?.trim();
 if(!app||!secret||!owner||!policy)throw Error('Missing sponsor owner or app/policy configuration');
 const pub=publicKey(process.env.PRIVY_SPONSOR_AUTHORIZATION_PRIVATE_KEY?.trim());
 if(owner===process.env.PRIVY_SIGNER_ID||pub===publicKey(process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim()))throw Error('Sponsor must use a separate authorization key');
 async function api(path,body){
  const response=await fetch('https://api.privy.io/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(app+':'+secret).toString('base64'),'privy-app-id':app,'Content-Type':'application/json',...(body?{'privy-idempotency-key':process.env.PRIVY_SPONSOR_CREATE_REQUEST_ID}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Privy request failed: HTTP '+response.status);
  return response.json();
 }
 const quorum=await api('key_quorums/'+encodeURIComponent(owner));
 if(quorum.id!==owner||quorum.authorization_threshold!==1||quorum.authorization_keys?.length!==1||quorum.user_ids?.length||quorum.key_quorum_ids?.length||quorum.authorization_keys[0].public_key.replace(/\s/g,'')!==pub)throw Error('Sponsor owner does not match the dedicated key');
 const p=await api('policies/'+encodeURIComponent(policy));
 const rule=p.rules?.[0],wanted=expected.rules[0];
 if(p.chain_type!=='solana'||p.version!=='1.0'||p.rules?.length!==1||rule.method!==wanted.method||rule.action!==wanted.action||JSON.stringify(rule.conditions)!==JSON.stringify(wanted.conditions))throw Error('Configured policy restrictions do not match');
 save('PRIVY_SPONSOR_OWNER_ID',owner);
 console.log('Separate sponsor key, owner and signing policy verified.');
 let id=process.env.PRIVY_SPONSOR_WALLET_ID?.trim();
 if(!id){
  if(!process.argv.includes('--create')){console.log('No sponsor wallet configured. Use --create to provision.');return;}
  if(!process.env.PRIVY_SPONSOR_CREATE_REQUEST_ID)save('PRIVY_SPONSOR_CREATE_REQUEST_ID',randomUUID());
  const created=await api('wallets',{chain_type:'solana',display_name:'Oro Gas Sponsor',external_id:'oro-gas-sponsor-'+process.env.PRIVY_SPONSOR_CREATE_REQUEST_ID,owner_id:owner,policy_ids:[policy]});
  save('PRIVY_SPONSOR_WALLET_ID',created.id);id=created.id;
 }
 const wallet=await api('wallets/'+encodeURIComponent(id));
 if(wallet.id!==id||wallet.chain_type!=='solana'||wallet.owner_id!==owner||wallet.policy_ids?.length!==1||wallet.policy_ids[0]!==policy||wallet.additional_signers?.length||wallet.exported_at||wallet.imported_at||wallet.archived_at||! /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.address))throw Error('Sponsor wallet read-back failed');
 save('PRIVY_SPONSOR_WALLET_ADDRESS',wallet.address);save('PRIVY_SPONSOR_POLICY_ID',policy);
 console.log('Sponsor wallet verified and configuration saved.');
 console.log('Solana address: '+wallet.address);
 console.log('Provisioning verification only; this command does not enable or execute conversions.');
}
main().catch(e=>{console.error(/^(Missing|Expected|Sponsor|Configured|Privy request|Invalid returned)/.test(e.message)?e.message:'Sponsor setup failed; secret details omitted. Re-run verification before funding.');process.exitCode=1;});
