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
  const [search,setSearch]=useState('');
  const [tracking,setTracking]=useState<Record<string,string|null>>({});
  const [checkpointDates,setCheckpointDates]=useState<Record<string,string|null>>({});
  const [trackingLoading,setTrackingLoading]=useState(true);
  const [trackingError,setTrackingError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    async function loadTracking(){
      setTrackingLoading(true);setTrackingError('');
      try{
        const token=await getAccessToken();
        const response=await fetch('/api/tracking',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||'Tracking unavailable.');
        if(result.wallet!==wallet)throw new Error('Wallet changed. Refresh your account.');
        if(!controller.signal.aborted){
          setTracking(Object.fromEntries(result.tracking.map((row:{symbol:string;tracking:{enabled_at:string}|null})=>[row.symbol,row.tracking?.enabled_at??null])));
          setCheckpointDates(Object.fromEntries(result.tracking.map((row:{symbol:string;tracking:{baseline:{observed_at:string}}|null})=>[row.symbol,row.tracking?.baseline.observed_at??null])));
        }
      }catch(e){if(!controller.signal.aborted)setTrackingError(e instanceof Error?e.message:'Tracking unavailable.');}
      finally{if(!controller.signal.aborted)setTrackingLoading(false);}
    }
    void loadTracking();return()=>controller.abort();
  },[getAccessToken,wallet,refresh]);
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
    <div className="stocks-heading"><div><p className="eyebrow">YOUR PORTFOLIO</p><h2>Stock holdings</h2></div><button className="text-button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>{loading?'Refreshing…':'Refresh stocks'}</button></div>
    <p className="muted holdings-intro">{data?`${data.stocks.length} supported xStocks`:'Supported xStocks'}, including stocks and ETFs. Only verified dividend events can qualify for conversion.</p>
    {data&&<div className="monitor-banner"><span className="status-dot" /><div><strong>{data.executionEnabled?'Conversions enabled':'Dividend tracking only'}</strong><p>{data.executionEnabled?'Tracked dividends must pass eligibility and permission checks before conversion.':'We’re checking for eligible dividends. Automatic conversion to GOLD isn’t enabled yet.'}</p></div><span className="tag">{data.executionEnabled?'Eligibility required':'Tracking only'}</span></div>}
    {error && <p className="error" role="alert">{error}{data?' Showing the previous observation.':''}</p>}
    {loading&&!data&&<p role="status">Reading stock balances and issuer events…</p>}
    {data?.chainError&&<p className="error" role="alert">{data.chainError}</p>}
    <label htmlFor="stock-search">Find a stock or ETF</label>
    <input id="stock-search" type="search" placeholder="Search by name or symbol" value={search} onChange={event=>setSearch(event.target.value)} />
    {data&&!data.stocks.some(stock=>`${stock.name} ${stock.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))&&<p>No matching assets.</p>}
    <div className="stock-grid">{data?.stocks.filter(stock=>`${stock.name} ${stock.symbol}`.toLowerCase().includes(search.trim().toLowerCase())).map(stock=><article className="panel stock-card" key={stock.mint}>
      <div className="panel-heading"><h3>{stock.name}</h3><span className="tag">{stock.symbol}</span></div>
      <p className="stock-balance">{stock.balance?new Intl.NumberFormat('en-US',{maximumFractionDigits:8}).format(Number(stock.balance.economicBalance)):'Unavailable'} <span>{stock.symbol}</span></p>
      <p className="balance-caption">Dividend-adjusted balance</p>
      <TrackingControl key={`${wallet}:${stock.symbol}`} symbol={stock.symbol} wallet={wallet} initialEnabledAt={tracking[stock.symbol]??null} loading={trackingLoading} loadError={trackingError} executionEnabled={data.executionEnabled} checkpointAt={checkpointDates[stock.symbol]??null} onEnabled={(symbol,enabledAt,checkpointAt)=>{setTracking(previous=>({...previous,[symbol]:enabledAt}));setCheckpointDates(previous=>({...previous,[symbol]:checkpointAt}));}} />
      <p className="quote-line">Reference quote: {stock.quote.price===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(stock.quote.price)}{stock.quote.status==='stale'?' · Older quote':''}</p>
      {stock.quote.price===null?<p className="small-note">Price feed temporarily unavailable. Balances and dividend checks are separate.</p>:<>
        <p className="small-note">{stock.quote.source} · Updated: {stock.quote.cachedAt?date(stock.quote.cachedAt):'Time unavailable'}<br />Last trade: {stock.quote.lastTradeAt?date(stock.quote.lastTradeAt):'Time unavailable'}</p>
        {stock.quote.status==='stale'&&<p className="small-note">Price or trade freshness could not be established within 15 minutes. This is not a live quote.</p>}
        <p className="small-note quote-disclaimer">Reference only · Swap prices may differ.</p>
      </>}
      {stock.warnings.map(w=><p className="error" key={w}>{w}</p>)}
      <details className="inspection"><summary>Dividend checks & details</summary>
        <p className="small-note">Provider price units relative to the xStocks balance multiplier are not yet confirmed. Portfolio-value calculation is withheld.</p>
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
