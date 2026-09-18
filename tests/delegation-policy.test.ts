import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertDelegationPolicy,inspectDelegation} from '../src/lib/privy/delegation-policy';
function policy(){return {id:'policy',...JSON.parse(readFileSync('config/privy-dividend-policy.json','utf8'))};}
test('delegation rejects policy broadening and mismatched configuration',()=>{
 assertDelegationPolicy(policy(),'policy');
 const mutations=[(p:ReturnType<typeof policy>)=>{p.rules.push({...p.rules[0],method:'signMessage'});},(p:ReturnType<typeof policy>)=>{p.rules[0].conditions=[];},(p:ReturnType<typeof policy>)=>{p.rules[0].method='signAndSendTransaction';},(p:ReturnType<typeof policy>)=>{p.rules[0].conditions[0].value[0]='11111111111111111111111111111111';},(p:ReturnType<typeof policy>)=>{p.chain_type='ethereum';},(p:ReturnType<typeof policy>)=>{p.id='another';}];
 for(const mutate of mutations){const p=policy();mutate(p);assert.throws(()=>assertDelegationPolicy(p,'policy'));}
});
test('delegation checks wallet identity, signer and exact override policy',()=>{
 const base={id:'walletId',address:'wallet',chain_type:'solana',additional_signers:[] as {signer_id:string;override_policy_ids?:string[]}[]};
 const inspect=(value:unknown)=>inspectDelegation(value,'walletId','wallet','signer','policy');
 assert.deepEqual(inspect(base),{authorized:false,hasSigners:false,canAuthorize:true});
 const signed={...base,additional_signers:[{signer_id:'signer',override_policy_ids:['policy']}]};
 assert.equal(inspect(signed).authorized,true);
 for(const signer of [{signer_id:'other',override_policy_ids:['policy']},{signer_id:'signer'},{signer_id:'signer',override_policy_ids:[]},{signer_id:'signer',override_policy_ids:['policy','extra']}]){const state=inspect({...base,additional_signers:[signer]});assert.equal(state.authorized,false);assert.equal(state.canAuthorize,false);assert.equal(state.hasSigners,true);}
 assert.equal(inspect({...base,additional_signers:[...signed.additional_signers,...signed.additional_signers]}).authorized,false);
 assert.throws(()=>inspect({...signed,address:'someone-else'}));assert.throws(()=>inspect({...signed,id:'other'}));
});
