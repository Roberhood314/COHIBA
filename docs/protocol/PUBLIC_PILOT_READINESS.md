# Human Signal public pilot readiness

This release prepares public pilot operations. It is not an independent audit certificate, a real-user acceptance record or a Mainnet authorization.

## Real-user acceptance

Use an actual phone-verified owner account with its own linked wallet. No maintainer may simulate that identity and label it real.

1. Login at the official origin. Verify session creation and account isolation.
2. Link the owner's wallet using the signed challenge. Check the displayed wallet and principal.
3. Open `/poha-lab.html`, connect that wallet, review the exact audience/resource/text and sign binding/delegation.
4. Open the independent Draft Board and save the exact draft with the agent proof. Record `AUTHORIZED_AGENT`, actionDigest and saved draft identifier (exclude phone/session/private data).
5. Send the same proof again: deny replay and verify no second draft.
6. Require Human approval: unapproved action must return `HUMAN_APPROVAL_REQUIRED`; sign exact digest and complete once.
7. Verify direct Human action returns `VERIFIED_HUMAN` and missing/invalid proof returns `UNVERIFIED`.
8. Revoke grant; create a fresh action under that grant and confirm denial. Verify expiry and mismatching resource/payload/audience.
9. Logout/password recovery invalidates the relevant sessions; another owner cannot read/revoke these records.

Acceptance evidence must name the release SHA, timestamp, real-user operator, outcomes and sanitized identifiers. Automated fixtures remain `SIMULATED`; absence of a real signature leaves this gate pending.

## Internal security review and external review packet

Review surfaces: `sdk/protocol.mjs`, `lib/poha-postgres.mjs`, `lib/account-state-postgres.mjs`, `lib/human-signal-origin.mjs`, `sdk/checkpoint.mjs`, browser PoHA and external app.

Changes from this review: standalone SDK with a single shared canonicalization implementation; strictly typed service-policy booleans, scope/resource constraints and unknown-field rejection; service enrollment/rotation/disable written with policy audit in one transaction; shared API rate budget in PostgreSQL; checkpoint signature binds issuer, creation time, trust-domain hashes and root with independent key pinning.

External reviewer must independently test signature/schema substitution, canonical encoding, audience binding, stale proof/approval, concurrent replay, identity rotation/recovery, principal/binding/grant/service revocation, session theft/CSRF/origin confusion, slow requests/DB outages and cross-service execution failure. Deliver findings with severity, remediation and retest. No external review has been commissioned or completed by this release.

Residual boundaries: phone verification is not biometric uniqueness/liveness; issuer signing is not proof of state correctness; issuer receipts remain online; service policy is not a separate root domain; JSONB account documents still share a coarse transaction lock. Local OTP/login-specific budgets remain single-replica controls in addition to the shared API budget. Provider/config/community JSON still requires one replica. Mainnet flags stay disabled.

## Restoration and continuity

`node scripts/restore-verification.mjs PRIVATE_BACKUP_FILE` requires `HS_RESTORE_DATABASE_URL` explicitly. It refuses the known source target and refuses any populated trust table; restore is transactional. It compares every restored table, counts revocations/nonces and attempts duplicate writes in rolled-back transactions. A production S3 bundle or hashed PostgreSQL export is supported. Do not expose the backup contents in logs.

The native PostgreSQL CI restore test now creates a separate database for the clone, checks exact data and replay denial, then removes its own test database. This is separate from restoring the actual production S3 snapshot; the latter needs evidence from `s3-restore-drill.mjs` in the isolated drill service.

Checkpoint issuer key: private `checkpoint.secret.pem`, chmod 0600, persistent volume, deliberately excluded from JSON backups. This is a protocol signing key, not a treasury wallet. Separately protect its recovery material outside chat/source; losing it requires an explicit announced rotation and verifier pin update. Never silently accept a new key after a volume restore. Draft Board's own service key/draft data also need their own recovery plan.

## Operations

`node scripts/health-monitor.mjs`: fails when storage is unavailable, backup >8h old, checkpoint >15m old, or a worker reports an error. Schedule every 15m; GitHub workflow failures provide an operator-visible signal, not an on-call delivery guarantee. The incident operator checks Railway logs, disables affected service policy, pauses authorization if necessary, and restores only into a separate database. Do not fall back to stale JSON or reset nonce ledgers.

`node scripts/load-probe.mjs`: read-only, 40 requests/4 workers by default, at most 500/16. Remote use requires `HS_LOAD_REMOTE_APPROVED=true`; never probe live OTP/login. Record request count, response codes and p50/p95. This measures the selected route, not sustained production capacity. Shared API budget is 60/minute/IP fixed-window; DB failure denies API requests. PostgreSQL must be healthy; monitor load and disk. Remain one replica until local controls/config writes are migrated.

## Checkpoints and Solana

Signed `HS_TRUST_STATE_V1` checkpoints bind seven trust domains and exclude COH/signalPoints. Existing unsigned checkpoint of the same root may receive a signed attestation; existing signed documents remain immutable. Verify root/domain consistency, issuer and pinned key. Publishing aggregate hashes avoids exposing individual identity evidence. Per-record Merkle inclusion and portable action receipts are future protocol work, not claimed here.

`prepare-checkpoint-anchor.mjs` verifies the pinned signature and builds an unsigned memo transaction. Default cluster is devnet. Operator supplies a public payer, inspects network/fee/memo, signs locally and submits through their wallet. No keys are uploaded; this script neither signs nor sends. A prepared transaction is NOT an anchor. Record a successful finalized transaction, verify the expected cluster/genesis and memo, then publish evidence before claiming anchoring. Mainnet anchoring has real fees and is a separate owner action.

## Release gates

| Gate | Evidence required |
|---|---|
| Engineering | Tests/build/security checks and packaged SDK from exact release SHA |
| Real user | Actual wallet-signed acceptance record above |
| Recovery | Separate-database production backup restore, table comparison and replay/revocation evidence |
| Operations | Load probe results, scheduled monitor, named incident operator |
| Independent audit | External report, closed critical/high findings, retest |
| Anchoring | Finalized on-chain memo tied to verified signed checkpoint |

A pending gate must stay pending; passing CI never changes external or real-user status automatically.
