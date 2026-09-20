import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDisplayQuotes} from '../src/lib/prices/tokens-data';
const now=Date.parse('2026-09-21T10:00:00Z');
const row={mint:'mint',chain:'solana',market:{mint:'mint',price:221.1,source:'birdeye',lastFetchedAt:now-1000,lastTradeAt:(now-2000)/1000}};
test('accepts exact mint quote and mixed timestamp units without changing the price',()=>{
 const q=parseDisplayQuotes({variants:[row]},['mint'],now).mint;
 assert.equal(q.price,221.1);assert.equal(q.status,'available');assert.equal(q.unitBasis,'unverified');assert.equal(q.lastTradeAt,'2026-09-21T09:59:58.000Z');
});
test('recent fetch does not make old, absent or future trade timestamps fresh',()=>{
 for(const lastTradeAt of [now-3600000,undefined,now+3600000])assert.equal(parseDisplayQuotes({variants:[{...row,market:{...row.market,lastTradeAt}}]},['mint'],now).mint.status,'stale');
});
test('rejects wrong mint, chain, duplicate, advisory, invalid price and partial response safely',()=>{
 for(const variants of [[{...row,market:{...row.market,mint:'other'}}],[{...row,chain:'ethereum'}],[row,row],[{...row,advisory:{status:'blocked'}}],[{...row,market:{...row.market,price:0}}],[]])assert.equal(parseDisplayQuotes({variants},['mint'],now).mint.price,null);
 assert.equal(parseDisplayQuotes({variants:[row]},['other'],now).other.price,null);
 assert.equal(parseDisplayQuotes({},['mint'],now).mint.price,null);
});
