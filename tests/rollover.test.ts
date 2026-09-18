import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rolloverCheckpoint} from '../src/lib/dividends/rollover-proof';
import {baselineBlocker} from '../src/lib/dividends/eligibility';
const baseline={id:'old',user_id:'user',wallet_address:'wallet',stock_mint:'stock',raw_balance:'1000',active_multiplier:'1',decimals:6,balance_slot:10,mint_slot:11,chain_timestamp:100,observed_at:new Date(100000).toISOString(),token_accounts:[{address:'account',rawBaseUnits:'1000'}]};
const token=(amount:string)=>({accountIndex:0,mint:'stock',owner:'wallet',uiTokenAmount:{amount,decimals:6}});
const tx={slot:20,blockTime:200,transaction:['bytes','base64'] as [string,'base64'],meta:{err:null,preTokenBalances:[token('1000')],postTokenBalances:[token('900')]}};
const current={rawBaseUnits:'900',decimals:6,balanceSlot:21,mintSlot:22,chainTime:210,multiplier:{active:'1.1'},tokenAccounts:[{address:'account',rawBaseUnits:'900'}]};
test('confirmed debit establishes checkpoint usable for a later dividend',()=>{
 const next=rolloverCheckpoint(baseline,'1.1','100',tx,['account'],current,210000);
 assert.equal(next.raw_balance,'900');assert.notEqual(next.id,baseline.id);
 assert.equal(baselineBlocker(next,300,'1.1'),null);
 assert.notEqual(baselineBlocker(next,200,'1'),null);
 const again=rolloverCheckpoint(next,'1.2','75',{...tx,slot:30,blockTime:300,meta:{...tx.meta,preTokenBalances:[token('900')],postTokenBalances:[token('825')]}},['account'],{...current,rawBaseUnits:'825',balanceSlot:31,mintSlot:32,chainTime:310,multiplier:{active:'1.2'},tokenAccounts:[{address:'account',rawBaseUnits:'825'}]},310000);
 assert.equal(again.raw_balance,'825');assert.equal(baseline.raw_balance,'1000');
});
test('unrelated balance changes, same-slot observation and newer dividend prevent rollover',()=>{
 for(const change of [{rawBaseUnits:'901'},{rawBaseUnits:'899'},{balanceSlot:20},{multiplier:{active:'1.2'}},{tokenAccounts:[{address:'different',rawBaseUnits:'900'}]}])assert.throws(()=>rolloverCheckpoint(baseline,'1.1','100',tx,['account'],{...current,...change}));
});
test('wrong debit, missing owner evidence and changed pre-balance prevent rollover',()=>{
 assert.throws(()=>rolloverCheckpoint(baseline,'1.1','99',tx,['account'],current));
 for(const pre of [[token('1001')],[{...token('1000'),owner:'other'}],[]])assert.throws(()=>rolloverCheckpoint(baseline,'1.1','100',{...tx,meta:{...tx.meta,preTokenBalances:pre}},['account'],current));
});
