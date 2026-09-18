import 'server-only';
import {monitoringObservation} from './monitor-state';
import type { Stock } from '@/lib/xstocks/assets';
import { getIssuerData } from '@/lib/xstocks/client';
import { readBalances } from '@/lib/solana/balances';
import { readTracking, trackingRequest } from '@/lib/supabase/tracking';
import { baselineBlocker, compareHoldings, enrollmentBlocker } from '@/lib/dividends/eligibility';
import { eventObservation } from '@/lib/xstocks/multipliers';
import { inspectIndexedHistory } from '@/lib/solana/history';
export async function inspectDividend(userId:string,wallet:string,stock:Stock,reservedClaimId?:string,monitor?:{issuer:Promise<Awaited<ReturnType<typeof getIssuerData>>>}) {
    const [issuer,balances,stored]=await Promise.all([monitor?.issuer??getIssuerData(stock),readBalances(wallet),readTracking(userId,wallet,stock.mint)]);
    const current=balances.find(b=>b.mint===stock.mint)!;
    const snapshot=stored?.baseline??null;
    const event=issuer.events?.find(e=>e.effectiveTimeUtc&&Date.parse(e.effectiveTimeUtc)<=current.chainTime*1000);
    const blockers:string[]=[];
    if(!stored)blockers.push('Enable dividend tracking before a future dividend to record starting holdings.');
    if(!event)blockers.push(issuer.events===null?'Issuer events unavailable.':'No past cash dividend is available for inspection.');
    else {
      const enrollmentReason=enrollmentBlocker(stored?.enabled_at??null,event.effectiveTimeUtc!);
      if(enrollmentReason)blockers.push(enrollmentReason);
      if(eventObservation(event,current.multiplier,current.chainTime)!=='activation-observed')blockers.push('The dividend is not matched to an active onchain multiplier update.');
      if(!event.multiplierOld)blockers.push('The issuer has not provided the pre-dividend multiplier.');
      else {const reason=baselineBlocker(snapshot,Date.parse(event.effectiveTimeUtc!)/1000,event.multiplierOld);if(reason)blockers.push(reason);}
    }
    if(snapshot && compareHoldings(snapshot,current)!=='unchanged')blockers.push('Balances or token accounts changed since the checkpoint. Conversion is blocked.');
    let history:null|Awaited<ReturnType<typeof inspectIndexedHistory>>=null;
    if(snapshot&&snapshot.balance_slot<=current.balanceSlot) {
      try {history=await inspectIndexedHistory(wallet,snapshot.balance_slot,current.mintSlot,stock.mint,[...snapshot.token_accounts.map(a=>a.address),...current.tokenAccounts.map(a=>a.address)]);}
      catch {history={status:'incomplete',signatures:0,reason:'Transaction history could not be retrieved.'};}
      if(history.status!=='no-activity-observed')blockers.push(history.reason);
    }
    if(!history)blockers.push('No complete history interval was checked.');
    if(event){
      const query=new URLSearchParams({select:'id,user_id,status',wallet_address:`eq.${wallet}`,stock_mint:`eq.${stock.mint}`,event_id:`eq.${event.eventId}`,limit:'1'});
      const claims=await trackingRequest(`dividend_claim_reservations?${query}`);
      if(claims.length&&!(claims.length===1&&claims[0].id===reservedClaimId&&claims[0].user_id===userId&&claims[0].status==='reserved'))blockers.push('This dividend already has a reservation. It cannot be converted again.');
    }
    const historyVerified=blockers.length===0;
    let verificationId:string|null=null;
    if(stored&&event&&!reservedClaimId&&!monitor){
      const observations=await trackingRequest('dividend_verifications?on_conflict=tracking_id,event_id',{
        method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({tracking_id:stored.id,event_id:event.eventId,event_version:event.version,
          checked_at:new Date().toISOString(),status:historyVerified?'history-checked':'blocked',
          evidence:{blockers,history,fromSlot:snapshot?.balance_slot,toSlot:current.mintSlot,event,current}}),
      });
      verificationId=observations[0]?.id??null;
    }
    return {monitorObservation:monitor?monitoringObservation({baselineId:snapshot?.id??null,event,upcoming:(issuer.events??[]).filter(e=>e.effectiveTimeUtc&&Date.parse(e.effectiveTimeUtc)>current.chainTime*1000),blockers,history,current}):null,verificationId,historyVerified,blockers,history,event,snapshot,current,trackingId:stored?.id??null};
}
