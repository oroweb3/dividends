# Project handoff — public development summary

Dividends by Oro converts verified eligible xStock dividend portions into Oro GOLD through Titan on Solana. The catalog contains 20 supported stocks/ETFs; support is not a promise of dividend eligibility. Email onboarding and delegated wallets use Privy.

Production: https://dividends.oro.finance . Production activation was approved and reported completed in September 2026; check the authenticated runtime state for its current value. Local execution should remain disabled. No genuine dividend conversion had been observed when this summary was written.

## Validation

60 application tests and 30 connected automation scenarios passed. The connected suite uses an isolated PostgreSQL schema and controlled provider responses. A separate real sponsored principal swap validated execution plumbing, not dividend entitlement. See docs/audits/automation-lifecycle-2026-09-23.md for scope and limitations.

## Development and operations

- Read AGENTS.md and docs/production-rollout.md before work.
- Use local port 3001. Production jobs run independently of the local server.
- Migrations 001–009 implement tracking, reservations, execution journals, sponsorship budgets, scheduling, and checkpoints.
- Never reset an uncertain claim or sign a replacement merely because a response timed out. Preserve exact transaction identity and evidence.
- The one-off principal test and account-specific checkpoint reset are retired; there is no standing authorization to repeat them.
- The execution switch is global. Disabling it requires a production redeploy and does not cancel transactions already signed. Scheduled reconciliation stops while disabled; authenticated status checks can still observe finality.
- No automatic operator alerting or admin recovery UI is implemented.

## Publication privacy

Private operator notes, account associations and transaction evidence are excluded from this public summary. Historical publication cleanup removes those details while retaining application development commits. Wallet addresses in tests are synthetic fixtures, not user accounts. Commit email addresses are redacted in the sanitized history; rewritten commits have different hashes and no original GPG signatures.

Local maintainers may keep additional continuity notes at `.local/HANDOFF.private.md`, which is ignored by Git. It is optional and must not be committed or required to build this project.
