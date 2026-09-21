import { z } from 'zod';
import {forwardCheckpoint} from '@/lib/dividends/checkpoint';
import { requireWallet, AuthError } from '@/lib/privy/server';
import { assets } from '@/lib/xstocks/assets';
import { readBalances } from '@/lib/solana/balances';
import { readTracking, readWalletTracking, trackingRequest } from '@/lib/supabase/tracking';
export const runtime='nodejs';
function failure(error:unknown) {
  return Response.json({error:error instanceof AuthError?error.message:error instanceof Error&&error.message.startsWith('Apply the dividend')?error.message:'Dividend tracking unavailable. Please retry.'},{status:error instanceof AuthError?401:503});
}
export async function GET(request:Request) {
  try {
    const {userId,wallet}=await requireWallet(request);
    const rows=await readWalletTracking(userId,wallet);
    const tracking=assets.map(stock=>({symbol:stock.symbol,tracking:rows.find(row=>row.stock_mint===stock.mint)??null}));
    return Response.json({wallet,tracking},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    const {userId,wallet}=await requireWallet(request);
    const body=z.object({symbol:z.enum(assets.map(a=>a.symbol))}).safeParse(await request.json());
    if(!body.success)return Response.json({error:'Choose a supported stock.'},{status:400});
    const stock=assets.find(a=>a.symbol===body.data.symbol)!;
    let tracking=await readTracking(userId,wallet,stock.mint);
    if(!tracking){
      const b=(await readBalances(wallet)).find(b=>b.mint===stock.mint)!;
      if(BigInt(b.rawBaseUnits)===0n)return Response.json({error:'Hold this stock in your Dividend Account before enabling tracking.'},{status:409});
      const baseline={id:crypto.randomUUID(),user_id:userId,wallet_address:wallet,stock_mint:stock.mint,raw_balance:b.rawBaseUnits,active_multiplier:b.multiplier.active,decimals:b.decimals,balance_slot:b.balanceSlot,mint_slot:b.mintSlot,chain_timestamp:b.chainTime,observed_at:new Date().toISOString(),token_accounts:b.tokenAccounts};
      // Concurrent/repeated requests preserve the first enrollment and baseline.
      await trackingRequest('dividend_tracking?on_conflict=user_id,wallet_address,stock_mint',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({user_id:userId,wallet_address:wallet,stock_mint:stock.mint,symbol:stock.symbol,baseline})});
      tracking=await readTracking(userId,wallet,stock.mint);
      if(!tracking)throw new Error('Enrollment not persisted');
    }
    return Response.json({wallet,tracking},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}

export async function PATCH(request:Request) {
  try {
    if(process.env.DIVIDEND_EXECUTION_ENABLED==='true')return Response.json({error:'Checkpoint updates are unavailable while automatic conversions are enabled.'},{status:409});
    const {userId,wallet}=await requireWallet(request);
    const body=z.object({symbol:z.enum(assets.map(a=>a.symbol)),acknowledgeFutureOnly:z.literal(true)}).strict().safeParse(await request.json());
    if(!body.success)return Response.json({error:'Confirm that only dividends after the new checkpoint can qualify.'},{status:400});
    const stock=assets.find(a=>a.symbol===body.data.symbol)!;
    const tracking=await readTracking(userId,wallet,stock.mint);
    if(!tracking)return Response.json({error:'Enable tracking first.'},{status:409});
    const current=(await readBalances(wallet)).find(b=>b.mint===stock.mint)!;
    const baseline=forwardCheckpoint(tracking.baseline,current);
    await trackingRequest('rpc/restart_dividend_checkpoint',{method:'POST',body:JSON.stringify({p_user_id:userId,p_tracking_id:tracking.id,p_expected_baseline_id:tracking.baseline.id,p_baseline:baseline})});
    return Response.json({wallet,tracking:await readTracking(userId,wallet,stock.mint)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
