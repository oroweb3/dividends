/** Pure math only: callers must independently prove cash-dividend eligibility,
 * historical holdings and onchain activation before preparing any transaction.
 * Multipliers are exact decimal strings, never JS numbers. Returned exposures
 * are token-denominated decimal strings; transaction amounts are raw base units.
 */
export type DividendInput = {
  rawBalance: bigint;
  decimals: number;
  oldMultiplier: string;
  newMultiplier: string;
};
const U64_MAX = (1n << 64n) - 1n;

function parseMultiplier(value: string) {
  if (typeof value !== 'string' || value.length > 128 || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Multiplier must be a positive plain decimal string (max 128 characters)');
  }
  const [whole, fraction = ''] = value.split('.');
  const coefficient = BigInt(whole + fraction);
  if (coefficient === 0n) throw new Error('Multiplier must be positive');
  return { coefficient, scale: fraction.length };
}
function units(value: bigint, scale: number) {
  if (scale === 0) return value.toString();
  const digits = value.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') || '0';
}
function prepare(input: DividendInput) {
  if (typeof input.rawBalance !== 'bigint' || input.rawBalance < 0n || input.rawBalance > U64_MAX) {
    throw new Error('Raw balance must be a nonnegative u64 bigint');
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 255) {
    throw new Error('Decimals must come from the mint and be an integer from 0 to 255');
  }
  const old = parseMultiplier(input.oldMultiplier);
  const next = parseMultiplier(input.newMultiplier);
  const scale = Math.max(old.scale, next.scale);
  const oldCoefficient = old.coefficient * 10n ** BigInt(scale - old.scale);
  const newCoefficient = next.coefficient * 10n ** BigInt(scale - next.scale);
  if (newCoefficient < oldCoefficient) throw new Error('A decreasing multiplier is not a positive dividend');
  return { oldCoefficient, newCoefficient, scale: scale + input.decimals };
}

export function calculateDividend(input: DividendInput) {
  const { oldCoefficient, newCoefficient, scale } = prepare(input);
  const previous = input.rawBalance * oldCoefficient;
  const current = input.rawBalance * newCoefficient;
  const dividend = current - previous;
  // Floor to whole raw base units: rounding up would sell original exposure.
  const rawAmountToSell = dividend / newCoefficient;
  const remainingRawBalance = input.rawBalance - rawAmountToSell;
  const remaining = remainingRawBalance * newCoefficient;
  const retained = remaining - previous;
  return {
    previousExposure: units(previous, scale),
    newExposure: units(current, scale),
    dividendExposure: units(dividend, scale),
    rawAmountToSell,
    rawTokensToSell: units(rawAmountToSell, input.decimals),
    remainingRawBalance,
    remainingExposure: units(remaining, scale),
    convertedExposure: units(rawAmountToSell * newCoefficient, scale),
    retainedDividendExposure: units(retained, scale),
    oneBaseUnitExposure: units(newCoefficient, scale),
    status: dividend === 0n ? 'no-dividend' as const : rawAmountToSell === 0n ? 'below-one-base-unit' as const : 'calculable' as const,
  };
}

/** Checks the stock side against a confirmed post-transaction raw balance.
 * This does not verify GOLD receipts, transaction success, transfer fees, or
 * intervening movements. Callers must reconcile those separately.
 */
export function verifyRemainingExposure(input: DividendInput, actualRemainingRawBalance: bigint) {
  if (typeof actualRemainingRawBalance !== 'bigint' || actualRemainingRawBalance < 0n || actualRemainingRawBalance > U64_MAX) {
    throw new Error('Remaining raw balance must be a nonnegative u64 bigint');
  }
  const { oldCoefficient, newCoefficient, scale } = prepare(input);
  const target = input.rawBalance * oldCoefficient;
  const actual = actualRemainingRawBalance * newCoefficient;
  return {
    preserved: actual >= target,
    withinRoundingBound: actual >= target && actual - target < newCoefficient,
    targetExposure: units(target, scale),
    actualExposure: units(actual, scale),
    shortfallExposure: units(actual < target ? target - actual : 0n, scale),
  };
}
