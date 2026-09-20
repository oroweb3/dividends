# Pyth onchain coverage audit — 2026-09-20

## Results

Checked 928 official catalog entries with a Solana deployment. Exact stable Pyth matches: 672. Existing standard accounts: 37 across 35 assets. Sponsored matches: GLXYx only.

- no-exact-stable-metadata-match: 256
- no-standard-account: 637
- stale-standard-account: 34
- recent-weekend-reference: 1

AAPLx last update: August 14. NVDAx and SPYx: August 26. GLXYx: September 18, consistent with a weekend reference, not a live Sunday price. No paid endpoint, signing or posting updates was used. No app configuration or asset allowlist changed.

## Method and limits

Catalog fetched with page=0 onward, pageSize=100, terminating at hasNextPage=false; symbols checked for duplicates. Matched Equity.{listingCountry}.{underlyingSymbol}/{currency} in stable Pyth symbol metadata. This avoids ticker collisions across exchanges. Non-USD quotes require FX conversion for USD portfolio values. Missing exact matches may need manual alias review and do not prove Pyth has no equivalent product. Catalog metadata is not proof that every mint is active, liquid, or ready for conversion.

Derived shard-0 PDAs under both documented push oracle programs and queried finalized getMultipleAccounts. For existing accounts checked receiver owner, PriceUpdateV2 discriminator, Full verification and embedded feed ID, then decoded publish time. No arbitrary shards, transient update accounts, third-party updater guarantees or legacy pre-receiver accounts were audited. A single snapshot cannot prove ongoing update reliability. Other integrations may publish elsewhere.

Sources:
- https://api.xstocks.fi/api/v2/public/assets
- https://pyth.dourolabs.app/v1/symbols (public metadata used by Pyth documentation; not a price subscription)
- https://docs.pyth.network/price-feeds/core/push-feeds/solana
- https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/solana
- https://raw.githubusercontent.com/pyth-network/pyth-crosschain/main/target_chains/solana/pyth_solana_receiver_sdk/src/price_update.rs

Full account addresses, feed IDs, slots, quote currencies and timestamps are in the adjacent JSON. RPC URL and credentials are excluded.

## Assets with an existing standard account

| Asset | Latest publish time (UTC) | Sponsored |
|---|---|---|
| VRTXx | 2026-05-19T18:14:12+00:00 | False |
| VOOx | 2026-07-02T19:44:47+00:00 | False |
| HIMSx | 2026-05-19T18:14:12+00:00 | False |
| SNDKx | 2026-07-06T17:17:51+00:00 | False |
| STRCx | 2026-08-14T20:00:17+00:00 | False |
| IWMx | 2026-07-02T19:22:15+00:00 | False |
| RKLBx | 2026-05-19T18:14:12+00:00 | False |
| GLXYx | 2026-09-18T23:59:47+00:00 | True |
| MSTRx | 2026-08-14T20:00:21+00:00 | False |
| CRCLx | 2026-08-26T15:54:46+00:00 | False |
| GLDx | 2026-08-17T19:49:59+00:00 | False |
| QQQx | 2026-09-11T23:59:59+00:00 | False |
| SPYx | 2026-08-26T15:54:46+00:00 | False |
| COINx | 2026-08-14T20:00:21+00:00 | False |
| GMEx | 2026-08-14T20:00:21+00:00 | False |
| CRWDx | 2026-05-19T14:35:18+00:00 | False |
| HOODx | 2026-08-14T20:00:20+00:00 | False |
| PLTRx | 2026-07-02T20:00:18+00:00 | False |
| DHRx | 2026-05-06T17:59:05+00:00 | False |
| MCDx | 2026-08-14T20:00:20+00:00 | False |
| TMOx | 2026-05-06T17:58:54+00:00 | False |
| NVOx | 2026-05-06T17:58:49+00:00 | False |
| KOx | 2026-08-14T20:00:17+00:00 | False |
| PEPx | 2026-08-14T20:00:20+00:00 | False |
| LLYx | 2026-05-06T17:58:40+00:00 | False |
| XOMx | 2026-08-14T20:00:19+00:00 | False |
| UNHx | 2026-05-19T18:14:12+00:00 | False |
| TSLAx | 2026-09-11T23:59:59+00:00 | False |
| AVGOx | 2026-05-19T14:35:18+00:00 | False |
| GOOGLx | 2026-08-14T20:00:20+00:00 | False |
| METAx | 2026-08-14T20:00:20+00:00 | False |
| AMZNx | 2026-08-20T19:35:00+00:00 | False |
| MSFTx | 2026-08-14T20:00:20+00:00 | False |
| NVDAx | 2026-08-26T15:54:46+00:00 | False |
| AAPLx | 2026-08-14T20:00:19+00:00 | False |
