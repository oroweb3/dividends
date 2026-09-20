import 'server-only';
import {parseDisplayQuotes,unavailableQuote,type DisplayQuote} from './tokens-data';
export async function getDisplayQuotes(mints:readonly string[]):Promise<Record<string,DisplayQuote>>{
 const unique=[...new Set(mints)].sort(),key=process.env.TOKENS_XYZ_API_KEY;
 const result:Record<string,DisplayQuote>=Object.fromEntries(unique.map(m=>[m,unavailableQuote()]));
 if(!key)return result;
 // One shared market request per batch, independent of wallet identity. Never send user tokens upstream.
 for(let i=0;i<unique.length;i+=50){
  const batch=unique.slice(i,i+50);
  try{
   const query=new URLSearchParams({mints:batch.join(',')});
   const response=await fetch(`https://api.tokens.xyz/v1/assets/variant-markets?${query}`,{headers:{'x-api-key':key},cache:'force-cache',next:{revalidate:60},signal:AbortSignal.timeout(8000)});
   if(!response.ok)break; // Includes quota exhaustion: no retry storm on dashboard requests.
   Object.assign(result,parseDisplayQuotes(await response.json(),batch));
  }catch{break;}
 }
 return result;
}
