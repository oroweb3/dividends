import { assertPreviewUnchanged,assertMinimumOutput } from '../src/lib/swaps/recheck';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuote } from '../src/lib/jupiter/validation';
import { signPreview,readPreview } from '../src/lib/swaps/preview-token';
const quote={inputMint:'stock',outputMint:'gold',inAmount:'1996007',outAmount:'1000',otherAmountThreshold:'995',swapMode:'ExactIn',slippageBps:50,router:'metis',feeBps:2,feeMint:'gold'};
test('quote must preserve exact input, destination and output protection',()=>{
 assert.equal(validateQuote(quote,'stock','gold','1996007').outAmount,'1000');
 for(const patch of [{inAmount:'1996008'},{outputMint:'other'},{swapMode:'ExactOut'},{slippageBps:100},{otherAmountThreshold:'900'},{otherAmountThreshold:'1001'},{outAmount:'0'},{errorCode:1}])assert.throws(()=>validateQuote({...quote,...patch},'stock','gold','1996007'));
});
test('signed previews reject edits, another user/wallet and expiry',()=>{
 const secret='a'.repeat(64),preview={userId:'u',wallet:'w',symbol:'NVDAx',fingerprint:'f',inputMint:'stock',outputMint:'gold',amount:'1996007',minimumOutput:'995',expiresAt:2000};
 const token=signPreview(preview,secret);
 assert.equal(readPreview(token,secret,'u','w',1000).amount,'1996007');
 for(const [u,w,now] of [['other','w',1000],['u','other',1000],['u','w',2000]] as const)assert.throws(()=>readPreview(token,secret,u,w,now));
 const edited=Buffer.from(JSON.stringify({...preview,amount:'999999999'})).toString('base64url')+'.'+token.split('.')[1];
 assert.throws(()=>readPreview(edited,secret,'u','w',1000));
 assert.throws(()=>readPreview(token,'b'.repeat(64),'u','w',1000));
});

test('fresh checks reject changed evidence, changed destinations, larger amounts and worse minimums',()=>{
 const p={userId:'u',wallet:'w',symbol:'NVDAx',fingerprint:'f',inputMint:'stock',outputMint:'gold',amount:'1996007',minimumOutput:'995',expiresAt:2000};
 assertPreviewUnchanged(p,p,1000);
 for(const patch of [{fingerprint:'changed'},{outputMint:'different'},{amount:'1996008'},{inputMint:'different'}])assert.throws(()=>assertPreviewUnchanged(p,{...p,...patch},1000));
 assert.throws(()=>assertPreviewUnchanged(p,p,2000));
 assertMinimumOutput(p,'995');assertMinimumOutput(p,'1000');
 assert.throws(()=>assertMinimumOutput(p,'994'));
});
