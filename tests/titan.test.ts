import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getBase58Encoder} from '@solana/kit';
import {exactUint,normalizeTitan} from '../src/lib/titan/normalize';
const mint='So11111111111111111111111111111111111111112';
const other='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const packet={inputMint:new Uint8Array(getBase58Encoder().encode(mint)),outputMint:new Uint8Array(getBase58Encoder().encode(other)),swapMode:'ExactIn',amount:9007199254740993n,quotes:{a:{inAmount:9007199254740993n,outAmount:1000n,slippageBps:50},b:{inAmount:9007199254740993n,outAmount:2000n,slippageBps:50}}};
test('Titan preserves large integer amounts and selects the best valid route',()=>{
 const result=normalizeTitan(packet,mint,other,'9007199254740993',1000,100);
 assert.equal(result.outAmount,'2000');assert.equal(result.otherAmountThreshold,'1990');
 assert.equal(exactUint(9007199254740993n),9007199254740993n);
 assert.throws(()=>exactUint(Number.MAX_SAFE_INTEGER+1));
});
test('Titan rejects changed amounts, mode, expired routes and unknown fees',()=>{
 assert.throws(()=>normalizeTitan({...packet,swapMode:'ExactOut'},mint,other,'9007199254740993',1000,100));
 assert.throws(()=>normalizeTitan(packet,mint,other,'1',1000,100));
 for(const patch of [{expiresAtMs:999n},{expiresAfterSlot:100n},{inAmount:1n},{outAmount:Number.MAX_SAFE_INTEGER+1},{platformFee:{amount:1n,feeBps:1}},{slippageBps:100},{outAmount:1n}])assert.throws(()=>normalizeTitan({...packet,quotes:{a:{...packet.quotes.a,...patch}}},mint,other,'9007199254740993',1000,100));
});
