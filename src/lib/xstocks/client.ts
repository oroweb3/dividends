import 'server-only';
import { z } from 'zod';
import type { Stock } from './assets';
import { actionPageSchema, type CorporateAction } from './schemas';
import { dividendEvents } from './corporate-actions';
const base = 'https://api.xstocks.fi/api/v2/public';
async function get(path: string) {
  const response = await fetch(`${base}${path}`, {cache:'no-store', signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Issuer data unavailable');
  return response.json();
}
export async function getIssuerData(stock: Stock) {
  const actions = async (kind: 'history' | 'upcoming') => {
    const all: CorporateAction[] = [];
    for (let page=1;page<=20;page++) {
      const data=actionPageSchema.parse(await get(`/corporate-actions/${kind}?symbol=${stock.symbol}&pageSize=100&page=${page}`));
      if (data.page.currentPage !== page) throw new Error('Issuer pagination mismatch');
      all.push(...data.nodes);
      if (!data.page.hasNextPage) return all;
    }
    throw new Error('Issuer history exceeds inspection limit'); // Never silently truncate.
  };
  const results=await Promise.allSettled([
    get(`/assets/${stock.symbol}/price-data`).then(d=>z.object({quote:z.number().finite().nonnegative().nullable()}).parse(d).quote),
    get(`/assets/${stock.symbol}/multiplier?network=Solana`).then(d=>z.object({currentMultiplier:z.number().positive(),newMultiplier:z.number().nonnegative(),activationDateTime:z.number().nonnegative(),reason:z.string().nullable()}).parse(d)),
    Promise.all([actions('history'),actions('upcoming')]).then(([a,b])=>dividendEvents([...a,...b],stock.symbol)),
  ]);
  const [price,multiplier,events]=results;
  return { price:price.status==='fulfilled'?price.value:null, issuerMultiplier:multiplier.status==='fulfilled'?multiplier.value:null,
    events:events.status==='fulfilled'?events.value:null,
    warnings: results.flatMap((r,i)=>r.status==='rejected'?[['Indicative price unavailable','Issuer multiplier unavailable','Corporate actions unavailable; no dividend conclusion can be drawn'][i]]:[]),
  };
}
