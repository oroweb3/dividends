import {timingSafeEqual} from 'node:crypto';
export function jobAuthorized(header:string|null,secret:string|undefined){
 const provided=header?.match(/^Bearer (\S+)$/)?.[1];
 return !!secret&&secret.length>=32&&!!provided&&Buffer.byteLength(secret)===Buffer.byteLength(provided)&&timingSafeEqual(Buffer.from(secret),Buffer.from(provided));
}
