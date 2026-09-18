import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jobAuthorized} from '../src/lib/jobs/control';
test('scheduled jobs require the exact long bearer secret',()=>{
 const secret='a'.repeat(64);
 assert.equal(jobAuthorized('Bearer '+secret,secret),true);
 for(const header of [null,'','Bearer short','Basic '+secret,'Bearer '+'b'.repeat(64),'Bearer '+secret+' extra'])assert.equal(jobAuthorized(header,secret),false);
 assert.equal(jobAuthorized('Bearer short','short'),false);
 assert.equal(jobAuthorized('Bearer '+secret,undefined),false);
});
