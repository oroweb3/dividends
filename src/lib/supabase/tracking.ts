import 'server-only';
import { z } from 'zod';
import { snapshotSchema } from '../dividends/eligibility';
import { config } from './snapshots';
export const trackingSchema=z.object({id:z.string().uuid(),enabled_at:z.string().datetime({offset:true}),baseline:snapshotSchema});
export async function trackingRequest(path:string, init:RequestInit={}) {
  const {url,headers}=config();
  const response=await fetch(`${url}/rest/v1/${path}`,{...init,headers:{...headers,...init.headers},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(response.status===404?'Apply the dividend tracking migration (202609170002) first.':'Dividend tracking database unavailable.');
  return response.status===204?null:response.json();
}
export async function readTracking(userId:string,wallet:string,mint:string) {
  const query=new URLSearchParams({select:'id,enabled_at,baseline',user_id:`eq.${userId}`,wallet_address:`eq.${wallet}`,stock_mint:`eq.${mint}`,limit:'1'});
  const rows=await trackingRequest(`dividend_tracking?${query}`);
  return rows[0]?trackingSchema.parse(rows[0]):null;
}
