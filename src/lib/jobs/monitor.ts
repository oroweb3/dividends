import 'server-only';
import {trackingRequest} from '../supabase/tracking';
import {monitoringFingerprint} from '../dividends/monitor-state';
export async function saveMonitorChange(trackingId:string,runId:string,observation:unknown){
 const fingerprint=monitoringFingerprint(observation);
 const query=new URLSearchParams({tracking_id:`eq.${trackingId}`,select:'fingerprint',limit:'1'});
 const existing=await trackingRequest(`dividend_monitor_state?${query}`);
 if(existing[0]?.fingerprint===fingerprint)return false;
 // Atomic comparison and live lease check also guard concurrent/stale workers.
 return trackingRequest('rpc/record_dividend_monitor_change',{method:'POST',body:JSON.stringify({p_tracking_id:trackingId,p_run_id:runId,p_fingerprint:fingerprint,p_observation:observation})});
}
