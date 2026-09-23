# Production activation and recovery

Current review: September 23, 2026. **Activation update:** the user checked the deployed settings, approved Production execution=true, and reported completing the change/redeploy. GitHub recorded deployment success at 13:18:26Z; subsequent scheduler checks were healthy with no claims/executions. The authenticated execution flag/banner has not been independently read back. The pre-activation checklist below records the earlier review and remains a reference for future deployments, not a request to repeat activation.

## Evidence and remaining configuration check

- `https://dividends.oro.finance/dashboard` serves the correctly branded application and email sign-in page. The browser was signed out; authenticated behavior on this custom origin was not reverified.
- Read-only production database check: job completed at `2026-09-23T11:42:31.464Z`; one enrollment, zero checks overdue by 15 minutes, zero failing accounts, zero claims/executions, and zero sponsor reservations for the UTC day. The five checked checkpoint/rollover/sponsor/queue/monitor functions exist.
- Live Privy read-back using local configuration verified the user authorization key/quorum and exact restricted policy, plus sponsor wallet ownership, separate sponsor key/quorum, and policy. Sponsor funding was verified; the private balance is omitted. These checks do not prove Vercel has identical environment values.
- Internal lifecycle: 30 connected scenarios and 60 existing tests passed; lint/build passed. See [test evidence](audits/automation-lifecycle-2026-09-23.md). The previous real principal swap succeeded; it is not a genuine dividend conversion and its authorization is consumed.
- Vercel browser access currently requires sign-in. Exact deployed environment scope/values, current deployment identity, and custom-origin authentication remain to be checked. No execution setting was changed. Do not infer a deployed flag's value from the signed-out page's static preview copy or the local `.env`.

## Configuration review before activation

In the existing Dividends Vercel project, confirm the current Production deployment and environment scope. Do not reveal or paste secret values into chat. Compare identities privately where possible; the presence of a variable is not proof it matches the verified local configuration.

- Public Privy app/client configuration belongs to the dedicated Dividends app; custom origin `https://dividends.oro.finance` works for email login and wallet access.
- Server-only Privy app secret, user authorization key/quorum/policy, and sponsor key/owner/wallet ID/address/policy match the verified setup. Never substitute signer ID for wallet ID.
- Mainnet RPC, Supabase project/service-role key, Oro GOLD mint, Titan URL/token, preview secret, `CRON_SECRET`, and manual-job secret are configured in Production. Tokens.xyz is display-only. Jupiter is unused.
- `DIVIDEND_EXECUTION_ENABLED` is currently false/unset and changes only in the intended deployment scope. Keep Preview and local execution disabled. Ensure previews do not run jobs against production financial state.
- `vercel.json` configures a minute cron at `/api/jobs/dividends`; recent DB timestamps provide evidence it is actually running. Healthy accounts are due about every five minutes, subject to batch capacity and provider latency. This is polling, not an immediate dividend webhook.

## Activation sequence

1. Complete the outstanding deployed-configuration and authenticated-domain checks. Record deployment ID/commit, timestamp, flag, queue health, and pending-claim count. Confirm an operator is available to observe the rollout and handle exceptions.
2. Obtain explicit approval for enabling automatic sales of verified dividend portions. This is a **global execution switch** for all enrolled, authorized, eligible accounts across the existing 20 assets; there is no implemented per-user canary switch or monetary per-conversion launch cap. The previous $1 principal test was not such a cap. No new deposit or fake dividend is required.
3. Set the Production `DIVIDEND_EXECUTION_ENABLED=true` and redeploy the reviewed version. Changing an environment value does not change the already-running deployment. Do not enable it in Preview/local environments. Do not manually run a job as a supposedly read-only check: an authorized job call can trade once execution is on.
4. Verify the new Production deployment is ready and the authenticated permission response reports execution enabled. Leave the existing schedule to process work. Confirm at least two subsequent cron runs complete and due accounts are being checked. No eligible dividend means no sale; that is expected.
5. Observe the first genuine eligible event through one reservation, one execution, finalized signature, exact stock debit/GOLD receipt and sponsor cost, and `rollover_status=complete`. Verify a later run cannot reserve that same event again. Preserve all journal and checkpoint evidence.

Users authorize delegation once; they do not need to manually approve each valid dividend. Tracking alone or merely granting delegation does not guarantee eligibility. Deposits, withdrawals, incomplete history, unmatched events, unsupported routes or inadequate sponsor funding can block conversion safely.

## Monitor and respond

Use [read-only health SQL](../supabase/operations/automation-health.sql) in the existing database, plus Vercel job logs and the sponsor's finalized balance. It does not expose signed bytes, secrets, user IDs or wallet addresses.

Suggested initial operating thresholds (operator decisions, not implemented alerts): investigate no completed cron for 5 minutes, accounts overdue by 15 minutes, repeated provider failures, any `review-required` execution, or confirmed claims still awaiting rollover after two healthy check cycles. Pause new execution on unexpected amount/destination evidence, duplicate claims/signatures, policy drift, or unexplained sponsor spending. Alert delivery is not implemented by this document; someone must watch the dashboard/queries or configure alerts explicitly.

Budget controls reserve at most 0.1 SOL / 100 attempts globally and 0.02 SOL / 10 attempts per user per UTC day, with a per-attempt maximum of 0.0101 SOL. These are conservative reservations, not measured spend or refundable credits. Failed/ambiguous attempts still consume budget. Current simulation caps network fee at 100,000 lamports; quote/simulation validation may reject expensive routes. Watch available SOL in addition to budget counters.

HTTP 200 from a cron is not alone a healthy result: its JSON can report `needs-attention`, and some manual-review states are treated as processed work. Inspect queue failure counts **and** claim/execution state. Monitoring `changed_at` is the time of meaningful change, not the last check; use queue `last_checked_at`.

## Rollback and uncertain transactions

1. Set Production execution false and redeploy; confirm the disabled response on the new deployment. Existing invocations can still use their old environment. A redeployment is not an instantaneous cancellation, and signed/broadcast transactions may still land.
2. For an urgent stop involving signing authority, revoke the affected delegation through the existing user flow or restrict the dedicated signer using Privy's controls with the appropriate operator authorization. Revocation cannot invalidate an already-signed transaction. Do not delete a wallet or rotate unrelated credentials as routine rollback.
3. Preserve reservations, unsigned/signed journals, signatures, rollover context and initial checkpoints. Never delete a claim, release a gate, clear an uncertain attempt, or reset a checkpoint to make retry possible.
4. Inventory and reconcile each existing attempt using its original request ID and signature. The scheduled worker currently stops before reconciliation when execution is disabled; **tracking continues, automatic recovery does not**. The authenticated `/api/swaps/status` flow can still read finalized evidence and complete rollover while disabled; it will not rebroadcast with execution false. It requires the owning user's authenticated session. There is no standalone admin recovery UI currently.
5. `prepared` means fresh validation/manual review is needed, not permission to sign again. `signing` or `review-required` stops automatic recovery even if a signature may exist externally. For `signed`/`submitted`, check the known signature at finalized commitment. Unavailable/non-finalized evidence means wait; it does not prove failure. Expired/not-found or finalized failed attempts remain under review, with no new transaction. Do not alter statuses manually based only on a timeout.
6. A confirmed conversion with pending rollover must retain its old checkpoint until exact effects and complete history are verified. It must not trigger another sale. Re-enable only after identifying the cause, preserving the original transaction identity, and rechecking the affected safeguards.

## Policy boundary

The Privy policy allows specified top-level programs for `signTransaction`. It does not independently enforce dividend entitlement, input amount, output mint, recipient or nested CPI effects. Those protections are application checks and simulations. A policy read-back is not proof of an enclave rejection test, nor does this review claim a fresh live-provider dividend test. A genuine dividend has not yet completed the production lifecycle.
