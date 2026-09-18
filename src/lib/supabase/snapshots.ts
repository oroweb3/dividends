import 'server-only';
import type { readBalances } from '../solana/balances';
export function config() {
  const project=process.env.SUPABASE_PROJECT_ID?.trim();
  const url=process.env.SUPABASE_URL?.trim() || (project && /^[a-z0-9]+$/.test(project) ? `https://${project}.supabase.co` : undefined);
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Snapshot database is not configured');
  return {url,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}};
}
export async function snapshotStatus() {
  try {
    const {url,headers}=config();
    const r=await fetch(`${url}/rest/v1/dividend_balance_snapshots?select=id&limit=0`,{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
    return r.ok?'ready':r.status===404?'migration-required':'unavailable';
  } catch {return 'unavailable';}
}
export async function saveSnapshots(userId: string, wallet: string, balances: Awaited<ReturnType<typeof readBalances>>) {
  const {url,headers}=config();
  const rows=balances.map(b=>({user_id:userId,wallet_address:wallet,stock_mint:b.mint,symbol:b.symbol,
    raw_balance:b.rawBaseUnits,decimals:b.decimals,previous_multiplier:b.multiplier.previous,new_multiplier:b.multiplier.next,
    active_multiplier:b.multiplier.active,multiplier_effective_timestamp:b.multiplier.effectiveTimestamp,
    balance_slot:b.balanceSlot,mint_slot:b.mintSlot,chain_timestamp:b.chainTime,token_accounts:b.tokenAccounts,eligibility:'unverified',commitment:'finalized'}));
  const response=await fetch(`${url}/rest/v1/dividend_balance_snapshots?on_conflict=wallet_address,stock_mint,balance_slot,mint_slot`,{
    method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows),signal:AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(response.status===404?'Apply the snapshot database migration first':'Snapshot storage failed');
}

export async function readLatestSnapshot(userId: string, wallet: string, mint: string) {
  const {url,headers}=config();
  // Cast numerics to text in PostgREST to avoid JSON number precision loss.
  const query=new URLSearchParams({select:'id,user_id,wallet_address,stock_mint,raw_balance::text,active_multiplier::text,decimals,balance_slot,mint_slot,chain_timestamp,observed_at,token_accounts',user_id:`eq.${userId}`,wallet_address:`eq.${wallet}`,stock_mint:`eq.${mint}`,order:'balance_slot.desc',limit:'1'});
  const r=await fetch(`${url}/rest/v1/dividend_balance_snapshots?${query}`,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (!r.ok) throw new Error('Snapshot lookup unavailable');
  const rows=await r.json();
  return rows[0]??null;
}
