import { sameDecimal } from '../solana/amounts';
import type { CorporateAction } from './schemas';
export type MultiplierState = { previous: string; next: string; effectiveTimestamp: number; active: string };
export function selectMultiplier(previous: string, next: string, effectiveTimestamp: number, chainTime: number): MultiplierState {
  return {previous, next, effectiveTimestamp, active: chainTime >= effectiveTimestamp ? next : previous};
}
export function eventObservation(event: CorporateAction, mint: MultiplierState, chainTime: number) {
  if (event.caType !== 'CashDividend' || event.status === 'Cancelled') return 'excluded';
  if (!event.effectiveTimeUtc || !event.multiplierOld || !event.multiplierNew) return 'awaiting-issuer-details';
  const activation = Date.parse(event.effectiveTimeUtc) / 1000;
  if (!sameDecimal(event.multiplierOld, mint.previous) || !sameDecimal(event.multiplierNew, mint.next) || activation !== mint.effectiveTimestamp) return 'not-matched-to-current-mint';
  return chainTime >= activation ? 'activation-observed' : 'scheduled-onchain';
}
