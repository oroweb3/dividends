'use client';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { SwapPreview } from './swap-preview';
import { TrackingControl } from './tracking-control';
import type { StockOverview } from '@/lib/xstocks/overview';
const eventLabels: Record<string,string> = {
  'activation-observed':'Matching multiplier active onchain', 'scheduled-onchain':'Multiplier scheduled onchain',
  'awaiting-issuer-details':'Awaiting issuer details', 'not-matched-to-current-mint':'Not matched to current mint update',
  'chain-unavailable':'Onchain verification unavailable',
};
function date(value: string | number) {return new Date(typeof value==='number'?value*1000:value).toLocaleString();}
export function StocksPanel({wallet}: {wallet: string}) {
  const {getAccessToken}=usePrivy();
  const [data,setData]=useState<StockOverview|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      setLoading(true);setError(null);
      try {
        const token=await getAccessToken();
        if (!token) throw new Error('Sign in again to load stocks.');
        const response=await fetch('/api/stocks',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'});
        const result=await response.json();
        if (!response.ok) throw new Error(result.error || 'Stock data unavailable');
        if (result.wallet!==wallet) throw new Error('Wallet changed. Refresh your account.');
        if (!controller.signal.aborted) setData(result);
      } catch(e) {if (!controller.signal.aborted) setError(e instanceof Error?e.message:'Stock data unavailable');}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[getAccessToken,wallet,refresh]);
  async function capture() {
    if (saving) return;
    setSaving(true);setMessage('');
    try {
      const token=await getAccessToken();
      const r=await fetch('/api/snapshots',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
      const result=await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage('Current balances saved. Dividend eligibility remains unverified.');
    } catch(e) {setMessage(e instanceof Error?e.message:'Snapshot failed');}
    finally {setSaving(false);}
  }
  return <section className="stocks-section" aria-label="Supported stocks">
    <div className="stocks-heading"><div><p className="eyebrow">START WITH THE STOCKS YOU KNOW</p><h2>Your stocks</h2></div><button className="text-button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>{loading?'Refreshing…':'Refresh stocks'}</button></div>
    <p className="muted">AAPLx, SPYx, and NVDAx on Solana. Purchases and dividend routing come next.</p>
    {error && <p className="error" role="alert">{error}{data?' Showing the previous observation.':''}</p>}
    {loading&&!data&&<p role="status">Reading stock balances and issuer events…</p>}
    {data?.chainError&&<p className="error" role="alert">{data.chainError}</p>}
    <div className="stock-grid">{data?.stocks.map(stock=><article className="panel stock-card" key={stock.mint}>
      <div className="panel-heading"><h3>{stock.name}</h3><span className="tag">{stock.symbol}</span></div>
      <p className="stock-balance">{stock.balance?.economicBalance??'Unavailable'} <span>{stock.symbol}</span></p>
      <p className="muted">Economic balance · Conversion not enabled</p>
      <TrackingControl key={`${wallet}:${stock.symbol}`} symbol={stock.symbol} wallet={wallet} />
      <p>Issuer indicative price: {stock.price===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(stock.price)}</p>
      <p className="small-note">Indicative token quote, not an executable swap price.</p>
      {stock.warnings.map(w=><p className="error" key={w}>{w}</p>)}
      <details className="inspection"><summary>Inspect balance & dividend data</summary>
        <dl><dt>Solana mint</dt><dd><a href={`https://solscan.io/token/${stock.mint}`} target="_blank" rel="noreferrer">{stock.mint}</a></dd>
          <dt>Raw base units</dt><dd>{stock.balance?.rawBaseUnits??'Unavailable'}</dd><dt>Decimals (onchain)</dt><dd>{stock.balance?.decimals??'Unavailable'}</dd>
          <dt>Raw token balance</dt><dd>{stock.balance?.rawBalance??'Unavailable'}</dd>
          <dt>Active multiplier</dt><dd>{stock.balance?.multiplier.active??'Unavailable'}</dd>
          <dt>Stored previous / new multiplier</dt><dd>{stock.balance?`${stock.balance.multiplier.previous} / ${stock.balance.multiplier.next}`:'Unavailable'}</dd>
          <dt>Onchain activation time</dt><dd>{stock.balance?date(stock.balance.multiplier.effectiveTimestamp):'Unavailable'}</dd>
          <dt>Issuer current multiplier</dt><dd>{stock.issuerMultiplier?.currentMultiplier??'Unavailable'}</dd>
          <dt>Issuer pending multiplier</dt><dd>{!stock.issuerMultiplier?'Unavailable':stock.issuerMultiplier.newMultiplier?`${stock.issuerMultiplier.newMultiplier} (activation timestamp: ${stock.issuerMultiplier.activationDateTime})`:'None reported'}</dd>
          <dt>Balance / mint slots (finalized)</dt><dd>{stock.balance?`${stock.balance.balanceSlot} / ${stock.balance.mintSlot}`:'Unavailable'}</dd>
          <dt>Chain observation time</dt><dd>{stock.balance?date(stock.balance.chainTime):'Unavailable'}</dd>
          <dt>Your dividend eligibility</dt><dd>Run the eligibility check for a current assessment</dd>
        </dl>
        <EligibilityCheck key={`${wallet}:${stock.symbol}`} symbol={stock.symbol} />
        <SwapPreview key={`preview:${wallet}:${stock.symbol}`} symbol={stock.symbol} wallet={wallet} />
        <h4>Upcoming dividend</h4>
        <p>{stock.events===null?'Event feed unavailable.':(()=>{
          const cutoff=(stock.balance?.chainTime??Date.parse(data!.observedAt)/1000)*1000;
          const next=stock.events.filter(e=>e.effectiveTimeUtc&&Date.parse(e.effectiveTimeUtc)>cutoff).sort((a,b)=>a.effectiveTimeUtc!.localeCompare(b.effectiveTimeUtc!))[0];
          return next?.effectiveTimeUtc?`${date(next.effectiveTimeUtc)} — ${eventLabels[next.observation]??next.observation}`:'No future cash dividend reported in the fetched feed.';
        })()}</p>
        <h4>Cash dividend events</h4>
        <p className="small-note">Issuer events only. These are not amounts available for you to convert. Splits and cancelled events are excluded.</p>
        {stock.events===null?<p>Event feed unavailable.</p>:stock.events.length===0?<p>No cash dividend events reported.</p>:stock.events.map(event=><div className="dividend-event" key={event.eventId}>
          <strong>{event.effectiveTimeUtc?date(event.effectiveTimeUtc):'Timing not yet supplied'}</strong>
          <p>{eventLabels[event.observation]??event.observation} · Issuer status: {event.status}</p>
          <p className="small-note">{event.multiplierOld??'Pending'} → {event.multiplierNew??'Pending'}</p>
          <code>{event.eventId} · v{event.version}</code>
        </div>)}
      </details>
    </article>)}</div>
    {data&&<details className="inspection snapshot-inspection"><summary>Development: balance snapshots</summary>
      <p>Snapshots record current balances, not proof of dividend entitlement. Balance and mint reads have separate finalized slots. Transaction-history reconciliation is still required.</p>
      <p>Database: {data.storage==='ready'?'ready':data.storage==='migration-required'?'apply the supplied Supabase migration':'unavailable'}</p>
      <button className="button" onClick={capture} disabled={saving||data.storage!=='ready'||!!data.chainError}>{saving?'Saving…':'Save current balance snapshot'}</button>
      <p role="status">{message}</p>
    </details>}
    {data&&<p className="small-note">Observation fetched {date(data.observedAt)}. Refresh for updated data.</p>}
  </section>;
}

function EligibilityCheck({symbol}: {symbol: string}) {
  const {getAccessToken}=usePrivy();
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{historyVerified:boolean;blockers:string[];history:{reason:string}|null}|null>(null);
  const [error,setError]=useState('');
  async function check() {
    setBusy(true);setError('');setResult(null);
    try {
      const token=await getAccessToken();
      const r=await fetch('/api/eligibility',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({symbol})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error);
      setResult(data);
    }catch(e){setError(e instanceof Error?e.message:'Check unavailable');}
    finally{setBusy(false);}
  }
  return <div className="dividend-event"><button className="text-button" disabled={busy} onClick={check}>{busy?'Checking holdings history…':'Check dividend eligibility'}</button>
    {error&&<p role="alert">{error}</p>}
    {result&&<div role="status"><strong>{result.historyVerified?'Historical checks passed · Conversion blocked':'Conversion blocked'}</strong><ul>{result.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>{result.history&&<p>{result.history.reason}</p>}</div>}
  </div>;
}
