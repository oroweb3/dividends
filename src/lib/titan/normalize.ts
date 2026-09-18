import { getBase58Decoder } from '@solana/kit';
export function exactUint(value:unknown):bigint {
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw new Error('Unsafe token integer');
 if(typeof value!=='bigint'&&typeof value!=='number')throw new Error('Invalid token integer');
 const result=BigInt(value);if(result<0n||result>=2n**64n)throw new Error('Token integer outside u64');return result;
}
export function normalizeTitan(value:unknown,inputMint:string,outputMint:string,amount:string,now:number,slot:number){
 if(!value||typeof value!=='object')throw new Error('Missing Titan quote');
 const packet=value as Record<string,unknown>;
 const decode=(v:unknown)=>{if(!(v instanceof Uint8Array)||v.length!==32)throw new Error('Invalid mint');return getBase58Decoder().decode(v);};
 if(decode(packet.inputMint)!==inputMint||decode(packet.outputMint)!==outputMint||packet.swapMode!=='ExactIn'||exactUint(packet.amount).toString()!==amount)throw new Error('Titan quote mismatch');
 if(!packet.quotes||typeof packet.quotes!=='object')throw new Error('Missing Titan routes');
 const candidates=[];
 for(const [provider,raw] of Object.entries(packet.quotes)){
  try{
   const route=raw as Record<string,unknown>;
   const input=exactUint(route.inAmount),output=exactUint(route.outAmount);
   if(input.toString()!==amount||output===0n||route.slippageBps!==50)continue;
   let expiry=now+15000;
   if(route.expiresAtMs!==undefined){const n=Number(exactUint(route.expiresAtMs));if(!Number.isSafeInteger(n)||n<=now)continue;expiry=Math.min(expiry,n);}
   if(route.expiresAfterSlot!==undefined&&exactUint(route.expiresAfterSlot)<=BigInt(slot))continue;
   // This preview floor is not proof of the threshold encoded in instructions.
   const minimum=output*9950n/10000n;if(minimum===0n)continue;
   const fee=route.platformFee as {amount?:unknown;feeBps?:number;fee_bps?:number}|undefined;
   // No app fee is requested. Unknown/nonzero fee treatment is not accepted yet.
   if(fee&&(exactUint(fee.amount??0)!==0n||(fee.feeBps??fee.fee_bps??0)!==0))continue;
   candidates.push({rawRoute:raw,provider,expiresAfterSlot:route.expiresAfterSlot,inputMint,outputMint,inAmount:amount,outAmount:output.toString(),otherAmountThreshold:minimum.toString(),swapMode:'ExactIn' as const,slippageBps:50,router:`Titan / ${provider}`,feeBps:0,feeMint:outputMint,expireAt:new Date(expiry).toISOString()});
  }catch{continue;}
 }
 candidates.sort((a,b)=>BigInt(a.outAmount)>BigInt(b.outAmount)?-1:BigInt(a.outAmount)<BigInt(b.outAmount)?1:0);
 if(!candidates.length)throw new Error('No valid Titan route for this amount');
 return candidates[0];
}
