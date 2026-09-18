import 'server-only';
import { z } from 'zod';
import { requireWallet,AuthError } from '../privy/server';
import { assets } from '../xstocks/assets';
import { createGoldPreview,PreviewBlocked } from './preview';
import { readPreview } from './preview-token';
export async function handlePreview(request:Request,recheck:boolean){
 try{
  const {userId,wallet}=await requireWallet(request);
  const body=z.object({symbol:z.enum(assets.map(a=>a.symbol)),token:z.string().max(8192).optional()}).strict().safeParse(await request.json());
  if(!body.success)return Response.json({error:'Invalid preview request.'},{status:400});
  let previous;
  if(recheck){
   try{previous=readPreview(body.data.token??'',process.env.SWAP_PREVIEW_SECRET??'',userId,wallet);}
   catch{throw new PreviewBlocked(['Preview is invalid or expired. Request a new preview.']);}
   if(previous.symbol!==body.data.symbol)throw new PreviewBlocked(['Preview stock mismatch.']);
  }
  const result=await createGoldPreview(userId,wallet,assets.find(a=>a.symbol===body.data.symbol)!,previous);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof PreviewBlocked)return Response.json({error:error.message,blockers:error.reasons},{status:409});
  return Response.json({error:error instanceof AuthError?error.message:'Preview unavailable. Check server configuration or retry. No conversion was authorized.'},{status:error instanceof AuthError?401:503});
 }
}
