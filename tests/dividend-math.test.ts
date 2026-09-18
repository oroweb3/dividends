import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDividend, verifyRemainingExposure, type DividendInput } from '../src/lib/dividends/calculate-dividend';
const example: DividendInput = {rawBalance:1_000_000_000n,decimals:8,oldMultiplier:'1',newMultiplier:'1.002'};

test('10 tokens: sell dividend only, leaving less than one base unit of dividend dust',()=>{
  const r=calculateDividend(example);
  assert.equal(r.previousExposure,'10');
  assert.equal(r.newExposure,'10.02');
  assert.equal(r.dividendExposure,'0.02');
  assert.equal(r.rawAmountToSell,1_996_007n);
  assert.equal(r.rawTokensToSell,'0.01996007');
  assert.equal(r.remainingRawBalance,998_003_993n);
  assert.equal(r.remainingExposure,'10.00000000986');
  assert.equal(r.convertedExposure,'0.01999999014');
  assert.equal(r.retainedDividendExposure,'0.00000000986');
  assert.equal(r.oneBaseUnitExposure,'0.00000001002');
  assert.equal(r.status,'calculable');
  assert.equal(verifyRemainingExposure(example,r.remainingRawBalance).withinRoundingBound,true);
});
test('one extra raw unit sold would reduce original exposure',()=>{
  const r=calculateDividend(example);
  const result=verifyRemainingExposure(example,r.remainingRawBalance-1n);
  assert.equal(result.preserved,false);
  assert.equal(result.shortfallExposure,'0.00000000016');
});
test('already accumulated multiplier and differing precision',()=>{
  const r=calculateDividend({rawBalance:1000n,decimals:2,oldMultiplier:'1.20',newMultiplier:'1.2500'});
  assert.equal(r.previousExposure,'12');assert.equal(r.newExposure,'12.5');
  assert.equal(r.dividendExposure,'0.5');assert.equal(r.rawAmountToSell,40n);
  assert.equal(r.remainingExposure,'12');assert.equal(r.retainedDividendExposure,'0');
});
test('zero balance, unchanged multiplier and tiny dividend never request a sale',()=>{
  assert.equal(calculateDividend({...example,rawBalance:0n}).status,'no-dividend');
  assert.equal(calculateDividend({...example,newMultiplier:'1.0000'}).status,'no-dividend');
  const dust=calculateDividend({...example,rawBalance:1n});
  assert.equal(dust.status,'below-one-base-unit');assert.equal(dust.rawAmountToSell,0n);
});
test('zero-decimal and high-decimal mints are supported without fixed token decimals',()=>{
  assert.equal(calculateDividend({rawBalance:10n,decimals:0,oldMultiplier:'1',newMultiplier:'2'}).rawAmountToSell,5n);
  const r=calculateDividend({...example,decimals:255});
  assert.equal(r.rawAmountToSell,1_996_007n);
  assert.ok(r.previousExposure.startsWith('0.'));
});
test('u64 maximum and multiplier changes below JS floating-point precision',()=>{
  const raw=(1n<<64n)-1n;
  const input={rawBalance:raw,decimals:8,oldMultiplier:'1',newMultiplier:'1.000000000000000001'};
  const r=calculateDividend(input);
  assert.equal(r.rawAmountToSell,18n);
  assert.equal(verifyRemainingExposure(input,r.remainingRawBalance).withinRoundingBound,true);
});
test('invalid balances, decimals and multipliers fail closed',()=>{
  for(const rawBalance of [-1n,1n<<64n,10 as unknown as bigint]) assert.throws(()=>calculateDividend({...example,rawBalance}));
  for(const decimals of [-1,1.5,256,NaN]) assert.throws(()=>calculateDividend({...example,decimals}));
  for(const value of ['0','-1','NaN','Infinity','1e-3','',' 1','1.','0x10','1'.repeat(129)]) {
    assert.throws(()=>calculateDividend({...example,oldMultiplier:value}));
    assert.throws(()=>calculateDividend({...example,newMultiplier:value}));
  }
  assert.throws(()=>calculateDividend({...example,newMultiplier:'0.999'}));
  assert.throws(()=>verifyRemainingExposure(example,-1n));
});
test('a deposit preserves principal but does not pass the tight rounding check',()=>{
  const r=calculateDividend(example);
  const v=verifyRemainingExposure(example,r.remainingRawBalance+100n);
  assert.equal(v.preserved,true);assert.equal(v.withinRoundingBound,false);
});
test('10,000 deterministic cases preserve principal and choose the maximum safe raw sale',()=>{
  let seed=123456789n;
  const rand=()=>{seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);return seed;};
  for(let i=0;i<10000;i++) {
    const raw=rand(), old=rand()%1000000n+1n, next=old+rand()%1000000n;
    const input={rawBalance:raw,decimals:i%19,oldMultiplier:old.toString(),newMultiplier:next.toString()};
    const r=calculateDividend(input);
    // Independent inequality check, without calling the production verifier.
    const remaining=r.remainingRawBalance*next, original=raw*old;
    assert.ok(r.rawAmountToSell>=0n&&r.rawAmountToSell<=raw);
    assert.equal(r.rawAmountToSell+r.remainingRawBalance,raw);
    assert.ok(remaining>=original);
    assert.ok(remaining-original<next);
    assert.ok((r.remainingRawBalance-1n)*next<original);
  }
});
