# Connected dividend execution

The server now connects verified eligibility, Titan preparation/simulation, reservation, durable transaction storage, delegated signing, submission and finalized confirmation/reconciliation. Live execution is disabled in the current environment and the user's delegation remains revoked.

## Entry points

- `POST /api/swaps/execute`: authenticated user; `{symbol, requestId, token}`. The token is a server-signed preview. Input amount, wallet, recipient, transaction bytes and signer are never accepted from the client. The server rechecks before reserving and before signing.
- `POST /api/swaps/status`: authenticated user; `{symbol, requestId}`. Looks up only this user's matching wallet/stock claim, reconciles a known signature and may rebroadcast identical stored bytes only when execution/permission/expiry checks permit it. No fresh signing on retries.
- `POST /api/jobs/dividends`: secret-authenticated queued batch; body `{}`. Shares the scheduler lease with GET cron runs. Monitors accounts even with execution disabled; execution requires independent fresh checks.
- `node --env-file=.env scripts/run-dividend-job.cjs`: processes one bounded queue batch against DIVIDEND_APP_URL (defaults to localhost), authenticating with server-only DIVIDEND_JOB_SECRET. HTTPS required outside localhost. The production Vercel cron ticks every minute.

DIVIDEND_JOB_SECRET was generated locally without displaying it. Do not copy it into a NEXT_PUBLIC variable. DIVIDEND_EXECUTION_ENABLED is false/unset. Do not enable until funded live validation and rollout checks are complete.

## Transaction identity and retries

Preparation returns unsigned bytes only through a server-internal function; preview APIs return summaries. After reservation, a new eligibility observation permits only the exact owned reserved claim. Holdings/event fingerprints must match. The original Titan route and blockhash lifetime are reused for another simulation, and the complete transaction hash must remain unchanged.

Database reservation amount must equal the verified sale amount. The journal persists the bytes, hash and quote expiry before acquiring the atomic signing gate. Privy returns a signature over those exact bytes; the app verifies Ed25519 cryptographically and saves it before broadcast. Submission failures retain the request and transaction identity. Confirmations require finalized chain evidence. Ambiguous signing, expired transactions and changed evidence require review, with no reservation release or replacement signing.

The dashboard stores the request ID by wallet/stock across reloads. A failed response prompts status recovery, not a new request. Only a confirmed request with a verified rollover can be dismissed to start a later event. Background retries reconcile existing pending claims, even if delegation was revoked.

## Validation and limits

49 tests pass, including connected orchestration with controlled dependencies, real local cryptographic signatures, unchanged pinned transaction bytes, retry behavior, failure before reserve/persistence/signing, and simulation effects. A two-connection PostgreSQL test observed lock contention and verified exactly one worker acquired the signing gate; synthetic records were removed. Production build/lint pass. The authenticated local job returned disabled and did no processing.

This does not constitute successful live funded Titan simulation, Privy policy enforcement against a real transaction, or onchain execution. These remain required before live enablement. The background job is deployed with a once-per-minute Vercel cron. Existing V1 restrictions remain: uncertain indexed history/changed holdings block conversion; program allowlisting alone does not establish dividend eligibility or enforce principal protection.

Migration 005 (baseline rollover) is applied alongside 001–004. Its SQL checks passed on the configured Supabase database; synthetic fixtures were rolled back.

## Baseline rollover after finalization

Confirmed status recovery verifies the exact journaled signed transaction against finalized RPC bytes and metadata. It proves the reserved stock debit, checks complete indexed history while exempting only that exact conversion, and compares every remaining stock account with a later finalized balance read. Another deposit/withdrawal, missing history, a newer multiplier or mismatched effects leaves rollover pending. Both the dashboard and worker retry this verification; they do not replace the original transaction.

Migration 005 captures immutable rollover context when execution is prepared. The atomic service-only rollover function locks the claim and tracking row, requires the same baseline lineage, records an append-only before/after audit row, updates the current baseline and marks the claim complete. Retries are idempotent. `initial_baseline` and `enabled_at` preserve original enrollment. Existing executions without captured context cannot be silently backfilled. A checkpoint recorded after another dividend cannot qualify that earlier dividend.

Run `node --env-file=.env scripts/baseline-rollover.cjs` for rollback-only database checks. Add `--apply` to commit the migration after tests pass; test fixtures are always removed. Application tests exercise two checkpoint cycles and reject changed balances, missing metadata, wrong debits, same-slot observations and incorrect history exemptions. This verifies implementation behavior, not a funded live conversion.

## Gas sponsorship

All newly prepared production swaps require the configured Oro sponsor. There is no automatic fallback to charging the user. Provider instructions are first validated against the user wallet. Only the validated GOLD associated-account creation payer is changed to the sponsor; the transaction fee payer is also the sponsor. The sponsor cannot appear in the provider swap accounts, preventing the swap CPI from accessing sponsor funds. Simulation requires unchanged user SOL, exact sponsor fee/rent debit, the exact stock debit and minimum GOLD output. Routes needing additional user-funded internal accounts are rejected.

Before signing, live Privy reads verify the sponsor address, wallet ID, dedicated authorization quorum and exact existing program policy. Migration 006 reserves the simulated maximum fee/rent cost and consumes the signing gate atomically. UTC-day reservation limits: 0.1 SOL and 100 attempts globally; 0.02 SOL and 10 attempts per user; maximum 0.0101 SOL per transaction (network fee cap 0.0001 SOL plus account rent cap 0.01 SOL). These are ceilings, not estimates. Concurrent workers share an advisory database lock. Failed or ambiguous attempts retain their budget reservation for the day. These budget controls are enforced by the backend/database, not by the Privy program allowlist alone.

The user's delegated wallet and sponsor wallet each receive identical unsigned bytes in separate Privy signTransaction requests with distinct, claim-bound idempotency keys. Both signatures are cryptographically verified and combined. Only fully signed bytes are persisted and then broadcast. The first (sponsor) signature is the Solana transaction ID used by reconciliation and baseline rollover. Historical single-signer executions remain verifiable. A crash or uncertain response during either signing request requires review; no replacement transaction or fresh signing is attempted.

Sponsor variables are backend-only: PRIVY_SPONSOR_AUTHORIZATION_PRIVATE_KEY, PRIVY_SPONSOR_OWNER_ID, PRIVY_SPONSOR_WALLET_ID, PRIVY_SPONSOR_WALLET_ADDRESS and PRIVY_SPONSOR_POLICY_ID. The removed PRIVY_SPONSOR_SIGNER_ID alias is not used. Setup script verifies/provisions the wallet; it does not enable execution. Fund the configured sponsor with mainnet SOL before live testing. User stock funding, prospective enrollment and delegation are still needed.

Validation: controlled zero-user-SOL simulation with account creation, exact payer rewrite, two real locally generated signatures, tampering/missing-signature rejection, sponsor over-debit and user SOL mutation rejection. SQL tests cover wrong owner, per-transaction/user/global limits, retries and expired quotes. A real two-connection test observed lock contention and rejected a competing distinct claim exceeding the user budget; synthetic records removed. No live Privy signing, funded Titan execution or onchain rollover has been performed.

Sources: [Solana fee sponsorship](https://solana.com/developers/cookbook/transactions/fee-sponsorship), [Privy signTransaction](https://docs.privy.io/api-reference/wallets/solana/sign-transaction).

## Efficient monitoring queue (migration 008)

A cron tick claims up to 20 due accounts just in time, with three concurrent monitoring workers. It stops starting new work after two minutes; a ten-minute global lease and per-account leases cover interruptions. SQL uses FOR UPDATE SKIP LOCKED. Healthy accounts are due every five minutes; failed checks back off from five minutes to one hour. Heavy checks/backlogs can extend the interval. Execution-enabled batches remain serial to respect Titan's single-flight constraint. POST manual jobs use the same queue/lease; the old cursor body is no longer accepted.

One queue row and one current monitoring row exist per enrollment. Scheduling metadata (next due, last checked, failure count) still updates per check; this is bounded operational state, not an accumulating history. Monitoring observations are canonicalized without read slots, clocks, prices or unrelated transaction counts. Unchanged fingerprints skip the write request; the database also suppresses identical upserts atomically. A current account lease is required to save changed observations. Monitor changed_at is the last meaningful change, not the last check—use queue last_checked_at for that.

Routine monitoring never updates dividend_verifications. Interactive/pre-conversion checks retain fresh full evidence and the existing 30-second reservation constraint. Conversion journals, original enrollment and rollover evidence are unchanged. Issuer requests are shared once per stock within a batch only; this is not a global persistent event cache or webhook system. Every account is still periodically polled. Wallet webhooks and event-triggered fanout remain future work.

Validation: 55 application tests; rollback SQL tests proved unchanged monitor rows retain their physical tuple and timestamp, changed observations update, stale workers fail, and retry intervals increase. A real two-connection check proved a worker skips the other worker's locked row. Migration008 applied; fixtures removed.
