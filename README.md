# Dividends by Oro

Standalone Next.js / TypeScript app built for the **Stocklana hackathon**. The product uses Oro's logo, Ortica headings, and Instrument Sans from `web-v3`. The local project directory remains `stocklana`.

## Current scope

**September 23 update:** The current app supports 20 assets, tracking, eligibility checks, sponsored delegated execution, reconciliation and checkpoint rollover. Production activation was approved and reported completed by the user on September 23; no genuine dividend has yet completed live conversion. The 30 connected lifecycle scenarios and 60 existing tests pass. Use [production rollout and recovery](docs/production-rollout.md) and [HANDOFF.md](HANDOFF.md) for current state. The phase-by-phase notes below are historical and contain superseded implementation status.

Phase 1: Privy email authentication, a user-owned Solana embedded wallet, address display/copy, and sign-out. Fresh wallet creation and persistence through refresh and re-login were verified. Wallet creation is an explicit **Create Dividend Account** action after SDK initialization; login-time automatic creation stalled during initial testing. Slow setup states show recovery after 20 seconds without starting a concurrent creation request.

Phase 2: AAPLx, SPYx, and NVDAx mainnet balances, exact decimal economic-balance display, mint-derived decimals, Token-2022 scaled UI multiplier inspection, issuer indicative prices, issuer corporate-action history/upcoming data, and development snapshot capture. Trading, preferences, offline monitoring, dividend entitlement calculation, and execution are **not implemented**.

## Run locally

Node.js 22.12+ and npm:

```sh
npm ci
cp .env.example .env.local
# Fill in credentials. Existing .env is also supported by Next.js.
npm run dev
```

Open http://127.0.0.1:3000/dashboard. Enable email login and Solana embedded wallets in your Privy app; allow your actual local origin. Public environment changes require a restart (and a rebuild for production).

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_PRIVY_APP_ID | Public Privy app ID |
| NEXT_PUBLIC_PRIVY_CLIENT_ID | Optional app client ID |
| PRIVY_APP_SECRET | Server-side Privy identity lookup |
| SOLANA_RPC_URL | Solana mainnet RPC; network verified via genesis hash |
| SUPABASE_PROJECT_ID | Project reference; derives https://PROJECT.supabase.co |
| SUPABASE_URL | Optional explicit URL override |
| SUPABASE_SERVICE_ROLE_KEY | Server-only snapshot table access |
| ORO_GOLD_MINT | Reserved for later swap phases |

No xStocks key is needed for the public v2 endpoints. Never prefix server secrets with NEXT_PUBLIC_. Environment files are ignored except .env.example.

## Create the snapshot table

Run `supabase/migrations/202609170001_balance_snapshots.sql` in your project's Supabase SQL Editor. The REST service-role key cannot run DDL. RLS is enabled and anon/authenticated grants are revoked; only server-side service-role select/insert is allowed.

On the dashboard, expand **Development: balance snapshots** and choose **Save current balance snapshot**. Saving fetches fresh onchain balances on the server; it does not trust client-supplied amounts, identities, or timestamps. Duplicate observations at the same wallet/mint/balance-slot/mint-slot are ignored by a unique constraint.

The migration was applied and snapshot persistence verified on 2026-09-17: authenticated capture saved AAPLx and SPYx observations, and both rows were read back from Supabase. The empty test wallet had zero raw balances. Both records retain unverified eligibility.

## Security and data interpretation

- Every stock and snapshot request verifies the Privy ES256 access token, issuer, audience, expiry, and required claims. The server retrieves the verified user's primary linked embedded Solana wallet directly from Privy.
- Token verification uses `jose` and Privy's official JWKS endpoint (also used in @privy-io/node 0.34.0's `src/lib/auth.ts`). That SDK's optional Solana peer conflicts with this app's Solana Kit version, so the documented JWT/REST integration is used instead.
- Provider keys remain server-only. Errors do not expose RPC URLs, upstream response bodies, or credentials.
- Only allowlisted official Solana mints are read. Decimals come from the mint. All owned Token-2022 accounts for a mint are summed as BigInt.
- Balance reads and mint/clock reads have separate finalized slots, both stored. These are observation checkpoints, **not atomic historical entitlement snapshots**.
- Active multipliers use Solana's clock, not the browser clock. Economic display uses integer arithmetic on decimal multiplier strings; this is not a transaction amount or a guarantee of identical floating-point rounding to Token-2022 instructions.
- The current issuer API uses `caType: CashDividend` (the conceptual docs call dividends DVCA). Latest event versions are resolved before filtering; splits, unknown types, and cancellations are excluded. Pagination is checked; failures never appear as an empty successful feed.
- `activation-observed` requires matching old/new multiplier values and activation timestamp between the issuer event and current mint, plus elapsed chain time. It does not prove historical user holdings, continuous observation, or an entitlement to convert.
- Upcoming events must have future effective times. The issuer's upcoming feed contains past-dated Scheduled records; the app does not treat those as future dividends or paid entitlements.
- Raw balance history, transfer reconciliation, historical token-account ownership, opt-in cutoffs, and event-scoped eligibility must be implemented before any dividend conversion. Deposits must not be mistaken for dividends. Missing history blocks conversion. No current snapshot is retroactively assigned to an earlier dividend.

## Files

- `src/lib/xstocks/`: curated assets, runtime schemas, paginated issuer reads, event classification and multiplier matching.
- `src/lib/solana/`: RPC reads, mint validation, raw balances, exact display arithmetic.
- `src/lib/privy/server.ts`: verified token and wallet ownership checks.
- `src/lib/supabase/snapshots.ts`: server-only snapshot persistence.
- `src/app/api/stocks/route.ts`: authenticated read-only overview.
- `src/app/api/snapshots/route.ts`: authenticated capture of current observations.
- `src/components/stocks-panel.tsx`: stock cards and expandable inspection screen.
- `supabase/migrations/`: database setup.
- `tests/stock-data.test.ts`: corrections, cancellations, split exclusions, activation boundaries and large integer precision.

## Validation

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Verified with live configured services: Supabase HTTP 200, mainnet genesis, both Token-2022 mints, authenticated dashboard price/balance/multiplier/event reads, and Apple event-to-mint match. Unauthenticated GET /api/stocks and invalid-token POST /api/snapshots return 401. The empty test wallet correctly displays zero balances. Snapshot capture and database read-back were also verified after applying the migration.

Dependencies currently report 25 npm audit advisories (24 moderate, one high), primarily in upstream Privy wallet connector dependencies. No forced SDK downgrade was applied.

## Official references

- https://docs.xstocks.fi/apis/openapi (v2 schema, inspected 2026-09-17)
- https://docs.xstocks.fi/developers/multipliers
- https://solana.com/docs/tokens/extensions/scaled-ui-amount
- https://solana.com/docs/rpc/http/gettokenaccountsbyowner
- https://solana.com/docs/rpc/http/getmultipleaccounts
- https://docs.privy.io/authentication/user-authentication/access-tokens
- https://docs.privy.io/api-reference/users/get
- https://supabase.com/docs/guides/api

## Phase 3 — dividend arithmetic

`src/lib/dividends/calculate-dividend.ts` implements pure `calculateDividend` and `verifyRemainingExposure` functions. Inputs are a raw base-unit bigint (u64 range), mint-supplied decimals, and positive plain decimal multiplier strings. Exponential notation and JS number multipliers are rejected; multiplier inputs are bounded to 128 characters. This computes exact arithmetic for the supplied decimal representation, not Token-2022's internal floating-point rounding.

The raw amount to sell is floored: `rawBalance * (newMultiplier - oldMultiplier) / newMultiplier`. The remaining exposure is at least the original exposure; retained dividend dust is strictly smaller than the economic value of one raw base unit. Zero balances, unchanged multipliers, and sub-base-unit dividends produce no sale. Decreasing multipliers fail closed. The return value includes before/after exposure, dividend exposure, raw sale and remaining balance, converted exposure, and retained dividend dust.

Example with 8 decimals: 10 raw tokens and multipliers 1 → 1.002 produce 0.02 dividend exposure. Sell 1,996,007 base units (0.01996007 raw tokens), leaving economic exposure 10.00000000986.

`verifyRemainingExposure` checks confirmed post-transaction raw balances against the original target and the conservative rounding bound. It does not prove transaction success, GOLD receipt, fees, absence of intervening transfers, or eligibility. No live event is made convertible by Phase 3; historical ownership, confirmed dividend classification/activation, and execution reconciliation remain prerequisites.

Validation: 14 tests pass, including 10,000 deterministic invariant cases, maximum u64, high-precision multiplier increments, differing decimal scales, tiny dividends, invalid inputs, and overselling by one base unit. Lint and production build also pass.

## Holdings-history inspection (conservative, not yet an eligibility authorization)

The authenticated `POST /api/eligibility` route accepts only an allowlisted symbol. It obtains the wallet from verified Privy identity, reads the latest saved checkpoint for that user/wallet/mint, fetches fresh issuer/mint state, compares raw balances and token-account sets, and scans finalized signatures since the checkpoint for the wallet and known token accounts. The UI exposes this as **Check dividend eligibility** inside each stock's inspection panel.

Checks reject absent/late checkpoints, mismatched multipliers, changed balances/accounts, and any successful known-address transaction (including zero-net activity). History checks are capped at 12 addresses and 500 signatures per address; reaching a cap or provider failure is incomplete, never a successful empty history. Numeric database fields are selected as text to preserve precision.

**Limit:** This route always returns `eligible: false`. It is diagnostic groundwork, not complete historical reconciliation. Ordinary address-history exhaustion cannot prove provider coverage or discover every closed/temporarily owned account. Opt-in history is also not implemented. The route deliberately cannot authorize a conversion until those proofs exist. It reads the latest checkpoint, so a later checkpoint may conservatively block a dividend even when older records exist. No database eligibility field is promoted and no transaction is prepared.

Next implementation requirement: event-scoped pre-activation baselines, durable opt-in timestamps, a provider-supported complete ownership/transaction history (including closed accounts and CPI transfers), reconciliation through a fresh execution boundary, and integration with idempotent execution. The initial unchanged-position path must be validated with historical fixtures and live provider coverage before enabling conversion.

## Dividend tracking enrollment

Apply `supabase/migrations/202609170002_dividend_tracking.sql` after the original snapshot migration. This migration has been prepared locally, not applied to the hosted database.

The authenticated `/api/tracking` endpoint records the first per-user, per-wallet, per-stock enrollment with a database timestamp and server-read nonzero starting holdings. Repeated and concurrent requests preserve the first baseline. No client-supplied address or amount is accepted. Dashboard stock cards expose enrollment and its persisted activation time. Tracking does not grant trading authorization.

Eligibility inspection now uses the enrollment baseline instead of the latest development snapshot. Late enrollment, changed holdings, unavailable history, or multiplier mismatch block historical verification. Helius's indexed `tokenAccounts: all` lookup includes owner-indexed token account activity; V1 conservatively blocks **all successful wallet activity**, including unrelated activity, rather than interpreting individual instructions. An empty terminal response is provider-backed evidence, not an independent proof of index completeness. The checkpoint slot itself is included because balance and mint observations are separate. Future checks cannot automatically roll the original baseline forward after a dividend or position change.

Results are stored once per tracking record and issuer event, with subsequent checks updating that observation. This deduplicates verification records only: **it is not a payment claim or double-spend guard**. `eligible` remains false. Atomic claim reservation, fresh execution-time checks, transaction reconciliation, and finer per-stock history interpretation remain unimplemented. The friend's public wallet has not been enrolled or linked to any app user.


## Stock-specific inspection and claim reservation (2026-09-18)

Supersedes the all-wallet-activity blocking rule above: full parsed history now checks references to the selected mint and observed token accounts. Parsed unrelated activity can pass. Target references block even at zero net change; missing metadata, opaque token instructions, invalid ranges, cursor loops and pagination exhaustion fail closed. This is deliberately conservative, and a target mint reference involving another owner may still block. Coverage continues to depend on Helius's owner index.

`202609180003_dividend_claim_reservations.sql` adds an internal, service-role-only reservation function. It requires recent successful verification, derives the amount with exact numeric integer division, and enforces uniqueness on wallet/mint/event independently of user/enrollment. The same request identifier returns its existing reservation; a different request cannot create another claim. Reservations never expire automatically. The server helper is not exposed through an API and no signing or submission is enabled.

Validation: 23 unit tests, lint and TypeScript checks pass. The new SQL has not been applied or run against PostgreSQL. Enrollment write/idempotency and concurrent reservation integration tests are still pending: local Docker was unavailable and the temporary PostgreSQL runtime installation was declined. No synthetic records were inserted into the hosted project. Do not treat the reservation infrastructure as validated payment execution; signing, submission and reconciliation remain unimplemented.

## GOLD previews and fresh preflight checks

The stock details now include a quote preview and a separate recheck action. Authenticated `/api/swaps/preview` and `/api/swaps/preflight` derive the wallet, eligible event, and exact raw input on the server. Shared `inspectDividend` logic checks enrollment, holdings, issuer/mint activation, indexed history and existing claim reservations. Preview requests cannot select an arbitrary amount or destination.

Quotes use the current Jupiter Swap V2 `/order` endpoint with no taker, ExactIn and 50 bps slippage. No transaction is requested. Reference: https://developers.jup.ag/docs/api-reference/swap/order . `JUPITER_API_KEY` is required (not configured when implementation began). `SWAP_PREVIEW_SECRET` was generated locally without displaying it; set a separate random secret in deployment. No new SQL migration is required.

Previews show unscaled input quantity, retained economic exposure, expected/minimum GOLD, router, Jupiter fee and expiry. GOLD decimals are read from the configured onchain mint. Network fees/rent are explicitly not estimated. Server HMAC tokens bind account, wallet, stock/event/holdings fingerprint, amount, destination, minimum output and expiry. Recheck fetches new evidence and a new quote and rejects changed evidence, expired tokens or a worse minimum. The application TTL is at most 30 seconds, shortened by any provider expiry.

This is a preflight check, NOT transaction-level validation or an execution permission. No signing/submission endpoint or claim reservation is triggered by these actions. Transaction decoding, simulation, account-extension/fee validation, fee funding, atomic reservation integration and post-submission reconciliation still need implementation before trading. Eligibility can change after any read. Live Jupiter testing requires the API key and an eligible account; unit tests cover tampering, account binding, expiry, amount/mint mismatches and output protection.

## Active provider: Titan

Titan now supplies preview and preflight quotes; Jupiter adapter is dormant and its environment key was left untouched. TITAN_AUTH_TOKEN and TITAN_WS_URL were copied locally from the existing web-v3 environment without displaying credentials. They are only used by the server. No config route exposes them to browsers.

The official SDK is pinned in package.json. Each request opens a bounded connection, reads server settings, requests ExactIn with 50 bps slippage and the authenticated wallet, reads up to three updates, and closes the connection. SDK-generated instructions are discarded, not delivered for signing. At most one quote request is active per process; this is not a distributed quota limiter. Credentials also serve the existing production app, so subscription-wide quotas must still be confirmed with Titan.

Live read-only checks succeeded: production settings reported 20 concurrent streams per connection, 400 ms minimum update interval and 800 ms default. These are connection settings, not a guarantee of unlimited organisation throughput. NVDAx → GOLD returned a validated quote at a 100,000,000 raw input sample. A 3,598 raw input sample returned only one output base unit and was rejected because the calculated minimum rounded to zero. These were quote probes, not eligible claims or trades.

Normalizer preserves bigint amounts and rejects unsafe JS integers, mismatched amount/mints/mode, expired routes, excessive slippage and nonzero/unknown platform fee treatment. Minimum GOLD is explicitly a calculated preview floor; validating the actual threshold encoded in Titan instructions remains required before execution. Network fees, rent, route fees and token-extension behavior need transaction-level checks. No new SQL migration or Jupiter API key is required for this switch.

## Titan unsigned transaction audit and simulation

Recheck now retains the selected raw Titan route on the server, explicitly requests V2, and validates its instruction constraints before unsigned simulation. Source schema: https://github.com/Titan-Pathfinder/titan-v2-cpi-example/blob/main/titan_swap.json (inspected September 2026). Supported top-level instructions are one Titan `swap_route_v2`, optional idempotent creation of the user's GOLD ATA, and provider compute-budget instructions that are discarded and replaced with a local 1.4M-unit cap and zero priority fee. Other instructions fail closed. The validator checks the Titan program/discriminator, signer, atlas PDA, source, recipient ATA, mint/program identities, raw input, minimum output and zero provider/service fee fields. It does not independently decode every nested venue payload; that route executes only in unsigned simulation under the Titan program, and signing remains disabled.

The transaction is locally compiled as v0 using chain-fetched active lookup tables and a fresh blockhash. Required signers must consist only of the authenticated wallet. The unsigned bytes never leave the server except to the configured RPC for simulation. There is no `sendTransaction` call. `simulateTransaction` uses `sigVerify:false`, no blockhash replacement, and returns writable-account states. The app checks exact stock debit, GOLD ownership/receipt, unchanged token account authorities/configuration, fee/rent bounds, and route expiry. Routes involving another writable token account owned by this wallet are rejected. Active transfer hooks, transfer fees, frozen accounts, paused mints and unsupported top-level instructions block this version. These conservative restrictions may reject otherwise valid routes.

Network fees are fetched for the exact message; estimated account rent comes from the simulated new GOLD account. Caps: 100,000 lamports network fee, 10,000,000 lamports new account rent. Priority fees are zero for this simulation-only stage. Simulation result returns a transaction hash and effects, never transaction bytes. A simulation result is not an execution authorization or guarantee against subsequent state changes.

Validation: live Titan instruction-byte audit passed on an unsigned NVDAx→GOLD quote. Unit tests cover altered amounts/minimums/accounts/signers/programs/fees and simulated stock/GOLD/SOL effects. A successful funded, eligible end-to-end simulation has not been completed. No claim was reserved and no funds moved. Execution still needs a fresh validated transaction, atomic reservation integration, signing controls and post-submission reconciliation.
