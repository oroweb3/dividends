import { AuthError, requireWallet } from '@/lib/privy/server';
import { readBalances } from '@/lib/solana/balances';
import { saveSnapshots } from '@/lib/supabase/snapshots';
export const runtime='nodejs';
export async function POST(request: Request) {
  try {
    const {userId,wallet}=await requireWallet(request);
    // Never accept client-supplied balances, timestamps, user IDs or wallets.
    const balances=await readBalances(wallet);
    await saveSnapshots(userId,wallet,balances);
    return Response.json({saved:true,count:balances.length,eligibility:'unverified'},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return Response.json({error:error instanceof AuthError?error.message:'Snapshot could not be saved. Check database setup and RPC availability.'},{status:error instanceof AuthError?401:503});
  }
}
