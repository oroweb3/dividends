import { scanStockHistory } from '../dividends/stock-history';
import 'server-only';
import { z } from 'zod';
import { rpc } from './rpc';
const signature=z.object({signature:z.string(),slot:z.number().int().safe(),err:z.unknown(),blockTime:z.number().nullable()});
/** Known-address activity inspection only. RPC exhaustion does NOT establish
 * completeness or discover accounts opened/closed outside these observations.
 * Any successful transaction referencing an address is conservatively flagged,
 * including zero-net transfers. No balance-delta-only inference is made.
 */
export async function inspectHistory(addresses: string[], fromSlot: number, toSlot: number) {
  const unique=[...new Set(addresses)];
  if (unique.length>12) return {status:'incomplete',signatures:0,reason:'Too many token accounts for the bounded history check.'};
  const found=new Set<string>();
  for (const address of unique) {
    let before: string|undefined;
    let reachedBoundary=false;
    for(let page=0;page<5;page++) {
      const rows=z.array(signature).parse(await rpc('getSignaturesForAddress',[address,{commitment:'finalized',minContextSlot:toSlot,limit:100,...(before?{before}:{})}]));
      for(const row of rows) {
        // Include the checkpoint slot itself: its balance/mint reads were not atomic.
        if(row.slot>=fromSlot&&row.slot<=toSlot&&row.err===null)found.add(row.signature);
      }
      if(found.size) return {status:'activity-detected',signatures:found.size,reason:'Successful account activity was found. V1 does not assume unchanged holdings, even if net balances match.'};
      if(rows.some(r=>r.slot<fromSlot)||rows.length<100){reachedBoundary=true;break;}
      const cursor=rows.at(-1)!.signature;
      if(cursor===before)break;
      before=cursor;
    }
    if(!reachedBoundary)return {status:'incomplete',signatures:0,reason:'History pagination limit reached before the checkpoint.'};
  }
  return {status:'no-activity-observed',signatures:0,reason:'No successful activity returned for known addresses. Provider history completeness and closed-account discovery are not proven.'};
}

/** Owner-index coverage remains dependent on the configured Helius provider. */
export async function inspectIndexedHistory(wallet:string,fromSlot:number,toSlot:number,mint:string,accounts:string[],verifiedConversion?:{signature:string;slot:number}) {
  return scanStockHistory(cursor=>rpc('getTransactionsForAddress',[wallet,{
    commitment:'finalized',minContextSlot:toSlot,transactionDetails:'full',encoding:'jsonParsed',limit:100,
    sortOrder:'asc',maxSupportedTransactionVersion:0,...(cursor?{paginationToken:cursor}:{}),
    filters:{status:'succeeded',tokenAccounts:'all',slot:{gte:fromSlot,lte:toSlot}},
  }]),mint,accounts,fromSlot,toSlot,verifiedConversion);
}
