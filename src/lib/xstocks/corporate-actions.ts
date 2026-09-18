import type { CorporateAction } from './schemas';

// Resolve corrections/cancellations BEFORE filtering. A cancelled later version
// must suppress the older cash-dividend version of the same issuer event.
export function dividendEvents(events: CorporateAction[], symbol: string) {
  const latest = new Map<string, CorporateAction>();
  for (const event of events) {
    const previous = latest.get(event.eventId);
    if (!previous || event.version > previous.version ||
      (event.version === previous.version && (event.status === 'Cancelled' ||
       (previous.status !== 'Cancelled' && event.createdTimeUtc > previous.createdTimeUtc)))) {
      latest.set(event.eventId, event);
    }
  }
  return [...latest.values()].filter(e => e.xstockSymbol === symbol && e.caType === 'CashDividend' && e.status !== 'Cancelled')
    .sort((a,b) => (b.effectiveTimeUtc ?? '').localeCompare(a.effectiveTimeUtc ?? ''));
}
