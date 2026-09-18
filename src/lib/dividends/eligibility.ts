import { z } from 'zod';
import { sameDecimal } from '../solana/amounts';
export const snapshotSchema=z.object({
  id:z.string(),user_id:z.string(),wallet_address:z.string(),stock_mint:z.string(),
  raw_balance:z.string().regex(/^\d+$/),active_multiplier:z.string().regex(/^\d+(\.\d+)?$/),
  decimals:z.number().int(),balance_slot:z.number().int().safe(),mint_slot:z.number().int().safe(),
  chain_timestamp:z.number().int().safe(),observed_at:z.string(),
  token_accounts:z.array(z.object({address:z.string(),rawBaseUnits:z.string().regex(/^\d+$/)})),
});
export type Snapshot=z.infer<typeof snapshotSchema>;
export function compareHoldings(snapshot: Snapshot, current: {rawBaseUnits:string;decimals:number;tokenAccounts:{address:string;rawBaseUnits:string}[]}) {
  if (snapshot.decimals!==current.decimals) return 'decimals-changed';
  if (snapshot.raw_balance!==current.rawBaseUnits) return 'balance-changed';
  const a=new Map(snapshot.token_accounts.map(t=>[t.address,t.rawBaseUnits]));
  if (a.size!==snapshot.token_accounts.length || a.size!==current.tokenAccounts.length || current.tokenAccounts.some(t=>a.get(t.address)!==t.rawBaseUnits)) return 'token-accounts-changed';
  return 'unchanged';
}
export function baselineBlocker(snapshot: Snapshot|null, activation: number, oldMultiplier: string) {
  if (!snapshot) return 'No recorded balance checkpoint exists.';
  if (!Number.isFinite(activation) || !Number.isFinite(Date.parse(snapshot.observed_at))) return 'Checkpoint timing is invalid.';
  if (snapshot.chain_timestamp>=activation || Date.parse(snapshot.observed_at)>=activation*1000) return 'This checkpoint was recorded after the dividend. It cannot establish pre-dividend holdings.';
  if (!sameDecimal(snapshot.active_multiplier,oldMultiplier)) return 'The checkpoint multiplier does not match the pre-dividend multiplier.';
  if (BigInt(snapshot.raw_balance)===0n) return 'No stock was held at the recorded checkpoint.';
  return null;
}

export function enrollmentBlocker(enabledAt:string|null,effectiveAt:string) {
  if(!enabledAt)return 'Dividend tracking was not enabled before this event.';
  const enabled=Date.parse(enabledAt), effective=Date.parse(effectiveAt);
  if(!Number.isFinite(enabled)||!Number.isFinite(effective)||enabled>=effective)return 'Tracking began too late for this dividend. Only future dividends can qualify.';
  return null;
}
