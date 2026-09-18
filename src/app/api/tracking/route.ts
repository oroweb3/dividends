import { z } from 'zod';
import { requireWallet, AuthError } from '@/lib/privy/server';
import { assets } from '@/lib/xstocks/assets';
import { readBalances } from '@/lib/solana/balances';
import { readTracking, trackingRequest } from '@/lib/supabase/tracking';
export const runtime='nodejs';
function failure(error:unknown) {
  return Response.json({error:error instanceof AuthError?error.message:error instanceof Error&&error.message.startsWith('Apply the dividend')?error.message:'Dividend tracking unavailable. Please retry.'},{status:error instanceof AuthError?401:503});
}
export async function GET(request:Request) {
  try {
    const {userId,wallet}=await requireWallet(request);
    const tracking=await Promise.all(assets.map(async stock=>({symbol:stock.symbol,tracking:await readTracking(userId,wallet,stock.mint)})));
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
