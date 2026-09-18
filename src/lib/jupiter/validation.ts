import { z } from 'zod';
const raw=z.string().regex(/^\d+$/).max(20).refine(s=>BigInt(s)>0n&&BigInt(s)<2n**64n);
export const quoteSchema=z.object({inputMint:z.string(),outputMint:z.string(),inAmount:raw,outAmount:raw,otherAmountThreshold:raw,swapMode:z.literal('ExactIn'),slippageBps:z.number().int().min(0).max(50),router:z.string(),feeBps:z.number().int().nonnegative(),feeMint:z.string(),priceImpactPct:z.string().optional(),expireAt:z.string().optional(),errorCode:z.number().optional(),error:z.string().optional()});
export function validateQuote(value:unknown,inputMint:string,outputMint:string,amount:string){
 const quote=quoteSchema.parse(value);
 if(quote.errorCode!==undefined||quote.error||quote.inputMint!==inputMint||quote.outputMint!==outputMint||quote.inAmount!==amount)throw new Error('Quote does not match the requested dividend');
 const minimum=BigInt(quote.otherAmountThreshold), output=BigInt(quote.outAmount);
 if(minimum>output||minimum<output*9950n/10000n)throw new Error('Quote output protection is invalid');
 return quote;
}
