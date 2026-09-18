'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePrivy,useSigners} from '@privy-io/react-auth';
type Status={executionEnabled:boolean;wallet:string;configured:boolean;authorized:boolean;hasSigners:boolean;canAuthorize:boolean;signerId?:string;policyId?:string};
export function DelegationControl({wallet}:{wallet:string}){
 const {getAccessToken}=usePrivy();const {addSigners,removeSigners}=useSigners();
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
 const lock=useRef(false);
 const read=useCallback(async()=>{
  const token=await getAccessToken();if(!token)throw Error('Please sign in again.');
  const response=await fetch('/api/delegation',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error('Could not verify automation permissions. Try again.');
  if(data.wallet!==wallet)throw Error('Your wallet changed. Refresh the page.');
  return data as Status;
 },[getAccessToken,wallet]);
 useEffect(()=>{let active=true;read().then(s=>{if(active)setStatus(s);}).catch(()=>{if(active)setError('Could not load automation permissions.');});return()=>{active=false;};},[read]);
 async function act(action:'authorize'|'revoke'|'refresh'){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(action==='revoke'){
    // Revocation must work even if the server cannot verify the current policy.
    await removeSigners({address:wallet});
   }else{
   const fresh=await read();setStatus(fresh);
   if(action==='authorize'){
    if(!consent||!fresh.configured||!fresh.canAuthorize||!fresh.signerId||!fresh.policyId)throw Error('Authorization is unavailable. Refresh permissions first.');
    await addSigners({address:wallet,signers:[{signerId:fresh.signerId,policyIds:[fresh.policyId]}]});
   }
   }
   if(action!=='refresh'){
    const checked=await read();setStatus(checked);setConsent(false);
    if(action==='authorize'&&!checked.authorized)throw Error('Authorization is not confirmed yet. Refresh permissions before retrying.');
    if(action==='revoke'&&checked.hasSigners)throw Error('Revocation is not confirmed yet. Refresh permissions.');
   }
  }catch(cause){
   const message=cause instanceof Error?cause.message:'';
   const code=typeof cause==='object'&&cause!==null&&'privyErrorCode' in cause?typeof cause.privyErrorCode==='string'?cause.privyErrorCode:'':'';
   if(/wallet proxy not initialized/i.test(message))setError('Privy could not connect to your wallet in this browser. Reload the wallet connection and try again. If this persists, open the app in Chrome or Safari.');
   else if(/on-device|TEE execution/i.test(message))setError('This wallet needs Privy TEE migration before it can authorize a restricted signer.');
   else if(/not allowed|allowlist|not enabled|not configured/i.test(message))setError('Privy has not enabled this signer for the app. Check the signer configuration.');
   else if(/reject|cancel/i.test(message))setError('Authorization was cancelled. No new permission was confirmed.');
   else setError('The request could not be confirmed. Refresh permissions to check its status.'+(/^[a-z0-9_-]{1,80}$/i.test(code)?` Privy code: ${code}`:''));

  }
  finally{lock.current=false;setBusy(false);}
 }
 return <div className="panel">
  <span className="tag">{status?.authorized?'Permission granted':'Automation permission'}</span>
  <h2>Automatic dividend conversion</h2>
  <p>Authorize Oro to sign transactions from this Dividend Account without asking you each time. You can revoke access below.</p>
  <p className="small-note">The signing policy permits Titan swaps, token account creation and compute instructions. Oro’s server must verify dividend eligibility, sale amounts and your GOLD destination before each conversion. The policy alone does not limit sales to dividends.</p>
  <p className="small-note">{status?.executionEnabled?'Automatic processing is available for tracked dividends that pass eligibility checks. Granting permission allows conversions without further signature prompts.':'Live conversions are disabled pending funded validation. Granting permission does not start conversions or sell anything now.'}</p>
  {status?.configured&&status.canAuthorize&&<><label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> I authorize Oro to sign under these permissions.</label><p><button className="button" disabled={busy||!consent} onClick={()=>void act('authorize')}>{busy?'Checking permissions…':'Authorize automation'}</button></p></>}
  {status&&!status.configured&&<p>Automation setup is not ready yet.</p>}
  {(status?.hasSigners||error)&&<><p className="small-note">Revocation removes all additional signers from this Dividend Account. Already-signed transactions may still complete.</p><button className="text-button" disabled={busy} onClick={()=>void act('revoke')}>Revoke all delegated access</button></>}
  <p><button className="text-button" disabled={busy} onClick={()=>void act('refresh')}>{busy?'Checking…':'Refresh permissions'}</button></p>
  {error&&<><p className="error" role="alert">{error}</p>{error.startsWith('Privy could not connect')&&<button className="text-button" disabled={busy} onClick={()=>window.location.reload()}>Reload wallet connection</button>}</>}
 </div>;
}
