'use client';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
export function TrackingControl({symbol,wallet}:{symbol:string;wallet:string}) {
  const {getAccessToken}=usePrivy();
  const [enabledAt,setEnabledAt]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const token=await getAccessToken();
        const r=await fetch('/api/tracking',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
        const data=await r.json();
        if(!r.ok)throw new Error(data.error);
        if(data.wallet!==wallet)throw new Error('Wallet changed. Refresh your account.');
        if(!controller.signal.aborted)setEnabledAt(data.tracking.find((t:{symbol:string})=>t.symbol===symbol)?.tracking?.enabled_at??null);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Tracking unavailable.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[getAccessToken,symbol,wallet]);
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
    }catch(e){setError(e instanceof Error?e.message:'Tracking unavailable.');}
    finally{setBusy(false);}
  }
  return <div className="tracking-status">
    {enabledAt?<><span className="tracking-pill">Tracking enabled</span><p className="small-note">Since {new Date(enabledAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}. Only dividends after enrollment can qualify.</p></>:<button className="text-button" disabled={loading||busy} onClick={enable}>{loading?'Loading tracking…':busy?'Recording starting holdings…':'Enable dividend tracking'}</button>}
    <p className="small-note">Changes to your holdings may require further verification. Tracking does not authorize sales.</p>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
