import 'server-only';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export class AuthError extends Error {}
export async function requireWallet(request: Request) {
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new AuthError('Sign in to view your stocks');
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID, secret=process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new Error('Server authentication is not configured');
  // Same JWKS endpoint as @privy-io/node 0.34.0 src/lib/auth.ts.
  jwks ??= createRemoteJWKSet(new URL(`https://api.privy.io/v1/apps/${encodeURIComponent(appId)}/jwks.json`),{timeoutDuration:10000,headers:{'privy-app-id':appId,Authorization:`Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`}});
  let userId: string;
  try {
    const {payload}=await jwtVerify(token,jwks,{algorithms:['ES256'],issuer:'privy.io',audience:appId,requiredClaims:['sub','exp','iat','sid'],typ:'JWT'});
    userId=z.string().startsWith('did:privy:').parse(payload.sub);
  } catch {throw new AuthError('Your session could not be verified. Please sign in again.');}
  return readUserWallet(userId);
}
/** Internal worker lookup. Never expose this as an unauthenticated user endpoint. */
export async function readUserWallet(userId:string){
  z.string().startsWith('did:privy:').parse(userId);
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET;
  if(!appId||!secret)throw new Error('Server authentication is not configured');
  const response=await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}`,{headers:{'privy-app-id':appId,Authorization:`Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Unable to verify wallet ownership');
  const user=z.object({id:z.literal(userId),linked_accounts:z.array(z.object({id:z.string().optional(),type:z.string(),chain_type:z.string().optional(),wallet_client_type:z.string().optional(),wallet_index:z.number().optional(),address:z.string().optional()}))}).parse(await response.json());
  const wallet=user.linked_accounts.find(a=>a.type==='wallet'&&a.chain_type==='solana'&&a.wallet_client_type==='privy'&&(a.wallet_index===undefined||a.wallet_index===0));
  if (!wallet?.address) throw new AuthError('Create your Dividend Account first');
  return {userId,wallet:wallet.address,walletId:wallet.id};
}
