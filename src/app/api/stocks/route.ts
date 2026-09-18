import { AuthError, requireWallet } from '@/lib/privy/server';
import { stockOverview } from '@/lib/xstocks/overview';
export const runtime='nodejs';
export async function GET(request: Request) {
  try {
    const {wallet}=await requireWallet(request);
    return Response.json(await stockOverview(wallet),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return Response.json({error:error instanceof AuthError?error.message:'Stock data could not be loaded. Please retry.'},{status:error instanceof AuthError?401:503,headers:{'Cache-Control':'no-store'}});
  }
}
