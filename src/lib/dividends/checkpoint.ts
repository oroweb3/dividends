import {randomUUID} from 'node:crypto';
import {snapshotSchema,type Snapshot} from './eligibility';
/** New observation only: never claims continuity or entitlement before this checkpoint. */
export function forwardCheckpoint(previous:Snapshot,current:{rawBaseUnits:string;decimals:number;balanceSlot:number;mintSlot:number;chainTime:number;multiplier:{active:string};tokenAccounts:{address:string;rawBaseUnits:string}[]},now=Date.now()) {
 const next=snapshotSchema.parse({...previous,id:randomUUID(),raw_balance:current.rawBaseUnits,active_multiplier:current.multiplier.active,decimals:current.decimals,balance_slot:current.balanceSlot,mint_slot:current.mintSlot,chain_timestamp:current.chainTime,observed_at:new Date(now).toISOString(),token_accounts:current.tokenAccounts});
 if(next.balance_slot<=previous.mint_slot||next.mint_slot<next.balance_slot||next.chain_timestamp<previous.chain_timestamp||Date.parse(next.observed_at)<=Date.parse(previous.observed_at))throw Error('A newer finalized checkpoint is required.');
 if(next.decimals!==previous.decimals||BigInt(next.raw_balance)<=0n||Number(next.active_multiplier)<=0)throw Error('Hold this stock before updating tracking.');
 if(new Set(next.token_accounts.map(a=>a.address)).size!==next.token_accounts.length||next.token_accounts.reduce((sum,a)=>sum+BigInt(a.rawBaseUnits),0n)!==BigInt(next.raw_balance))throw Error('Checkpoint account evidence is inconsistent.');
 return next;
}
