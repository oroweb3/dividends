import { z } from 'zod';
const marketSchema=z.object({mint:z.string().optional(),price:z.number().finite().positive(),source:z.string().optional(),lastFetchedAt:z.number().finite().positive().optional(),lastTradeAt:z.number().finite().positive().optional()});
export type DisplayQuote={price:number|null;status:'available'|'stale'|'unavailable';cachedAt:string|null;lastTradeAt:string|null;source:string;unitBasis:'unverified'};
export function unavailableQuote():DisplayQuote{return {price:null,status:'unavailable',cachedAt:null,lastTradeAt:null,source:'tokens.xyz',unitBasis:'unverified'};}
function timestamp(value:number|undefined,now:number){if(!value)return null;const ms=value<1e12?value*1000:value;return ms<=now+60_000&&ms>=946684800000?ms:null;}
// Cache age is not proof of a recent trade. Keep both timestamps and never use this for execution.
export function parseDisplayQuotes(input:unknown,mints:readonly string[],now=Date.now()):Record<string,DisplayQuote>{
 const result:Record<string,DisplayQuote>=Object.fromEntries(mints.map(m=>[m,unavailableQuote()]));
 const envelope=z.object({variants:z.array(z.unknown())}).safeParse(input);if(!envelope.success)return result;
 const seen=new Set<string>();
 for(const value of envelope.data.variants){
  const row=z.object({mint:z.string(),chain:z.literal('solana'),market:z.unknown(),advisory:z.unknown().optional()}).safeParse(value);
  if(!row.success||!Object.hasOwn(result,row.data.mint))continue;
  const {mint,market,advisory}=row.data;
  if(seen.has(mint)){result[mint]=unavailableQuote();continue;}seen.add(mint);
  // Advisory semantics can evolve; don't display an unchecked flagged quote.
  if(advisory!=null)continue;
  const parsed=marketSchema.safeParse(market);if(!parsed.success||(parsed.data.mint&&parsed.data.mint!==mint))continue;
  const data=parsed.data,cached=timestamp(data.lastFetchedAt,now),trade=timestamp(data.lastTradeAt,now);
  const recent=cached!==null&&trade!==null&&now-cached<=15*60_000&&now-trade<=15*60_000;
  result[mint]={price:data.price,status:recent?'available':'stale',cachedAt:cached?new Date(cached).toISOString():null,lastTradeAt:trade?new Date(trade).toISOString():null,source:data.source==='birdeye'?'tokens.xyz · Birdeye':'tokens.xyz',unitBasis:'unverified'};
 }
 return result;
}
