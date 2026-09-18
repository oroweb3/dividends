import 'server-only';
import { assets } from './assets';
import { getIssuerData } from './client';
import { eventObservation } from './multipliers';
import { readBalances } from '../solana/balances';
import { snapshotStatus } from '../supabase/snapshots';
export async function stockOverview(wallet: string) {
  const [chain,issuer,storage]=await Promise.all([
    readBalances(wallet).then(data=>({data,error:null})).catch(()=>({data:null,error:'Onchain balances unavailable. Check the mainnet RPC configuration and retry.'})),
    Promise.all(assets.map(getIssuerData)),snapshotStatus(),
  ]);
  return {wallet,observedAt:new Date().toISOString(),storage,chainError:chain.error,stocks:assets.map((asset,i)=>{
    const balance=chain.data?.[i]??null;
    return {...asset,...issuer[i],balance,events:issuer[i].events?.map(event=>({...event,observation:balance?eventObservation(event,balance.multiplier,balance.chainTime):'chain-unavailable'}))??null};
  })};
}
export type StockOverview = Awaited<ReturnType<typeof stockOverview>>;
