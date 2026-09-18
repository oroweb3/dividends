import 'server-only';
import {z} from 'zod';
import {requireWallet,AuthError} from '../privy/server';
import {assets} from '../xstocks/assets';
import {convertDividend,conversionStatus} from './convert';
import {PreviewBlocked} from './preview';
export async function handleConversion(request:Request,statusOnly=false){
 const headers={'Cache-Control':'no-store'};
 try{
  const {userId,wallet,walletId}=await requireWallet(request);
  if(!walletId)throw new PreviewBlocked(['Wallet signing identity is unavailable.']);
  const parsed=z.object({symbol:z.enum(assets.map(a=>a.symbol)),requestId:z.string().uuid(),token:z.string().max(8192).optional()}).strict().safeParse(await request.json());
  if(!parsed.success)return Response.json({error:'Invalid conversion request.'},{status:400,headers});
  const {symbol,requestId,token}=parsed.data,stock=assets.find(a=>a.symbol===symbol)!;
  const result=statusOnly?await conversionStatus(userId,wallet,walletId,stock,requestId):await convertDividend(userId,wallet,walletId,stock,requestId,token);
  return Response.json(result??{status:'not-found'},{headers});
 }catch(error){return Response.json({error:error instanceof AuthError||error instanceof PreviewBlocked?error.message:'Conversion could not be confirmed. Check its status using the same request; do not start another conversion.'},{status:error instanceof AuthError?401:error instanceof PreviewBlocked?409:503,headers});}
}
