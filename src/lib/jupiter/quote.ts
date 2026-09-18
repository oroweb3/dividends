import 'server-only';
import { validateQuote } from './validation';
export async function getGoldQuote(inputMint:string,outputMint:string,amount:string){
 const key=process.env.JUPITER_API_KEY;
 if(!key)throw new Error('JUPITER_API_KEY is not configured.');
 const query=new URLSearchParams({inputMint,outputMint,amount,swapMode:'ExactIn',slippageBps:'50'});
 const response=await fetch(`https://api.jup.ag/swap/v2/order?${query}`,{headers:{'x-api-key':key},cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Jupiter quote unavailable for this dividend amount.');
 // No taker supplied: quote only. Never return transaction bytes to the client.
 return validateQuote(await response.json(),inputMint,outputMint,amount);
}
