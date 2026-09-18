import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drainQueue} from '../src/lib/jobs/queue-runner';
test('bounded workers process distinct claims and isolate account failures',async()=>{
 let next=0,active=0,peak=0;const finished:number[]=[];
 const result=await drainQueue({concurrency:3,maxItems:20,startUntil:100},{now:()=>0,claim:async()=>next<20?next++:null,process:async i=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;if(i===3)throw Error();return true;},finish:async(i)=>{finished.push(i);}});
 assert.equal(result.completed,20);assert.equal(result.failed,1);assert.equal(new Set(finished).size,20);assert.equal(peak,3);
});
test('deadline prevents new work and exhausted queue ends without spinning',async()=>{
 let claims=0;
 const ports={now:()=>100,claim:async()=>{claims++;return null;},process:async()=>true,finish:async()=>{}};
 await drainQueue({concurrency:3,maxItems:20,startUntil:100},ports);assert.equal(claims,0);
 await drainQueue({concurrency:3,maxItems:20,startUntil:200},ports);assert.equal(claims,3);
});
test('infrastructure failures wait for other workers before releasing global lease',async()=>{
 let next=0,finished=false;
 await assert.rejects(drainQueue({concurrency:2,maxItems:2,startUntil:100},{now:()=>0,claim:async()=>next++,process:async i=>{if(i===1)await new Promise(r=>setTimeout(r,5));return true;},finish:async i=>{if(i===0)throw Error();finished=true;}}));
 assert.equal(finished,true);
});
