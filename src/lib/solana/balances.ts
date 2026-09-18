import 'server-only';
import { z } from 'zod';
import { assets } from '../xstocks/assets';
import { positiveDecimal } from '../xstocks/schemas';
import { selectMultiplier } from '../xstocks/multipliers';
import { formatUnits, scaledBalance } from './amounts';
import { MAINNET_GENESIS, rpc, TOKEN_2022 } from './rpc';
const context=z.object({slot:z.number().int().nonnegative().safe()});
const parsedAccount=z.object({owner:z.string(),data:z.object({parsed:z.object({type:z.string(),info:z.unknown()})})});
const tokenInfo=z.object({mint:z.string(),owner:z.string(),tokenAmount:z.object({amount:z.string().regex(/^\d+$/),decimals:z.number().int().min(0).max(255)})});
const mintInfo=z.object({decimals:z.number().int().min(0).max(255),isInitialized:z.literal(true),extensions:z.array(z.object({extension:z.string(),state:z.unknown()}))});
const scaled=z.object({multiplier:positiveDecimal,newMultiplier:positiveDecimal,newMultiplierEffectiveTimestamp:z.number().int().safe()});
export async function readBalances(wallet: string) {
  if (await rpc('getGenesisHash') !== MAINNET_GENESIS) throw new Error('SOLANA_RPC_URL must point to mainnet');
  const accounts=z.object({context,value:z.array(z.object({pubkey:z.string(),account:parsedAccount}))}).parse(await rpc('getTokenAccountsByOwner',[wallet,{programId:TOKEN_2022},{encoding:'jsonParsed',commitment:'finalized'}]));
  const balances=assets.map(stock=>{
    const owned=accounts.value.map(a=>({address:a.pubkey,...tokenInfo.parse(a.account.data.parsed.info),program:a.account.owner,type:a.account.data.parsed.type})).filter(a=>a.mint===stock.mint);
    if (owned.some(a=>a.owner!==wallet || a.program!==TOKEN_2022 || a.type!=='account')) throw new Error('Invalid token account');
    return {stock,owned,raw:owned.reduce((sum,a)=>sum+BigInt(a.tokenAmount.amount),0n)};
  });
  const mints=z.object({context,value:z.array(parsedAccount.nullable())}).parse(await rpc('getMultipleAccounts',[[...assets.map(a=>a.mint),'SysvarC1ock11111111111111111111111111111111'],{encoding:'jsonParsed',commitment:'finalized',minContextSlot:accounts.context.slot}]));
  const clock=mints.value[assets.length];
  if (!clock || clock.data.parsed.type!=='clock') throw new Error('Chain clock unavailable');
  const chainTime=z.object({unixTimestamp:z.number().int().safe()}).parse(clock.data.parsed.info).unixTimestamp;
  return balances.map(({stock,owned,raw},i)=>{
    const account=mints.value[i];
    if (!account || account.owner!==TOKEN_2022 || account.data.parsed.type!=='mint') throw new Error('Unsupported mint program');
    const mint=mintInfo.parse(account.data.parsed.info);
    if (owned.some(a=>a.tokenAmount.decimals!==mint.decimals)) throw new Error('Token decimals mismatch');
    const extension=mint.extensions.find(e=>e.extension==='scaledUiAmountConfig');
    if (!extension) throw new Error('Scaled UI Amount extension missing');
    const state=scaled.parse(extension.state);
    const multiplier=selectMultiplier(state.multiplier,state.newMultiplier,state.newMultiplierEffectiveTimestamp,chainTime);
    return {...stock,decimals:mint.decimals,rawBaseUnits:raw.toString(),rawBalance:formatUnits(raw,mint.decimals),economicBalance:scaledBalance(raw,mint.decimals,multiplier.active),multiplier,
      balanceSlot:accounts.context.slot,mintSlot:mints.context.slot,chainTime,tokenAccounts:owned.map(a=>({address:a.address,rawBaseUnits:a.tokenAmount.amount})),
      eligibility:'unverified' as const};
  });
}
