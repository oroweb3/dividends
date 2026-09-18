import { z } from 'zod';
import { requireWallet, AuthError } from '@/lib/privy/server';
import { assets } from '@/lib/xstocks/assets';
import { inspectDividend } from '@/lib/dividends/inspect';
export const runtime='nodejs';
export async function POST(request:Request) {
 try {
  const {userId,wallet}=await requireWallet(request);
  const body=z.object({symbol:z.enum(assets.map(s=>s.symbol))}).safeParse(await request.json());
  if(!body.success)return Response.json({error:'Choose a supported stock'},{status:400});
  const stock=assets.find(a=>a.symbol===body.data.symbol)!;
  const result=await inspectDividend(userId,wallet,stock);
  return Response.json({eligible:false,historyVerified:result.historyVerified,symbol:stock.symbol,eventId:result.event?.eventId??null,snapshotId:result.snapshot?.id??null,checkedAt:new Date().toISOString(),history:result.history,blockers:[...result.blockers,'Conversion is not enabled. Transaction validation and execution are still required.']},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof AuthError?error.message:'Eligibility inspection unavailable. No conversion is authorized.'},{status:error instanceof AuthError?401:503});}
}
