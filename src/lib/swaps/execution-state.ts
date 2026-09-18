/** Recovery decisions never authorize another signature or a replacement swap. */
export type ExecutionState='prepared'|'signing'|'signed'|'submitted'|'confirmed'|'review-required';
export type ChainObservation={status:'confirmed'}|{status:'failed'}|{status:'not-found';blockHeight:number}|{status:'unavailable'};
export function recoveryAction(state:ExecutionState,observation:ChainObservation,lastValidBlockHeight:number){
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<0)throw new Error('Invalid transaction lifetime');
 if(state==='confirmed')return 'complete' as const;
 if(state==='review-required')return 'manual-review' as const;
 if(state==='prepared')return 'fresh-validation-required' as const;
 // A crash during signing is ambiguous: the request may have reached Privy.
 if(state==='signing')return 'manual-review' as const;
 if(observation.status==='confirmed')return 'mark-confirmed' as const;
 if(observation.status==='failed')return 'manual-review' as const;
 if(observation.status==='unavailable')return 'wait' as const;
 if(!Number.isSafeInteger(observation.blockHeight)||observation.blockHeight<0)throw new Error('Invalid chain height');
 if(observation.blockHeight>lastValidBlockHeight)return 'manual-review' as const;
 return 'rebroadcast-identical-bytes' as const;
}
