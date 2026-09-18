import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash,verify} from 'node:crypto';
import {address,blockhash,createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,compileTransaction,getTransactionEncoder,getBase58Decoder} from '@solana/kit';
import canonicalize from 'canonicalize';
import {authorizationSignature} from '../src/lib/privy/authorization-signature';
import {verifySignedTransaction} from '../src/lib/swaps/signed-transaction';
import {signAndSubmit,type ExecutionDependencies} from '../src/lib/swaps/executor';
function fixture(){
 const key=generateKeyPairSync('ed25519');const publicBytes=key.publicKey.export({type:'spki',format:'der'}).subarray(-32);const wallet=getBase58Decoder().decode(publicBytes);
 const tx=compileTransaction(setTransactionMessageLifetimeUsingBlockhash({blockhash:blockhash('11111111111111111111111111111111'),lastValidBlockHeight:100n},setTransactionMessageFeePayer(address(wallet),createTransactionMessage({version:0}))));
 const bytes=Buffer.from(getTransactionEncoder().encode(tx)),signed=Buffer.from(bytes);sign(null,bytes.subarray(65),key.privateKey).copy(signed,1);
 const attempt={claimId:'claim',wallet,walletId:'wallet-id',unsignedTransaction:bytes.toString('base64'),transactionHash:createHash('sha256').update(bytes).digest('hex'),expiresAt:10000,lastValidBlockHeight:100};
 return {attempt,signed:signed.toString('base64')};
}
test('accepts valid wallet signature only over the unchanged validated transaction',()=>{
 const f=fixture();const a=f.attempt;
 assert.ok(verifySignedTransaction(a.unsignedTransaction,f.signed,a.wallet,a.transactionHash).signature);
 const altered=Buffer.from(f.signed,'base64');altered[altered.length-1]^=1;
 assert.throws(()=>verifySignedTransaction(a.unsignedTransaction,altered.toString('base64'),a.wallet,a.transactionHash),/message changed/);
 const invalid=Buffer.from(f.signed,'base64');invalid[1]^=1;
 assert.throws(()=>verifySignedTransaction(a.unsignedTransaction,invalid.toString('base64'),a.wallet,a.transactionHash),/Invalid wallet signature/);
 assert.throws(()=>verifySignedTransaction(a.unsignedTransaction,f.signed,fixture().attempt.wallet,a.transactionHash),/signer/);
 assert.throws(()=>verifySignedTransaction(a.unsignedTransaction,f.signed,a.wallet,'bad'),/hash/);
});
function harness(mode='ok'){
 const f=fixture(),events:string[]=[];let authorized=0;
 const deps:ExecutionDependencies={now:()=>0,validate:async()=>{events.push('validate');},authorized:async()=>{events.push('permission');return mode!=='revoked'&&!(mode==='revoked-after-lock'&&++authorized===2);},beginSigning:async()=>{events.push('lock');return mode!=='duplicate';},sign:async()=>{events.push('sign');if(mode==='sign-timeout')throw Error();return f.signed;},recordSignature:async()=>{events.push('persist');if(mode==='db-failure')throw Error();},broadcast:async()=>{events.push('broadcast');if(mode==='rpc-timeout')throw Error();return verifySignedTransaction(f.attempt.unsignedTransaction,f.signed,f.attempt.wallet,f.attempt.transactionHash).signature;},advance:async(_,status)=>{events.push(status);}};
 return {...f,deps,events};
}
test('persists signature before broadcast, stops duplicates and revoked access',async()=>{
 const h=harness();assert.equal((await signAndSubmit(h.attempt,h.deps)).status,'submitted');assert.deepEqual(h.events,['validate','permission','lock','permission','sign','persist','permission','broadcast','submitted']);
 for(const mode of ['duplicate','revoked-after-lock','sign-timeout','db-failure']){const h=harness(mode);assert.equal((await signAndSubmit(h.attempt,h.deps)).status,'reconciliation-required');assert.ok(!h.events.includes('broadcast'));}
 const h2=harness('revoked');await assert.rejects(signAndSubmit(h2.attempt,h2.deps),/not active/);assert.ok(!h2.events.includes('lock'));
 const h3=harness('rpc-timeout');const result=await signAndSubmit(h3.attempt,h3.deps);assert.equal(result.status,'reconciliation-required');assert.ok(result.signature);assert.equal(h3.events.filter(e=>e==='sign').length,1);
});
test('Privy authorization signature binds request body, URL and headers',()=>{
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),key='wallet-auth:'+keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
 const url='https://api.privy.io/v1/wallets/test/rpc',body={method:'signTransaction',params:{transaction:'test',encoding:'base64'}},headers={'privy-app-id':'test','privy-idempotency-key':'claim','privy-request-expiry':'10000'};
 const signature=Buffer.from(authorizationSignature(key,url,body,headers),'base64');
 const payload=(b:object)=>Buffer.from(canonicalize({version:1,method:'POST',url,body:b,headers})!);
 assert.equal(verify('sha256',payload(body),keys.publicKey,signature),true);
 assert.equal(verify('sha256',payload({...body,method:'signMessage'}),keys.publicKey,signature),false);
});

test('connected conversion reserves, journals, signs and submits once; retry resumes existing claim',async()=>{
 const {conversionFlow}=await import('../src/lib/swaps/conversion-flow');
 const h=harness();let saved=false;const events:string[]=[];
 const ports={existing:async()=>saved?{status:'submitted' as const,signature:'known'}:null,prepare:async()=>{events.push('eligibility-and-simulation');return h.attempt;},reserve:async()=>{events.push('reserve');return h.attempt.claimId;},persist:async()=>{events.push('journal');saved=true;},execute:async()=>{events.push('execute');return signAndSubmit(h.attempt,h.deps);}};
 assert.equal((await conversionFlow(ports)).status,'submitted');
 assert.deepEqual(events,['eligibility-and-simulation','reserve','journal','execute']);
 const count=h.events.length;assert.equal((await conversionFlow(ports)).status,'submitted');assert.equal(h.events.length,count);
});
test('connected conversion never signs when eligibility, reservation or journal fails',async()=>{
 const {conversionFlow}=await import('../src/lib/swaps/conversion-flow');
 for(const failure of ['prepare','reserve','persist']){
  const events:string[]=[];const step=async(name:string)=>{events.push(name);if(name===failure)throw Error('blocked');};
  await assert.rejects(conversionFlow({existing:async()=>null,prepare:async()=>{await step('prepare');return 1;},reserve:async()=>{await step('reserve');return 'claim';},persist:async()=>step('persist'),execute:async()=>{await step('execute');return {status:'submitted'};}}));
  assert.ok(!events.includes('execute'));
 }
});

test('sponsor and user signatures bind the same message; first sponsor signature is transaction ID',async()=>{
 const {appendTransactionMessageInstructions}=await import('@solana/kit');
 const {combineSponsoredSignatures,transactionSigners}=await import('../src/lib/swaps/signed-transaction');
 const pair=()=>{const keys=generateKeyPairSync('ed25519');return {keys,address:getBase58Decoder().decode(keys.publicKey.export({type:'spki',format:'der'}).subarray(-32))};};
 const user=pair(),sponsor=pair();
 const msg=appendTransactionMessageInstructions([{programAddress:address('11111111111111111111111111111111'),accounts:[{address:address(user.address),role:3}],data:new Uint8Array()}],setTransactionMessageLifetimeUsingBlockhash({blockhash:blockhash('11111111111111111111111111111111'),lastValidBlockHeight:100n},setTransactionMessageFeePayer(address(sponsor.address),createTransactionMessage({version:0}))));
 const bytes=Buffer.from(getTransactionEncoder().encode(compileTransaction(msg))),unsigned=bytes.toString('base64'),hash=createHash('sha256').update(bytes).digest('hex');
 const signers=transactionSigners(unsigned,user.address);assert.equal(signers[0],sponsor.address);
 const partial=(who:typeof user)=>{const out=Buffer.from(bytes);sign(null,bytes.subarray(129),who.keys.privateKey).copy(out,1+signers.indexOf(who.address)*64);return out.toString('base64');};
 const signed=combineSponsoredSignatures(unsigned,partial(user),partial(sponsor),user.address,sponsor.address,hash);
 const verified=verifySignedTransaction(unsigned,signed,user.address,hash);
 assert.equal(verified.signature,getBase58Decoder().decode(Buffer.from(signed,'base64').subarray(1,65)));
 assert.throws(()=>verifySignedTransaction(unsigned,partial(user),user.address,hash),/signature/);
 assert.throws(()=>combineSponsoredSignatures(unsigned,partial(user),partial(user),user.address,sponsor.address,hash),/signature/);
 assert.throws(()=>combineSponsoredSignatures(unsigned,partial(user),partial(sponsor),user.address,pair().address,hash),/signer|sponsor/);
 const altered=Buffer.from(partial(sponsor),'base64');altered[altered.length-1]^=1;
 assert.throws(()=>combineSponsoredSignatures(unsigned,partial(user),altered.toString('base64'),user.address,sponsor.address,hash),/message changed/);
});
