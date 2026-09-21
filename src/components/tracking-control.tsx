'use client';
import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
export function TrackingControl({symbol,wallet,initialEnabledAt,loading,loadError,executionEnabled,onEnabled,checkpointAt}:{symbol:string;wallet:string;initialEnabledAt:string|null;loading:boolean;loadError:string;executionEnabled:boolean;onEnabled:(symbol:string,enabledAt:string,checkpointAt:string)=>void;checkpointAt:string|null}) {
  const {getAccessToken}=usePrivy();
  const [newEnabledAt,setEnabledAt]=useState<string|null>(null);
  const enabledAt=newEnabledAt??initialEnabledAt;
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [acknowledged,setAcknowledged]=useState(false);
  const [checkpointMessage,setCheckpointMessage]=useState('');
  const [newCheckpointAt,setNewCheckpointAt]=useState<string|null>(null);
  const shownCheckpointAt=newCheckpointAt??checkpointAt;
  async function enable(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const token=await getAccessToken();
      const r=await fetch('/api/tracking',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({symbol})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error);
      if(data.wallet!==wallet)throw new Error('Wallet changed. Refresh your account.');
      setEnabledAt(data.tracking.enabled_at);
      onEnabled(symbol,data.tracking.enabled_at,data.tracking.baseline.observed_at);
    }catch(e){setError(e instanceof Error?e.message:'Tracking unavailable.');}
    finally{setBusy(false);}
  }
  async function restart(){
    if(busy||!acknowledged)return;
    setBusy(true);setError('');setCheckpointMessage('');
    try{
      const token=await getAccessToken();
      const response=await fetch('/api/tracking',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({symbol,acknowledgeFutureOnly:true})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Checkpoint update unavailable.');
      if(result.wallet!==wallet)throw new Error('Wallet changed. Refresh your account.');
      setCheckpointMessage(`New checkpoint recorded ${new Date(result.tracking.baseline.observed_at).toLocaleString()}. Only dividends after this checkpoint can qualify.`);
      setNewCheckpointAt(result.tracking.baseline.observed_at);
      onEnabled(symbol,result.tracking.enabled_at,result.tracking.baseline.observed_at);
      setAcknowledged(false);
    }catch(e){setError(e instanceof Error?e.message:'Checkpoint update unavailable.');}
    finally{setBusy(false);}
  }
  return <div className="tracking-status">
    {enabledAt?<><span className="tracking-pill">Tracking enabled</span><p className="small-note">Since {new Date(enabledAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}. Only dividends after enrollment can qualify.</p></>:<button className="text-button" disabled={loading||busy} onClick={enable}>{loading?'Loading tracking…':busy?'Recording starting holdings…':'Enable dividend tracking'}</button>}
    <p className="small-note">Changes to your holdings may require further verification. Tracking does not authorize sales.</p>
    {enabledAt&&shownCheckpointAt&&<p className="small-note">Current checkpoint: {new Date(shownCheckpointAt).toLocaleString()}. Dividends must occur after this checkpoint.</p>}
    {enabledAt&&!executionEnabled&&<details><summary>Holdings changed?</summary>
      <p className="small-note">Record your current holdings as a new starting point. Original history is kept. Dividends before this new checkpoint cannot qualify, including any unconverted dividends.</p>
      <label className="consent-label"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} /> I understand only future dividends will qualify.</label>
      <button className="text-button" disabled={busy||!acknowledged} onClick={()=>void restart()}>{busy?'Recording checkpoint…':'Update tracking checkpoint'}</button>
    </details>}
    {checkpointMessage&&<p className="small-note" role="status">{checkpointMessage}</p>}
    {(error||loadError)&&<p role="alert">{error||loadError}</p>}
  </div>;
}
