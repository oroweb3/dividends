# Connected automation validation — September 23, 2026

Result: **30 connected scenarios passed**, alongside all **60 existing application tests**, lint, and the production build. This change adds test infrastructure only; no application behavior, production flag, migration, or deployed code was changed.

## What ran

`npm run test:integration` compiles the scheduled-worker dependency tree with `tsconfig.integration.json`, then runs `scripts/test-automation-lifecycle.cjs`. It requires the existing `TEST_DATABASE_URL` and `prod-ca-2021.crt`. The supplied database URL is never printed. Run from the project root; `.env` is loaded only into the test process.

The harness creates a uniquely named `lifecycle_test_<uuid>` schema in the existing PostgreSQL database, installs migrations 002–009 there, and removes that schema in its finalizer. Migration 001 is not a dependency of this lifecycle. SQL functions and search paths are redirected to the isolated schema; the sponsor advisory lock uses a separate test key. Setup is transactional, while test cases use committed fixtures and multiple connections so concurrency checks exercise real PostgreSQL locks. Fixture resets truncate only the explicitly named disposable schema. Both completed runs reported successful schema cleanup. If a process is forcibly killed, its finalizer cannot run; inspect and remove only its orphaned `lifecycle_test_<uuid>` schema before retrying.

The actual application code performs scheduling, owner/balance reads, history classification, event eligibility, exact dividend calculation, preview signing/rechecking, reservation, route validation, transaction compilation, simulated-effects checks, delegated-signing orchestration, cryptographic signature validation, durable journaling, reconciliation, and checkpoint rollover. It uses the actual migration constraints, triggers, and functions.

External boundaries are controlled:

- Supabase's REST transport is replaced by a narrowly scoped adapter that executes SQL in the disposable schema. This does **not** test PostgREST itself or the production service-role/RLS boundary; SQL runs with the configured test database role.
- Solana JSON-RPC responses are fixtures. The actual balance reader, history scanner, simulation validator, transaction verifier, and rollover proof consume those responses. No RPC request leaves the process.
- Issuer event lookup, Titan quote acquisition, wallet identity lookup, delegation lookup, and sponsor configuration are fixture providers. Their live services, policies, timeouts, rate limits, historical coverage, and API compatibility are not established by this suite.
- Privy signing HTTP responses contain real Ed25519 signatures made by fresh, unfunded test keys over the exact compiled transaction message. The real signing orchestration and partial/final signature verification run, but Privy itself is not contacted. The authorization key is generated for the test process.
- All unexpected fetch destinations are blocked. Inherited provider configuration is removed before fixture configuration is installed. Execution is enabled only inside this fixture process; `.env`, Vercel settings, and live wallet permissions are unchanged.

## Coverage

1. Scheduled eligible event → preview → simulation → reservation → sponsor budget/signing gate → user and sponsor signatures → durable signed bytes → submission → finalized confirmation → exact next checkpoint. A repeated run does not sell the consumed event again. Original enrollment and initial checkpoint remain intact.
2. Execution disabled: monitoring continues without verification/reservation/signing; identical observations retain their original `changed_at` timestamp.
3. Issuer outage, balance outage, unavailable history, malformed history, zero-net stock activity, quote outage, and failed simulation all stop before signing.
4. Enrollment after an event cannot make it convertible.
5. Revocation before reservation, after acquiring the signing gate, or between user and sponsor signing prevents broadcast. Revocation before reservation leaves no consumed attempt; later valid reauthorization can legitimately start one.
6. Changed holdings after preparation, signing-response timeout, and signature-journal failure stop broadcasting and do not trigger a new signature on retry.
7. A lost broadcast response is reconciled from finalized evidence without signing again, including after permission is revoked.
8. An unseen transaction can be rebroadcast using only its exact durable signed bytes. Unavailable status, non-finalized confirmation, expired blockhash, finalized failure, revoked permission, and expired quote do not cause blind resubmission or re-signing.
9. Overlapping scheduled workers acquire only one global job lease. Concurrent database signing gates debit the sponsorship budget once. Simultaneous conversion requests with different request IDs create only one claim, execution, and sale attempt.
10. Both checkpoint/reservation race orderings were tested with separate transactions, explicitly checking `pg_blocking_pids` to establish real contention: a winning reset invalidates the stale reservation; a winning reservation blocks the reset.
11. A finalized conversion with unavailable rollover history retains the old checkpoint and pending rollover. When history recovers, rollover completes without another sale.

Uncertain signing attempts intentionally remain reserved/review-required; the suite does not clear them or infer that no signature exists. These cases need operational review, not an automatic retry with new bytes.

## What this means for launch

The previously missing connected **internal lifecycle** validation is now complete for these scenarios. No runtime defect was found in this run, so no production fix or new SQL migration was needed.

This is not a real dividend conversion or a live-provider end-to-end test. The earlier real sponsored principal swap and this isolated lifecycle suite establish complementary parts of the system, not a genuine dividend lifecycle together. Remaining rollout work is to review current production configuration/policy and monitoring/recovery procedures, agree on activation and rollback criteria, and explicitly authorize production enablement. The first genuine eligible event still needs live observation through confirmation and checkpoint rollover. Do not fabricate entitlement or repeat the consumed principal-test authorization to bridge that gap.

No deployment or enablement occurred in this session. The application remains at the previously deployed commit `2d90bc0`; production execution was previously disabled and was not changed here.
