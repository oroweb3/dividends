// Exact decimal display from raw integer units. Never Number(rawBalance).
export function decimalParts(value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.');
  return { numerator: BigInt(whole + fraction), scale: fraction.length };
}
export function formatUnits(amount: bigint, decimals: number): string {
  if (amount < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Invalid amount');
  if (!decimals) return amount.toString();
  const digits = amount.toString().padStart(decimals + 1, '0');
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(/\.?0+$/, '') || '0';
}
export function scaledBalance(raw: bigint, decimals: number, multiplier: string) {
  const {numerator, scale} = decimalParts(multiplier);
  return formatUnits(raw * numerator, decimals + scale);
}
export function sameDecimal(a: string, b: string) {
  const x=decimalParts(a), y=decimalParts(b);
  return x.numerator * 10n ** BigInt(y.scale) === y.numerator * 10n ** BigInt(x.scale);
}
