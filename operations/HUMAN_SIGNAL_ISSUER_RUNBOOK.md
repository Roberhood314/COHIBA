# Human Signal issuer pilot runbook — PRE-AUDIT

This is a required operating procedure, not evidence that a real issuer is deployed. Existing production issuer endpoint remains disabled.

## Enrollment and assurance

Name the issuer operator, verification provider, evidence retention/deletion rules and revocation owner. Require verified phone possession plus signed owner-key binding from the authenticated profile; never accept client-provided assurance or reviewer self-assertion. Resolve current account and PoHA state consistently under their transaction boundaries. Recheck expired proof, account recovery/key changes, principal epoch and every signed binding/delegation's revocation. Publish PHONE_VERIFIED limitations; no KYC, biological uniqueness, liveness or authorship claims. Keep raw phone/evidence out of status bundles and public logs.

## Signing custody

createAuthorityIssuer accepts exactly one of privateKey (local reference/testing) or signer `{publicKey, async sign(bytes)}`. The signer is an operator-supplied adapter for Ed25519 KMS/HSM; it must sign the exact domain-separated bytes and return canonical Base64 signature. Issuer verifies output against its pinned public key and current time. Failed/incorrect/late signing denies issuance. No fallback key or algorithm substitution. A working adapter to a particular cloud KMS/HSM is not provided or claimed.

Before real activation: choose Ed25519-capable custody, least-privilege signing IAM, denied key export, audited admin access, separate staging/production keys, bounded call timeout and durable audit logs without proof payloads. Never place a private key in source, chat, browser or fixtures. Retain old public keys for historical evidence; never restore a compromised signing key.

## Rotation and compromise drill

1. Provision a fresh key/version under dual operator approval; record public key, keyId and validity interval.
2. Distribute the new pinned key to every independent verifier via its operator-approved configuration. Obtain acknowledgements. Do not accept keys from a request or unauthenticated discovery.
3. Start issuance with the new keyId; ensure old/new statements verify only inside pinned validity intervals. Deny unknown keys.
4. After overlap, disable old signing and revoke old trust entry on every replica. Measure propagation and record results; revocation is effective at a verifier after its config update.
5. For compromise, suspend issuance immediately, deny affected issuer/key in verifier policy, rotate and investigate credential impact. Advance principal epochs/revoke affected grants as needed. No declaration of instantaneous global revocation.

Drill before live acceptance: record exact source SHA, operator, custody configuration (non-secret), last old/new issuance, propagation timings and test evidence for stale/revoked keys and revoked grants. Include recovery tests for all issuer authority tables and the verifier epoch/action/approval/challenge plus business outbox tables. Restoring stale replay state can reopen consumed actions: suspend admission, reconcile against an authoritative recovery point and retest before reopening. Full recovery drill is outstanding.
