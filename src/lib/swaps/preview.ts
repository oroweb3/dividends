import 'server-only';
import { prepareTitanSwap } from '../titan/simulate';
import { assertPreviewUnchanged,assertMinimumOutput } from './recheck';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { address } from '@solana/kit';
import type { Stock } from '../xstocks/assets';
import { inspectDividend } from '../dividends/inspect';
import { calculateDividend } from '../dividends/calculate-dividend';
import { getGoldQuote } from '../titan/quote';
import { rpc,TOKEN_2022 } from '../solana/rpc';
import { formatUnits } from '../solana/amounts';
import { signPreview, type Preview } from './preview-token';
export class PreviewBlocked extends Error {constructor(public reasons:string[]){super(reasons.join(' '));}}
async function buildGoldPreview(userId:string,wallet:string,stock:Stock,previous?:Preview){
 const started=Date.now();
 const check=await inspectDividend(userId,wallet,stock);
 if(!check.historyVerified||!check.event?.multiplierOld||!check.event.multiplierNew)throw new PreviewBlocked(check.blockers.length?check.blockers:['Dividend evidence unavailable.']);
 const calculation=calculateDividend({rawBalance:BigInt(check.current.rawBaseUnits),decimals:check.current.decimals,oldMultiplier:check.event.multiplierOld,newMultiplier:check.event.multiplierNew});
 if(calculation.status!=='calculable')throw new PreviewBlocked(['The dividend is too small to convert.']);
 const outputMint=process.env.ORO_GOLD_MINT?.trim();
 if(!outputMint)throw new PreviewBlocked(['GOLD mint is not configured.']);
 address(outputMint);
 const mintSchema=z.object({value:z.object({
  owner:z.string(),
  data:z.object({parsed:z.object({type:z.literal('mint'),info:z.object({isInitialized:z.literal(true),decimals:z.number().int().min(0).max(255)})})}),
 })});
 const mint=mintSchema.parse(await rpc('getAccountInfo',[outputMint,{encoding:'jsonParsed',commitment:'finalized'}]));
 if(![TOKEN_2022,'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'].includes(mint.value.owner))throw new PreviewBlocked(['Unsupported GOLD mint program.']);
 const fingerprint=dividendFingerprint(check);
 const amount=calculation.rawAmountToSell.toString();
 if(previous){try{assertPreviewUnchanged(previous,{fingerprint,inputMint:stock.mint,outputMint,amount});}catch{throw new PreviewBlocked(['Holdings, dividend details, destination, or preview validity changed. Request a new preview.']);}}
 const quote=await getGoldQuote(stock.mint,outputMint,amount,wallet);
 if(previous){try{assertMinimumOutput(previous,quote.otherAmountThreshold);}catch{throw new PreviewBlocked(['The fresh quote no longer meets your preview’s minimum GOLD output. Request a new preview.']);}}
 // App freshness limit, not a promise about transaction/blockhash validity.
 const providerExpiry=quote.expireAt?Date.parse(quote.expireAt):Infinity;
 const expiresAt=Math.min(started+30000,providerExpiry,previous?.expiresAt??Infinity);
 if(!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new PreviewBlocked(['Quote expired while checking. Request a new preview.']);
 let prepared:Awaited<ReturnType<typeof prepareTitanSwap>>|null=null;
 if(previous){
  try{prepared=await prepareTitanSwap({route:quote.rawRoute,wallet,inputMint:stock.mint,outputMint,amount,minimum:quote.otherAmountThreshold,sourceAccounts:check.current.tokenAccounts,expiresAt,expiresAfterSlot:quote.expiresAfterSlot});}
  catch{throw new PreviewBlocked(['Transaction validation or unsigned simulation did not pass. The route may be unsupported, expired, or lack stock or sponsor funding. No conversion is authorized.']);}
 }
 const simulation=prepared?.simulation??null;
 const token=signPreview({userId,wallet,symbol:stock.symbol,fingerprint,inputMint:stock.mint,outputMint,amount,minimumOutput:quote.otherAmountThreshold,expiresAt},process.env.SWAP_PREVIEW_SECRET??'');
 const publicResult={simulation,token,expiresAt,rawAmount:amount,rawTokensToSell:calculation.rawTokensToSell,remainingExposure:calculation.remainingExposure,expectedGold:formatUnits(BigInt(quote.outAmount),mint.value.data.parsed.info.decimals),minimumGold:formatUnits(BigInt(quote.otherAmountThreshold),mint.value.data.parsed.info.decimals),outputMint,router:quote.router,feeBps:quote.feeBps,feeMint:quote.feeMint,slippageBps:quote.slippageBps,executionEnabled:process.env.DIVIDEND_EXECUTION_ENABLED==='true',preflightPassed:!!previous,notice:simulation?'Checks passed. Oro covers network fees and any required GOLD account creation. Nothing has been reserved, signed, or submitted.':'Preview only. Recheck validates supported Titan instructions and runs an unsigned simulation. Network fees and rent are not yet estimated.'};
 return {publicResult,prepared,check,quote,outputMint,amount,fingerprint,expiresAt};
}
export async function createGoldPreview(...args:Parameters<typeof buildGoldPreview>){return (await buildGoldPreview(...args)).publicResult;}
export async function prepareGoldConversion(userId:string,wallet:string,stock:Stock,previous:Preview){return buildGoldPreview(userId,wallet,stock,previous);}


export function dividendFingerprint(check:Awaited<ReturnType<typeof inspectDividend>>){return createHash('sha256').update(JSON.stringify({quoteProvider:'titan-v1',tracking:check.trackingId,event:check.event,raw:check.current.rawBaseUnits,decimals:check.current.decimals,multiplier:check.current.multiplier,accounts:[...check.current.tokenAccounts].sort((a,b)=>a.address.localeCompare(b.address))})).digest('hex');}
