'use client';
import { useRef,useState,useSyncExternalStore } from 'react';
import { usePrivy } from '@privy-io/react-auth';
function subscribeRequests(notify:()=>void){window.addEventListener('storage',notify);window.addEventListener('dividend-request',notify);return()=>{window.removeEventListener('storage',notify);window.removeEventListener('dividend-request',notify);};}
type Preview={executionEnabled:boolean;simulation?:{sponsored:boolean;networkFeeLamports:number;rentLamports:number;slot:number;transactionHash:string}|null;token:string;expiresAt:number;rawTokensToSell:string;remainingExposure:string;expectedGold:string;minimumGold:string;router:string;feeBps:number;feeMint:string;slippageBps:number;preflightPassed:boolean;notice:string};
export function SwapPreview({symbol,wallet}:{symbol:string;wallet:string}){
 const {getAccessToken}=usePrivy();
 const storageKey=`dividend-conversion:${wallet}:${symbol}`;
 const requestId=useSyncExternalStore(subscribeRequests,()=>{try{return localStorage.getItem(storageKey);}catch{return null;}},()=>null);
 function setRequestId(value:string|null){if(value)localStorage.setItem(storageKey,value);else localStorage.removeItem(storageKey);window.dispatchEvent(new Event('dividend-request'));}
 const [conversion,setConversion]=useState<{status:string;signature?:string|null;rollover?:string;rolloverReason?:string}|null>(null);
 const lock=useRef(false);
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(recheck:boolean){
  if(busy)return;setBusy(true);setError('');
  const token=preview?.token;setPreview(null);
  try{
   const auth=await getAccessToken();
   const response=await fetch(`/api/swaps/${recheck?'preflight':'preview'}`,{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({symbol,...(recheck?{token}:{})})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);setPreview(result);
  }catch(e){setError(e instanceof Error?e.message:'Preview unavailable.');}finally{setBusy(false);}
 }
 async function convert(statusOnly=false){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   let id=requestId;
   if(!id){
    if(statusOnly)return;
    id=crypto.randomUUID();setRequestId(id);
   }
   const auth=await getAccessToken();
   const response=await fetch(`/api/swaps/${statusOnly?'status':'execute'}`,{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({symbol,requestId:id,...(!statusOnly?{token:preview?.token}:{})})});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   setConversion(result);
  }catch(e){setError(e instanceof Error?e.message:'Conversion status unavailable. Refresh its status before retrying.');}
  finally{lock.current=false;setBusy(false);}
 }
 function clearCompleted(){
  // Only a settled claim can leave this UI. Uncertain attempts keep their ID.
  if(conversion?.status!=='confirmed'||conversion.rollover!=='complete')return;
  setRequestId(null);setConversion(null);setPreview(null);
 }
 return <div className="dividend-event">
  <button className="text-button" disabled={busy} onClick={()=>load(false)}>{busy?'Checking dividend and quote…':'Preview dividend → GOLD'}</button>
  {requestId&&<div><p role="status">Conversion: {conversion?.status??'status needs checking'}</p>{conversion?.signature&&<p className="small-note">Transaction: {conversion.signature}</p>}<button className="text-button" disabled={busy} onClick={()=>void convert(true)}>Refresh conversion status</button>{conversion?.status==='not-found'&&<button className="text-button" disabled={busy||!preview?.executionEnabled} onClick={()=>void convert(false)}>Retry same request</button>}{conversion?.rolloverReason&&<p role="status">{conversion.rolloverReason}</p>}{conversion?.rollover==='complete'&&<p>Next dividend checkpoint verified.</p>}{conversion?.status==='confirmed'&&conversion.rollover==='complete'&&<button className="text-button" disabled={busy} onClick={clearCompleted}>Done</button>}</div>}
  {error&&<p role="alert">{error}</p>}
  {preview&&<div role="status"><dl>
   <dt>Stock to sell (unscaled units)</dt><dd>{preview.rawTokensToSell} {symbol}</dd>
   <dt>Stock exposure remaining</dt><dd>{preview.remainingExposure} {symbol}</dd>
   <dt>Estimated GOLD</dt><dd>{preview.expectedGold}</dd><dt>Calculated minimum GOLD (preview)</dt><dd>{preview.minimumGold}</dd>
   <dt>Slippage tolerance</dt><dd>{preview.slippageBps/100}%</dd><dt>App platform fee</dt><dd>{preview.feeBps/100}% · mint {preview.feeMint}</dd>
   {preview.simulation&&<><dt>Network fee {preview.simulation.sponsored?'(paid by Oro)':''}</dt><dd>{preview.simulation.networkFeeLamports} lamports</dd><dt>Account creation {preview.simulation.sponsored?'(paid by Oro)':''}</dt><dd>{preview.simulation.rentLamports} lamports</dd><dt>Simulation slot</dt><dd>{preview.simulation.slot}</dd></>}
   <dt>Route</dt><dd>{preview.router}</dd><dt>Preview expires</dt><dd>{new Date(preview.expiresAt).toLocaleTimeString()}</dd>
  </dl><p>{preview.notice}</p><p>{preview.preflightPassed?(preview.executionEnabled?'Checks passed. Conversion will revalidate before signing.':'Checks passed. Live execution remains disabled.'):'Refresh checks before proceeding.'}</p>
  <button className="text-button" disabled={busy} onClick={()=>load(true)}>Recheck before conversion</button>
  {preview.executionEnabled&&preview.preflightPassed&&!requestId&&<button className="button" disabled={busy} onClick={()=>void convert(false)}>Convert verified dividend</button>}
  </div>}
 </div>;
}
