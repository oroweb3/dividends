import 'server-only';
import { V1Client,types } from '@titanexchange/sdk-ts';
import { getBase58Encoder } from '@solana/kit';
import { normalizeTitan } from './normalize';
import { rpc } from '../solana/rpc';
let inFlight=false;
export async function getGoldQuote(inputMint:string,outputMint:string,amount:string,wallet:string){
 if(inFlight)throw new Error('Titan quote is busy. Retry shortly.');
 const token=process.env.TITAN_AUTH_TOKEN,endpoint=process.env.TITAN_WS_URL;
 if(!token||!endpoint)throw new Error('Titan configuration unavailable');
 const url=new URL(endpoint);
 if(url.protocol!=='wss:'||!url.hostname.endsWith('.titan.exchange'))throw new Error('Invalid Titan endpoint');
 url.searchParams.set('auth',token);
 inFlight=true;
 let client:V1Client|undefined,expired=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Titan quote timed out'));},12000);});
 const bounded=<T>(p:Promise<T>)=>Promise.race([p,deadline]);
 try{
  client=await bounded(V1Client.connect(url.toString()).then(c=>{if(expired)void c.close();return c;}));
  if(!client)throw new Error('Titan connection unavailable');
  const info=await bounded(client.getInfo());
  if(info.settings.connection.concurrentStreams<1||info.settings.swap.slippageBps.min>50||info.settings.swap.slippageBps.max<50)throw new Error('Titan settings do not support preview');
  const encode=getBase58Encoder();
  const stream=await bounded(client.newSwapQuoteStream({swap:{inputMint:new Uint8Array(encode.encode(inputMint)),outputMint:new Uint8Array(encode.encode(outputMint)),amount:BigInt(amount),swapMode:types.common.SwapMode.ExactIn,slippageBps:50},transaction:{userPublicKey:new Uint8Array(encode.encode(wallet)),closeInputTokenAccount:false,titanSwapVersion:types.v1.SwapVersion.V2},update:{intervalMs:info.settings.quoteUpdate.intervalMs.default}}));
  const reader=stream.stream.getReader();
  try{
   for(let i=0;i<3;i++){
    const result=await bounded(reader.read());if(result.done)break;
    const slot=await bounded(rpc('getSlot',[{commitment:'confirmed'}]));
    if(typeof slot!=='number'||!Number.isSafeInteger(slot))throw new Error('Chain slot unavailable');
    try{return normalizeTitan(result.value,inputMint,outputMint,amount,Date.now(),slot);}catch{ /* Wait for the next bounded update. */ }
   }
   throw new Error('No usable Titan quote');
  }finally{reader.releaseLock();}
 }catch{throw new Error('Titan preview unavailable. Check the connection or retry.');}
 finally{
  if(timer)clearTimeout(timer);
  // Closing the connection also terminates its streams. Never log the auth URL.
  if(client)await Promise.race([client.close().catch(()=>{}),new Promise<void>(resolve=>{const t=setTimeout(resolve,1000);t.unref();})]);
  inFlight=false;
 }
}
