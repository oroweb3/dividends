import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {snapshotSchema,type Snapshot,compareHoldings} from './eligibility';
import {sameDecimal} from '../solana/amounts';
const balance=z.object({accountIndex:z.number().int().nonnegative(),mint:z.string(),owner:z.string(),uiTokenAmount:z.object({amount:z.string().regex(/^\d+$/),decimals:z.number().int().nonnegative()})});
export const rolloverTransactionSchema=z.object({slot:z.number().int().nonnegative().safe(),blockTime:z.number().int().nonnegative().safe(),transaction:z.tuple([z.string(),z.literal('base64')]),meta:z.object({err:z.null(),preTokenBalances:z.array(balance),postTokenBalances:z.array(balance),loadedAddresses:z.object({writable:z.array(z.string()),readonly:z.array(z.string())}).optional()})});
type Current={rawBaseUnits:string;decimals:number;balanceSlot:number;mintSlot:number;chainTime:number;multiplier:{active:string};tokenAccounts:{address:string;rawBaseUnits:string}[]};
/** Requires exact persisted signed bytes and complete indexed-history check separately. */
export function rolloverCheckpoint(baseline:Snapshot,multiplierNew:string,amount:string,tx:z.infer<typeof rolloverTransactionSchema>,accountKeys:readonly string[],current:Current,now=Date.now()){
 snapshotSchema.parse(baseline);
 const debit=BigInt(amount);if(debit<=0n||debit>=BigInt(baseline.raw_balance))throw Error('Invalid rollover debit');
 if(tx.slot<=baseline.mint_slot||current.balanceSlot<=tx.slot||current.mintSlot<current.balanceSlot||current.chainTime<tx.blockTime)throw Error('Rollover chronology is not established');
 if(current.decimals!==baseline.decimals||!sameDecimal(current.multiplier.active,multiplierNew))throw Error('Stock multiplier or precision changed before rollover');
 const expected=new Map(baseline.token_accounts.map(a=>[a.address,BigInt(a.rawBaseUnits)]));
 if(expected.size!==baseline.token_accounts.length||[...expected.values()].reduce((a,b)=>a+b,0n)!==BigInt(baseline.raw_balance))throw Error('Invalid original account evidence');
 const pre=tx.meta.preTokenBalances.filter(b=>b.mint===baseline.stock_mint&&b.owner===baseline.wallet_address);
 const post=tx.meta.postTokenBalances.filter(b=>b.mint===baseline.stock_mint&&b.owner===baseline.wallet_address);
 if(!pre.length||pre.length!==post.length||new Set(pre.map(b=>b.accountIndex)).size!==pre.length||new Set(post.map(b=>b.accountIndex)).size!==post.length)throw Error('Incomplete transaction stock balances');
 let actualDebit=0n;
 for(const before of pre){
  const address=accountKeys[before.accountIndex],after=post.find(b=>b.accountIndex===before.accountIndex);
  if(!address||!after||before.uiTokenAmount.decimals!==baseline.decimals||after.uiTokenAmount.decimals!==baseline.decimals||expected.get(address)!==BigInt(before.uiTokenAmount.amount))throw Error('Transaction holdings do not match checkpoint');
  const delta=BigInt(before.uiTokenAmount.amount)-BigInt(after.uiTokenAmount.amount);
  if(delta<0n)throw Error('Unexpected stock credit in conversion');
  actualDebit+=delta;expected.set(address,BigInt(after.uiTokenAmount.amount));
 }
 if(actualDebit!==debit)throw Error('Finalized stock debit differs from reservation');
 const next={...baseline,id:randomUUID(),raw_balance:(BigInt(baseline.raw_balance)-debit).toString(),active_multiplier:multiplierNew,balance_slot:current.balanceSlot,mint_slot:current.mintSlot,chain_timestamp:current.chainTime,observed_at:new Date(now).toISOString(),token_accounts:[...expected].map(([address,raw])=>({address,rawBaseUnits:raw.toString()}))};
 if(compareHoldings(next,current)!=='unchanged')throw Error('Holdings changed outside the confirmed conversion');
 return snapshotSchema.parse(next);
}
