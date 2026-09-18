import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export const previewSchema=z.object({userId:z.string(),wallet:z.string(),symbol:z.string(),fingerprint:z.string(),inputMint:z.string(),outputMint:z.string(),amount:z.string().regex(/^\d+$/),minimumOutput:z.string().regex(/^\d+$/),expiresAt:z.number().int().safe()});
export type Preview=z.infer<typeof previewSchema>;
function mac(body:string,secret:string){if(secret.length<32)throw new Error('Preview signing is not configured');return createHmac('sha256',secret).update('dividend-preview-v1:'+body).digest();}
export function signPreview(preview:Preview,secret:string){const body=Buffer.from(JSON.stringify(previewSchema.parse(preview))).toString('base64url');return body+'.'+mac(body,secret).toString('base64url');}
export function readPreview(token:string,secret:string,userId:string,wallet:string,now=Date.now()){
 if(token.length>8192)throw new Error('Invalid preview');
 const parts=token.split('.');if(parts.length!==2)throw new Error('Invalid preview');
 const expected=mac(parts[0],secret),actual=Buffer.from(parts[1],'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid preview');
 const p=previewSchema.parse(JSON.parse(Buffer.from(parts[0],'base64url').toString()));
 if(p.userId!==userId||p.wallet!==wallet)throw new Error('Preview belongs to a different account');
 if(p.expiresAt<=now)throw new Error('Preview expired. Request a fresh preview.');
 return p;
}
