import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forwardCheckpoint} from '../src/lib/dividends/checkpoint';
import {baselineBlocker} from '../src/lib/dividends/eligibility';
const previous={id:'old',user_id:'user',wallet_address:'wallet',stock_mint:'mint',raw_balance:'1000',active_multiplier:'1',decimals:8,balance_slot:10,mint_slot:11,chain_timestamp:100,observed_at:new Date(100000).toISOString(),token_accounts:[{address:'account',rawBaseUnits:'1000'}]};
const current={rawBaseUnits:'900',decimals:8,balanceSlot:20,mintSlot:21,chainTime:200,multiplier:{active:'1.1'},tokenAccounts:[{address:'account',rawBaseUnits:'900'}]};
test('explicit checkpoint preserves identity, excludes earlier dividends, and does not mutate history',()=>{
 const next=forwardCheckpoint(previous,current,200000);
 assert.equal(previous.raw_balance,'1000');assert.equal(next.raw_balance,'900');assert.notEqual(next.id,previous.id);
 assert.equal(next.user_id,previous.user_id);assert.equal(next.wallet_address,previous.wallet_address);
 assert.notEqual(baselineBlocker(next,199,'1.1'),null);assert.notEqual(baselineBlocker(next,200,'1.1'),null);assert.equal(baselineBlocker(next,201,'1.1'),null);
});
test('checkpoint rejects older reads, precision changes, zero holdings and inconsistent accounts',()=>{
 for(const change of [{balanceSlot:11},{mintSlot:19},{chainTime:99},{decimals:9},{rawBaseUnits:'0'},{tokenAccounts:[{address:'account',rawBaseUnits:'899'}]},{tokenAccounts:[{address:'account',rawBaseUnits:'450'},{address:'account',rawBaseUnits:'450'}]}])assert.throws(()=>forwardCheckpoint(previous,{...current,...change},200000));
 assert.throws(()=>forwardCheckpoint(previous,current,99000));
});
