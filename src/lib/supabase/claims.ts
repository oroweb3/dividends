import 'server-only';
import { z } from 'zod';
import { trackingRequest } from './tracking';
/** Internal executor primitive. Never call from a browser or an eligibility
 * preview. Requires fresh verification; reservations do not authorize signing.
 * Keep requestId stable across retries and do not auto-release uncertain claims.
 */
export async function reserveDividendClaim(userId:string,verificationId:string,requestId:string) {
  z.string().uuid().parse(verificationId);
  z.string().uuid().parse(requestId);
  const id=await trackingRequest('rpc/reserve_dividend_claim',{method:'POST',body:JSON.stringify({p_user_id:userId,p_verification_id:verificationId,p_request_id:requestId})});
  return z.string().uuid().parse(id);
}
