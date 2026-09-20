# tokens.xyz coverage audit — September 20, 2026

Checked at 2026-09-20T18:24:17.281Z. Used 19 sequential authenticated GET requests, at most 50 mints each. All 928 requested mints returned; 103 had non-null market data, 101 had positive prices. Missing cached data is not proof of permanent unsupported status. No authentication material is included.

Price source for the current three assets: Birdeye via tokens.xyz. lastFetchedAt is provider cache fetch time, not independently proven price observation time. lastTradeAt is separate. Price units relative to the Token-2022 scaled-UI multiplier are not specified in the examined tokens.xyz docs; do not calculate portfolio value until established.

No dashboard integration or production environment change made. Key authenticated successfully; exact numeric rate limits, monthly allowance and billing terms remain unverified. This audit completed without HTTP errors.

## Current assets

| Asset | Returned USD price | Cache age at audit (minutes) |
|---|---:|---:|
| SPYx | 762.6966 | 34.2 |
| NVDAx | 221.1471 | 8.7 |
| AAPLx | 333.8302 | 5.8 |

## Highest reported 24h volume among priced catalog mints

Snapshot ranking from market.volume24hUSD, not executionQuality.volume24hUSD (different measurement). Not dividend-paying-only. No liquidity, advisory or freshness eligibility filter applied.

| Asset | Reported 24h USD volume |
|---|---:|
| SPYx | 34,172,523.99 |
| SPCXx | 11,463,469.43 |
| GLDx | 9,458,276.07 |
| NVDAx | 4,993,988.74 |
| GOOGLx | 2,624,343.92 |
| CRCLx | 2,514,453.44 |
| MSFTx | 2,390,778.59 |
| PLTRx | 2,134,969.33 |
| METAx | 2,118,851.83 |
| TSLAx | 1,528,832.44 |

Docs: https://docs.tokens.xyz/v1/endpoints/assets ; https://docs.tokens.xyz/v1/rate-limits-and-errors . Full per-mint results are in adjacent JSON.
