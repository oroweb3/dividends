export function verifySwapEffects(e:{stockBefore:bigint;stockAfter:bigint;input:bigint;goldBefore:bigint;goldAfter:bigint;minimum:bigint;solBefore:bigint;solAfter:bigint;fee:bigint;rent:bigint}){
 if(e.input<=0n||e.minimum<=0n||e.stockAfter<0n||e.goldBefore<0n||e.goldAfter<0n||e.fee<0n||e.rent<0n)throw new Error('Invalid simulation amounts');
 if(e.stockBefore-e.stockAfter!==e.input)throw new Error('Simulated stock debit mismatch');
 if(e.goldAfter-e.goldBefore<e.minimum)throw new Error('Simulated GOLD receipt below minimum');
 if(e.fee>100000n||e.rent>10000000n||e.solBefore-e.solAfter<0n||e.solBefore-e.solAfter>e.fee+e.rent)throw new Error('Unexpected SOL debit');
}
