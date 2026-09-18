import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baselineBlocker,compareHoldings,enrollmentBlocker,type Snapshot} from '../src/lib/dividends/eligibility';
const snapshot:Snapshot={id:'s',user_id:'u',wallet_address:'w',stock_mint:'m',raw_balance:'9007199254740993',active_multiplier:'1',decimals:8,balance_slot:100,mint_slot:101,chain_timestamp:1000,observed_at:'1970-01-01T00:16:40Z',token_accounts:[{address:'a',rawBaseUnits:'9007199254740993'}]};
test('missing and post-event checkpoints cannot justify historical holdings',()=>{
 assert.ok(baselineBlocker(null,2000,'1'));
 assert.ok(baselineBlocker(snapshot,1000,'1'));
 assert.ok(baselineBlocker({...snapshot,observed_at:'1970-01-01T01:00:00Z'},2000,'1'));
 assert.ok(baselineBlocker({...snapshot,raw_balance:'0'},2000,'1'));
 assert.equal(baselineBlocker(snapshot,2000,'1.000'),null);
});
test('pre-dividend multiplier mismatch blocks baseline',()=>{
 assert.ok(baselineBlocker(snapshot,2000,'1.002'));
});
test('deposits and withdrawals are detected without floating point loss',()=>{
 for(const raw of ['9007199254740992','9007199254740994'])assert.equal(compareHoldings(snapshot,{rawBaseUnits:raw,decimals:8,tokenAccounts:snapshot.token_accounts}),'balance-changed');
});
test('equal totals with replaced token accounts are still changed',()=>{
 assert.equal(compareHoldings(snapshot,{rawBaseUnits:snapshot.raw_balance,decimals:8,tokenAccounts:[{address:'b',rawBaseUnits:snapshot.raw_balance}]}),'token-accounts-changed');
 assert.equal(compareHoldings(snapshot,{rawBaseUnits:snapshot.raw_balance,decimals:8,tokenAccounts:snapshot.token_accounts}),'unchanged');
});

test('enrollment must strictly precede the dividend; invalid dates fail closed',()=>{
 const event='2026-09-10T00:30:00Z';
 assert.equal(enrollmentBlocker('2026-09-01T00:00:00Z',event),null);
 for(const enabled of [null,event,'2026-09-11T00:00:00Z','invalid'])assert.ok(enrollmentBlocker(enabled,event));
 assert.ok(enrollmentBlocker('2026-09-01T00:00:00Z','invalid'));
});
