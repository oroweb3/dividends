import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitoringFingerprint,monitoringObservation} from '../src/lib/dividends/monitor-state';
const input={baselineId:'baseline',event:{eventId:'event',version:1},upcoming:[],blockers:['past dividend','blocked'],history:{status:'no-activity-observed',reason:'complete'},current:{rawBaseUnits:'10',decimals:8,multiplier:{active:'1'},tokenAccounts:[{address:'b',rawBaseUnits:'6'},{address:'a',rawBaseUnits:'4'}]}};
const hash=(x:typeof input)=>monitoringFingerprint(monitoringObservation(x));
test('clock, slots, unrelated history and account ordering do not change monitor fingerprint',()=>{
 const extra={...input,checkedAt:'later',history:{...input.history,signatures:99},current:{...input.current,balanceSlot:99,chainTime:999,tokenAccounts:[...input.current.tokenAccounts].reverse()},blockers:[...input.blockers].reverse()};
 assert.equal(hash(extra),hash(input));
});
test('holdings, event corrections, baseline, eligibility and history failures are meaningful',()=>{
 for(const change of [{baselineId:'new'},{event:{eventId:'event',version:2}},{blockers:[]},{history:{status:'incomplete',reason:'unavailable'}},{current:{...input.current,rawBaseUnits:'11'}},{current:{...input.current,multiplier:{active:'1.1'}}}])assert.notEqual(hash({...input,...change}),hash(input));
});
