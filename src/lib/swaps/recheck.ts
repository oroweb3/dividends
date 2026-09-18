import type { Preview } from './preview-token';
export function assertPreviewUnchanged(previous:Preview,current:{fingerprint:string;inputMint:string;outputMint:string;amount:string},now=Date.now()){
 if(previous.expiresAt<=now)throw new Error('Preview expired');
 for(const field of ['fingerprint','inputMint','outputMint','amount'] as const)if(previous[field]!==current[field])throw new Error('Preview evidence changed');
}
export function assertMinimumOutput(previous:Preview,minimum:string){
 if(!/^\d+$/.test(minimum)||BigInt(minimum)<BigInt(previous.minimumOutput))throw new Error('Fresh minimum output is below the preview');
}
