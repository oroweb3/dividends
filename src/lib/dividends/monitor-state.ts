import {createHash} from 'node:crypto';
import canonicalize from 'canonicalize';
/** Exclude observation clocks, slots, prices and unrelated transaction counts. */
export function monitoringObservation(input:{baselineId:string|null;event:unknown;upcoming:unknown[];blockers:string[];history:{status:string;reason:string}|null;current:{rawBaseUnits:string;decimals:number;multiplier:unknown;tokenAccounts:{address:string;rawBaseUnits:string}[]}}){
 return {baselineId:input.baselineId,event:input.event??null,upcoming:input.upcoming,blockers:[...new Set(input.blockers)].sort(),history:input.history?{status:input.history.status,reason:input.history.reason}:null,current:{rawBaseUnits:input.current.rawBaseUnits,decimals:input.current.decimals,multiplier:input.current.multiplier,tokenAccounts:[...input.current.tokenAccounts].sort((a,b)=>a.address.localeCompare(b.address))}};
}
export function monitoringFingerprint(observation:unknown){return createHash('sha256').update(canonicalize(observation)??'null').digest('hex');}
