# Delegated signing for Dividends by Oro

Decision: include delegated signing in V1. Users authorize automation once from their embedded Solana wallet, and can revoke that authority. Do not require approval for every dividend conversion. This decision supersedes the earlier proposal for manual transaction approval in V1.

## Current status

Authorization and revocation UI implemented using useSigners. An authenticated GET /api/delegation verifies the current Privy wallet and exact signer override policy. Local authorization key and dedicated key quorum have been verified against Privy; a program-restricted policy was created and its ID saved locally. No user wallet was delegated during setup. Actual signing, submission and automated execution remain unimplemented.

## Privy setup

In the dedicated Dividends by Oro Privy app, open Wallet infrastructure > Authorization keys > Create new key. Save the private key as `PRIVY_AUTHORIZATION_PRIVATE_KEY` in server environment configuration and the key quorum ID as `PRIVY_SIGNER_ID`. Never paste the private key into chat or expose it to a browser.

A restricted Solana policy must be designed and validated before attaching the signer. Save its ID as `PRIVY_SIGNER_POLICY_ID`. The permission-status endpoint consumes these environment names. The private key is checked for presence there; the setup utility verifies its P-256 public key against the configured dedicated quorum. Do not create an allow-all policy as a placeholder.

## Implementation requirements

- Use installed React SDK `useSigners().addSigners` on an explicit user action, with the configured signer ID and one nonempty policy ID. Never attach on login or wallet creation without separate consent.
- Authenticate server reads and resolve the wallet ID from the user's Privy-linked Solana wallet. Never accept a wallet ID/address from a client as proof of ownership.
- Verify current additional signer and policy state from Privy. Do not equate a generic delegated flag with our configured signer and policy being attached.
- Provide revocation. The current SDK's `removeSigners({address})` removes ALL additional signers; disclose that scope in the interface or implement targeted removal before offering a narrower label.
- Only allow supported transaction signing under a restricted Solana policy; deny unrelated methods, arbitrary message signing, and key export for this signer. Validate concrete Titan V2 policy capabilities before claiming mint, destination, amount, or CPI restrictions are enclave-enforced. Program allowlisting alone does not protect principal.
- Dividend eligibility, historical ownership, exact dividend calculation, duplicate claim reservations, and fresh balance checks remain application responsibilities. A Privy policy does not establish dividend eligibility.
- Build, validate and simulate the exact transaction before requesting a signature. Persist its identity and claim state before submission; reconcile uncertain submissions without creating another payment.
- Recheck delegation immediately before signing. Revocation prevents future signatures; it cannot undo already-signed or broadcast transactions.
- Keep execution disabled until reservation integration, signing, submission/recovery, policy rejection tests and successful funded live simulation are completed.

## Sources checked

- https://docs.privy.io/wallets/using-wallets/signers/configure-signers
- https://docs.privy.io/wallets/using-wallets/signers/add-signers
- https://docs.privy.io/controls/policies/overview
- Installed @privy-io/react-auth 3.43.0 type declarations.


## Implemented policy scope and validation

`config/privy-dividend-policy.json` permits only `signTransaction` with Titan, the associated token account program, and Compute Budget as top-level programs. Other methods and programs receive no allow rule. This is a program allowlist, not enclave enforcement of dividend amount, output mint, destination, fees or inner CPI effects. UI explicitly explains that distinction. No automatic execution is enabled.

`setup-privy-delegation.cjs` verifies the dedicated key and can create an unattached policy with `--create-policy`, persisting the ID to `.env` immediately to avoid duplicate creation on retry. No wallets are modified by the script.

The permission-status endpoint rejects unexpected policies, mismatched wallet identities, missing policies and duplicate signer entries. It only allows initial authorization when the wallet has no additional signers. Revocation uses the SDK's all-signers removal and is labeled accordingly; it can still be attempted if server policy checks fail. Backend permission read-back is required before showing success.

Validation: 36 unit tests, lint and production build passed. Privy key/quorum and configured policy read-back verified live. User consent/revocation in the authenticated browser is not yet tested. No database migration required.

## Execution infrastructure update

Migration 004 has now been applied and tested on the configured Supabase database. Internal signing/journal/reconciliation adapters are implemented, but no public execution endpoint or worker invokes them. The validated Titan preparation and fresh reserved-claim eligibility callback still need wiring. The live wallet remains revoked and execution disabled.

The server uses Privy's documented REST request-signing protocol because the current server SDK's Solana peer dependency conflicts with this app. Authorization signatures bind the complete request body, URL, app ID, claim idempotency key and request expiry. Returned Solana transactions must match the original message byte-for-byte and pass Ed25519 verification. Signed bytes are persisted before broadcasting; uncertain results never request another signature automatically.

40 unit tests, lint, production build and rollback-only tests of the applied journal pass. These are not a successful live financial transaction or proof of full end-to-end eligibility/execution.
