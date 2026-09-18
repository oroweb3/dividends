import {test} from 'node:test';
import assert from 'node:assert/strict';
import {address,getBase58Encoder,getProgramDerivedAddress} from '@solana/kit';
import {findAssociatedTokenPda} from '@solana-program/token';
import {simulateTitanSwapWithRpc,type SimulationRpc} from '../src/lib/titan/simulate-core';
import {TITAN_PROGRAM} from '../src/lib/titan/instructions';
const wallet='8SHVp4G9Y6fHn9cXZ7Sf5NMfks3XkrgBXaiyRJjQjfBF';
const inputMint='Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const outputMint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const source='5C55kZcHLvB1rDopr4WFcr8opZqXHCYk9u7qym7Guc3J';
const inputProgram='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const outputProgram='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const system='11111111111111111111111111111111';
const enc=(s:string)=>new Uint8Array(getBase58Encoder().encode(s));
function account(owner:string,lamports:number,data=Buffer.alloc(0)){return {owner,lamports,executable:false,data:[data.toString('base64'),'base64']};}
function token(mint:string,program:string,amount:bigint){const b=Buffer.alloc(165);b.set(enc(mint));b.set(enc(wallet),32);b.writeBigUInt64LE(amount,64);b[108]=1;return account(program,2039280,b);}
async function fixture(mode='good'){
 const [destination]=await findAssociatedTokenPda({owner:address(wallet),mint:address(outputMint),tokenProgram:address(outputProgram)});
 const [atlas]=await getProgramDerivedAddress({programAddress:address(TITAN_PROGRAM),seeds:[Buffer.from('atlas')]});
 // Synthetic route header: tests orchestration, not real venue execution.
 const d=Buffer.alloc(33);d.set([249,91,84,33,69,22,0,135]);d.writeBigUInt64LE(100n,8);d.writeBigUInt64LE(200n,16);d.writeUInt32LE(1,29);
 const route={instructions:[{p:enc(TITAN_PROGRAM),a:[wallet,atlas,inputMint,source,destination,inputProgram,outputProgram].map(()=>({p:enc(system),s:false,w:false})),d}],addressLookupTables:[]};
 route.instructions[0].a=[wallet,atlas,inputMint,source,outputMint,destination,inputProgram,outputProgram].map((p,i)=>({p:enc(p),s:i===0,w:[0,3,5].includes(i)}));
 const calls:string[]=[];
 const rpc:SimulationRpc=async(method,params)=>{
  calls.push(method);
  if(method==='getMultipleAccounts'&&(params[1] as {encoding:string}).encoding==='jsonParsed')return {value:[inputProgram,outputProgram].map(owner=>({owner,data:{parsed:{type:'mint',info:{isInitialized:true}}}}))};
  if(method==='getMultipleAccounts')return {context:{slot:100},value:mode==='missing'?[]:[account(system,10000000),token(inputMint,inputProgram,mode==='changed'?999n:1000n),token(outputMint,outputProgram,10n)]};
  if(method==='getLatestBlockhash')return {value:{blockhash:system,lastValidBlockHeight:1000}};
  if(method==='getFeeForMessage')return {value:mode==='fee'?100001:5000};
  if(method==='simulateTransaction'){
   assert.equal(typeof params[0],'string');assert.ok(Buffer.from(params[0] as string,'base64').length<=1232);
   const config=params[1] as {sigVerify:boolean;replaceRecentBlockhash:boolean;minContextSlot:number};
   assert.equal(config.sigVerify,false);assert.equal(config.replaceRecentBlockhash,false);assert.equal(config.minContextSlot,100);
   return {context:{slot:mode==='old'?99:101},value:{err:mode==='failed'?{InstructionError:[0,'Custom']}:null,unitsConsumed:100000,accounts:mode==='noAfter'?null:[account(system,mode==='sol'?9994999:9995000),token(inputMint,inputProgram,mode==='debit'?899n:900n),token(outputMint,outputProgram,mode==='output'?209n:210n)]}};
  }
  throw new Error(`Unexpected RPC ${method}`);
 };
 return {rpc,calls,args:{route,wallet,inputMint,outputMint,amount:'100',minimum:'200',sourceAccounts:[{address:source,rawBaseUnits:'1000'}],expiresAt:Date.now()+60000}};
}
test('full unsigned pipeline compiles and checks mocked RPC account effects',async()=>{
 const f=await fixture();const result=await simulateTitanSwapWithRpc(f.rpc,f.args);
 assert.equal(result.status,'passed');assert.equal(result.unsigned,true);assert.equal(result.inputDebited,'100');assert.equal(result.goldReceived,'200');assert.equal(result.networkFeeLamports,5000);assert.match(result.transactionHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(f.calls,['getMultipleAccounts','getMultipleAccounts','getLatestBlockhash','getFeeForMessage','simulateTransaction']);
});
test('full pipeline fails closed on missing, stale, changed or unsafe evidence',async()=>{
 for(const [mode,message] of [['missing',/Account evidence missing/],['changed',/Stock balance changed/],['fee',/Network fee/],['failed',/Unsigned simulation failed/],['noAfter',/evidence missing/],['old',/predates/],['debit',/debit or GOLD/],['output',/debit or GOLD/],['sol',/SOL/]] as const){const f=await fixture(mode);await assert.rejects(simulateTitanSwapWithRpc(f.rpc,f.args),message,mode);}
});
test('expired route never reaches simulation',async()=>{
 const f=await fixture();f.args.expiresAt=Date.now()-1;await assert.rejects(simulateTitanSwapWithRpc(f.rpc,f.args),/expired/);assert.ok(!f.calls.includes('simulateTransaction'));
});

test('execution preparation pins lifetime and keeps revalidated transaction bytes identical',async()=>{
 const {prepareTitanSwapWithRpc}=await import('../src/lib/titan/simulate-core');
 const first=await fixture();const prepared=await prepareTitanSwapWithRpc(first.rpc,first.args);
 const second=await fixture();const rechecked=await prepareTitanSwapWithRpc(second.rpc,{...second.args,lifetime:prepared.lifetime});
 assert.equal(rechecked.unsignedTransaction,prepared.unsignedTransaction);
 assert.equal(rechecked.simulation.transactionHash,prepared.simulation.transactionHash);
 assert.ok(!second.calls.includes('getLatestBlockhash'));
 const summary=await simulateTitanSwapWithRpc(first.rpc,first.args);
 assert.ok(!('unsignedTransaction' in summary));
});

test('sponsored simulation allows zero user SOL, rewrites only ATA payer and pins two signers',async()=>{
 const {prepareTitanSwapWithRpc}=await import('../src/lib/titan/simulate-core');
 const {getTransactionDecoder,getCompiledTransactionMessageDecoder}=await import('@solana/kit');
 const sponsor='hB916ZpXpJQ2aECXCA5M3xqNnUMHCcLeKfpa5pEquXP';
 const f=await fixture(),destination=await findAssociatedTokenPda({owner:address(wallet),mint:address(outputMint),tokenProgram:address(outputProgram)});
 f.args.route.instructions.unshift({p:enc('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),a:[wallet,destination[0],wallet,outputMint,system,outputProgram].map((p,i)=>({p:enc(p),s:i===0,w:i<2})),d:Buffer.from([1])});
 async function run(mode='good'){
 const rpc:SimulationRpc=async(method,params)=>{
  if(method==='getMultipleAccounts'&&(params[1] as {encoding:string}).encoding==='base64')return {context:{slot:100},value:[null,token(inputMint,inputProgram,1000n),null,mode==='unfunded'?null:account(system,10000000)]};
  if(method==='getFeeForMessage')return {value:10000};
  if(method==='simulateTransaction'){
   const tx=getTransactionDecoder().decode(Buffer.from(params[0] as string,'base64'));
   assert.equal(Object.keys(tx.signatures).length,2);assert.equal(Object.keys(tx.signatures)[0],sponsor);
   const message=getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
   if(message.version!==0)throw Error('Expected v0');
   assert.equal(message.staticAccounts[message.instructions[1].accountIndices![0]],sponsor);
   assert.equal(message.staticAccounts[message.instructions[2].accountIndices![0]],wallet);
   return {context:{slot:101},value:{err:null,accounts:[mode==='user-debit'?account(system,1):null,token(inputMint,inputProgram,900n),token(outputMint,outputProgram,200n),account(system,10000000-10000-2039280-(mode==='extra-debit'?1:0))]}};
  }
  return f.rpc(method,params);
 };
 return prepareTitanSwapWithRpc(rpc,{...f.args,sponsor});
 }
 const result=await run();assert.equal(result.simulation.sponsored,true);assert.equal(result.simulation.rentLamports,2039280);
 for(const mode of ['unfunded','user-debit','extra-debit'])await assert.rejects(run(mode));
 f.args.route.instructions[1].a.push({p:enc(sponsor),s:false,w:true});
 await assert.rejects(run(),/Sponsor must not/);
});
