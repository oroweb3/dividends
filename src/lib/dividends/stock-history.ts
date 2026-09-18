import { z } from 'zod';
const balance=z.object({mint:z.string(),owner:z.string().optional(),accountIndex:z.number().int(),uiTokenAmount:z.object({amount:z.string().regex(/^\d+$/)})});
const transaction=z.object({
  slot:z.number().int().safe(),
  meta:z.object({err:z.unknown(),preTokenBalances:z.array(balance),postTokenBalances:z.array(balance),innerInstructions:z.array(z.unknown())}),
  transaction:z.object({signatures:z.array(z.string()).min(1),message:z.object({accountKeys:z.array(z.object({pubkey:z.string()})),instructions:z.array(z.unknown())})}),
});
// Any reference to this mint or an observed account is conservative evidence of
// activity, including transfers whose net amount is zero and authority changes.
export function classifyStockTransaction(value:unknown,mint:string,accounts:string[]) {
  const parsed=transaction.safeParse(value);
  if(!parsed.success)return 'incomplete';
  const tx=parsed.data;
  if(tx.meta.err!==null)return 'incomplete'; // Unexpected under succeeded filter.
  const targets=new Set([mint,...accounts]);
  function references(v:unknown):boolean {
    if(typeof v==='string')return targets.has(v);
    if(Array.isArray(v))return v.some(references);
    return !!v&&typeof v==='object'&&Object.values(v).some(references);
  }
  if(references(value))return 'activity-detected';
  // Opaque instructions from either token program cannot establish the absence
  // of transient account/authority activity. Parsed unrelated activity is fine.
  function opaque(v:unknown):boolean {
    if(!v||typeof v!=='object')return false;
    if(Array.isArray(v))return v.some(opaque);
    const obj=v as Record<string,unknown>;
    if(['TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'].includes(String(obj.programId))&&!obj.parsed)return true;
    return Object.values(obj).some(opaque);
  }
  return opaque(value)?'incomplete':'unrelated';
}
export async function scanStockHistory(fetchPage:(cursor?:string)=>Promise<unknown>,mint:string,accounts:string[],fromSlot:number,toSlot:number,verifiedConversion?:{signature:string;slot:number}) {
  const schema=z.object({data:z.array(z.unknown()),paginationToken:z.string().nullable().optional()});
  const cursors=new Set<string>();
  let cursor:string|undefined, signatures=0, conversionsSeen=0;
  for(let pageNumber=0;pageNumber<10;pageNumber++) {
    const page=schema.safeParse(await fetchPage(cursor));
    if(!page.success)return {status:'incomplete',signatures,reason:'Malformed history page.'};
    for(const value of page.data.data){
      const slot=z.object({slot:z.number().int().safe()}).safeParse(value);
      if(!slot.success||slot.data.slot<fromSlot||slot.data.slot>toSlot)return {status:'incomplete',signatures,reason:'History range could not be verified.'};
      signatures++;
      if(verifiedConversion){
        const known=transaction.safeParse(value);
        if(known.success&&known.data.transaction.signatures[0]===verifiedConversion.signature){
          if(known.data.slot!==verifiedConversion.slot||known.data.meta.err!==null||++conversionsSeen!==1)return {status:'incomplete',signatures,reason:'Conversion history identity mismatch.'};
          continue;
        }
      }
      const result=classifyStockTransaction(value,mint,accounts);
      if(result!=='unrelated')return {status:result,signatures,reason:result==='activity-detected'?'Activity involving this stock or its token accounts occurred after enrollment. Conversion is blocked even when net balances match.':'Transaction metadata is insufficient to rule out stock activity.'};
    }
    const next=page.data.paginationToken;
    if(!next&&verifiedConversion&&conversionsSeen!==1)return {status:'incomplete',signatures,reason:'Confirmed conversion was not found in indexed history.'};
    if(!next)return {status:'no-activity-observed',signatures,reason:'No activity involving this stock was found in the completed provider-indexed interval.'};
    if(cursors.has(next))break;
    cursors.add(next);cursor=next;
  }
  return {status:'incomplete',signatures,reason:'History pagination did not complete within the inspection limit.'};
}
