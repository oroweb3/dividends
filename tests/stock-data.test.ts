import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividendEvents } from '../src/lib/xstocks/corporate-actions';
import { eventObservation, selectMultiplier } from '../src/lib/xstocks/multipliers';
import { formatUnits, scaledBalance } from '../src/lib/solana/amounts';
import type { CorporateAction } from '../src/lib/xstocks/schemas';
const event: CorporateAction={eventId:'dividend-1',version:1,xstockSymbol:'AAPLx',caType:'CashDividend',effectiveTimeUtc:'2026-09-17T00:00:00.000Z',multiplierOld:'1',multiplierNew:'1.002',status:'Initial',createdTimeUtc:'2026-09-16T00:00:00.000Z'};
test('cancelled latest version suppresses original dividend independent of ordering',()=>{
 const cancelled={...event,version:2,status:'Cancelled' as const};
 for(const input of [[event,cancelled],[cancelled,event]])assert.deepEqual(dividendEvents(input,'AAPLx'),[]);
});
test('split corrections, unknown types and other symbols are not cash dividends',()=>{
 assert.deepEqual(dividendEvents([event,{...event,version:2,caType:'ForwardSplit'},{...event,eventId:'other',xstockSymbol:'SPYx'},{...event,eventId:'unknown',caType:'Unknown'}],'AAPLx'),[]);
});
test('latest correction deduplicates history and upcoming records',()=>{
 const corrected={...event,version:2,status:'Corrected' as const,multiplierNew:'1.003'};
 assert.deepEqual(dividendEvents([event,corrected,corrected],'AAPLx'),[corrected]);
});
test('activation boundary uses chain time; stale announcements are not proof',()=>{
 const time=Date.parse(event.effectiveTimeUtc!)/1000;
 const before=selectMultiplier('1','1.002',time,time-1);
 assert.equal(before.active,'1');assert.equal(eventObservation(event,before,time-1),'scheduled-onchain');
 const after=selectMultiplier('1','1.002',time,time);
 assert.equal(after.active,'1.002');assert.equal(eventObservation(event,after,time),'activation-observed');
 assert.equal(eventObservation({...event,multiplierNew:null},after,time),'awaiting-issuer-details');
 assert.equal(eventObservation(event,{...after,effectiveTimestamp:time+1},time),'not-matched-to-current-mint');
 assert.equal(eventObservation({...event,caType:'ForwardSplit'},after,time),'excluded');
});
test('integer balances above Number.MAX_SAFE_INTEGER retain precision',()=>{
 assert.equal(formatUnits(9007199254740993n,8),'90071992.54740993');
 assert.equal(scaledBalance(9007199254740993n,8,'1.002'),'90252136.53250474986');
 assert.equal(scaledBalance(1000000000n,8,'1.002'),'10.02');
 assert.equal(formatUnits(100n,0),'100');assert.equal(formatUnits(0n,8),'0');
 assert.throws(()=>scaledBalance(10n,8,'NaN'));
});
