import { requireWallet,AuthError } from '@/lib/privy/server';
import { getDelegation } from '@/lib/privy/delegation';
export async function GET(request:Request){
 try{const {wallet,walletId}=await requireWallet(request);return Response.json(await getDelegation(wallet,walletId),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return Response.json({error:error instanceof AuthError?error.message:'Could not verify automation permissions. Try again.'},{status:error instanceof AuthError?401:503,headers:{'Cache-Control':'no-store'}});}
}
