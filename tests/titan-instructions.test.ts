import { verifySwapEffects } from '../src/lib/titan/effects';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getBase58Encoder} from '@solana/kit';
import {validateTitanInstructions,TITAN_PROGRAM,type SwapExpectation} from '../src/lib/titan/instructions';
const keys=['11111111111111111111111111111111','So11111111111111111111111111111111111111112','Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh','5C55kZcHLvB1rDopr4WFcr8opZqXHCYk9u7qym7Guc3J','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','8SHVp4G9Y6fHn9cXZ7Sf5NMfks3XkrgBXaiyRJjQjfBF','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'];
const e:SwapExpectation={wallet:keys[0],atlas:keys[1],inputMint:keys[2],source:keys[3],outputMint:keys[4],destination:keys[5],inputProgram:keys[6],outputProgram:keys[7],amount:100n,minimum:200n};
const enc=(s:string)=>new Uint8Array(getBase58Encoder().encode(s));
function fixture(){const data=Buffer.alloc(33);Buffer.from([249,91,84,33,69,22,0,135]).copy(data);data.writeBigUInt64LE(100n,8);data.writeBigUInt64LE(200n,16);data.writeUInt32LE(1,29);return {instructions:[{p:enc(TITAN_PROGRAM),a:keys.map((k,i)=>({p:enc(k),s:i===0,w:[0,3,5].includes(i)})),d:data}],addressLookupTables:[]};}
test('Titan V2 header validates exact debit and minimum encoded in bytes',()=>{
 assert.equal(validateTitanInstructions(fixture(),e).instructions.length,1);
 for(const [offset,value] of [[8,101n],[16,199n]] as const){const r=fixture();r.instructions[0].d.writeBigUInt64LE(value,offset);assert.throws(()=>validateTitanInstructions(r,e));}
});
test('rejects altered destinations, signers, discriminator, fees and appended instructions',()=>{
 const mutations=[(r:ReturnType<typeof fixture>)=>{r.instructions[0].a[5].p=enc(keys[1]);},(r:ReturnType<typeof fixture>)=>{r.instructions[0].a[1].s=true;},(r:ReturnType<typeof fixture>)=>{r.instructions[0].d[0]=0;},(r:ReturnType<typeof fixture>)=>{r.instructions[0].d.writeUInt16LE(5,25);},(r:ReturnType<typeof fixture>)=>{r.instructions[0].d.writeUInt16LE(5,27);},(r:ReturnType<typeof fixture>)=>{r.instructions.push({...r.instructions[0],p:enc(keys[7])});},(r:ReturnType<typeof fixture>)=>{r.instructions.push(r.instructions[0]);}];
 for(const mutate of mutations){const r=fixture();mutate(r);assert.throws(()=>validateTitanInstructions(r,e));}
});

test('simulated deltas require exact stock debit, net GOLD receipt and bounded SOL costs',()=>{
 const good={stockBefore:1000n,stockAfter:900n,input:100n,goldBefore:10n,goldAfter:210n,minimum:200n,solBefore:10000000n,solAfter:9995000n,fee:5000n,rent:0n};
 verifySwapEffects(good);
 for(const patch of [{stockAfter:899n},{stockAfter:901n},{goldAfter:209n},{solAfter:9994999n},{rent:10000001n},{fee:100001n},{minimum:0n}])assert.throws(()=>verifySwapEffects({...good,...patch}));
 verifySwapEffects({...good,rent:2000000n,solAfter:7995000n});
});
