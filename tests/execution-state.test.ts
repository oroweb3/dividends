import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoveryAction} from '../src/lib/swaps/execution-state';
test('uncertain signing and expired transactions never authorize a replacement swap',()=>{
 assert.equal(recoveryAction('signing',{status:'not-found',blockHeight:99},100),'manual-review');
 for(const state of ['signed','submitted'] as const){
  assert.equal(recoveryAction(state,{status:'not-found',blockHeight:100},100),'rebroadcast-identical-bytes');
  assert.equal(recoveryAction(state,{status:'not-found',blockHeight:101},100),'manual-review');
  assert.equal(recoveryAction(state,{status:'unavailable'},100),'wait');
  assert.equal(recoveryAction(state,{status:'failed'},100),'manual-review');
  assert.equal(recoveryAction(state,{status:'confirmed'},100),'mark-confirmed');
 }
 assert.equal(recoveryAction('prepared',{status:'unavailable'},100),'fresh-validation-required');
 assert.equal(recoveryAction('confirmed',{status:'unavailable'},100),'complete');
 assert.equal(recoveryAction('review-required',{status:'confirmed'},100),'manual-review');
 assert.throws(()=>recoveryAction('signed',{status:'not-found',blockHeight:NaN},100));
});
