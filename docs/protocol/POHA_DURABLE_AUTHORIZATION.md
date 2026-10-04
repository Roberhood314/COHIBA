# PoHA durable authorization and independent integration

## Migration boundary

PoHA signed bindings, delegations, revocations, principal credential snapshots/epochs, service policies, request nonces, action/approval replay ledgers and authorization audit records now use PostgreSQL when `HUMAN_SIGNAL_DATABASE_URL` is configured. Schema creation and the resumable idempotent import of historical signed registry records are additive transactions; imported metadata-only v0 records never acquire authority. Import uses insert-only conflicts, so re-running it never clears PostgreSQL revocation. Existing JSON records remain historical evidence; subsequent PoHA writes use PostgreSQL exclusively. There is no fallback to JSON if the configured database is unavailable.

Legacy accounts, sessions, contributions, provider config and economic flows remain in JSON during this incremental migration. The guarded writer refuses corrupted files and stale read snapshots, fsyncs replacement files and retains eight prior valid versions. A write conflict is an error, not a silent overwrite; callers can retry from freshly loaded state. The legacy runtime must remain one replica with its volume. This is not yet a completed account/session PostgreSQL migration.

External authorization resolves current wallet and fresh unique phone evidence from the legacy identity adapter, stores its credential snapshot in PostgreSQL, and rechecks the adapter snapshot before commit. Database principal revocation is authoritative. There is still a transition boundary between legacy identity writes and PostgreSQL transactions; issuer-signed assurance and fully transactional identity/session migration remain necessary for high-impact actions. Only read/draft scopes exist; do not use this release for settlement or token transfers.

## Authorization

`POST /api/v1/actions/authorize` is a server-to-server operation. It never accepts a Human bearer session as a service credential. A service is enrolled with a pinned Ed25519 public key, exact audience, scope allowlist, resource prefix and approval policy. Initial enrollment uses non-secret `HS_PILOT_PUBLIC_KEY` and `HS_PILOT_AUDIENCE` configuration; the enrolled service ID is `draft-board`. Its private key is generated and retained on the independent application's volume, mode 0600, and is never returned by HTTP.

Headers: `x-hs-service-id`, `x-hs-time` (canonical UTC ISO timestamp), `x-hs-nonce` (at least 128 random bits, Base64url), `x-hs-signature` (canonical Base64 Ed25519). Service signing bytes are `HS/1/SERVICE\n<id>\n<time>\n<nonce>\n<SHA256(raw HTTP body)>`. Request time is bounded to 60 seconds. Service request nonces are durably unique.

Body: `{action, resource, payloadBase64, proof: {payload, signature, approval?}}`. The application derives action/resource and bytes from its actual operation. The verifier computes payload SHA-256 and derives audience/policy from the enrolled service. Client expected-context or approval-policy fields cannot weaken authorization.

A PostgreSQL transaction holds the per-principal advisory lock, checks current revocation/key/evidence/scopes/signatures, consumes service nonce, and inserts the unique action digest and `(signer_key, nonce)`. Fresh exact-action approval nonces are unique too. Concurrent copies of an action produce at most one authorized result; replay returns `UNVERIFIED / DENY / ACTION_REPLAY`. Approval-required results do not consume the action nonce, so the Human can approve the same action.

Results include actor class, principal ID, performer key, delegation ID, service ID, credential epoch, action digest, receipt ID, checked time and expiry. Authorization ALLOW has `mode: AUTHORIZE`, `executionAuthorized: true`, `nonceConsumed: true`; diagnostic `/inspect` remains non-executing. Receipts expire after at most 30 seconds and are online responses, not portable issuer-signed attestations. The application must use the live HTTPS response and verify service ID/expiry before its side effect. A signed proof alone is not an execution receipt.

`POST /api/v1/identity/revoke` permits the authenticated owner to revoke their current PostgreSQL principal; this denies subsequent authorizations and is recorded with an incremented epoch. Current session is the recovery authority in this release. Clearing principal revocation requires a future reviewed recovery workflow; there is no automatic reset.

## Independent Draft Board

`examples/draft-board` is a distinct Node HTTP process and Railway service. Its service key, startup, domain and durable draft table are separate from the COHIBA website. It calls Human Signal over HTTP, receives one of the four actor classes and saves a draft only on live authorized ALLOW. Actual text bytes must match the signed digest. A unique draft action digest prevents duplicate local inserts. Failed verification, changed content, revoked authority and replay cannot save a draft.

The app does not receive Human password/session tokens. A failed database save after Human Signal authorization can consume a proof without creating a draft; cross-service authorization and execution are not a distributed atomic transaction. Generate a new action after investigating that failure. Financial/irreversible operations remain out of scope.

### Real-user walkthrough

1. Sign in and verify phone, link the current wallet at Human Signal. Open `/poha-lab.html` and obtain `principalId` / public `principalKey`.
2. Query `/api/v1/services/draft-board` for the enrolled external audience and policy.
3. Locally create a binding input containing principal ID/key, audience and agent name. Run `node scripts/agent-proof.mjs binding binding-input.json local-agent-key.pem`. The generated private key stays in that local file; stdout contains public payload and agent signature only.
4. Paste that output into Developer Lab, choose Binding, and sign with the principal wallet. Save the binding ID and exact expiry from the response.
5. Use SDK `delegationPayload` for that binding, its public agent key, `DRAFT_APP_ACTION`, exact resource such as `draft:article-1`, expiry no later than binding expiry, and desired approval requirement. Paste `{payload}` into the lab, choose Delegation, and sign with the Human wallet. Record delegation ID.
6. Locally prepare action input with principal ID, delegation ID, external audience, action, resource and exact draft text. Run `node scripts/agent-proof.mjs action action-input.json local-agent-key.pem`.
7. Submit the same text, resource and resulting signed proof to the independent Draft Board. Human Signal verifies whose key signed it and whose delegation authorizes the exact action. Repeating the proof is denied.
8. Revoke the binding or delegation in the lab. A newly signed action under that grant is denied.

Phone assurance is a limited policy signal, not proof of biological humanity, liveness or unique personhood. Fake evidence is used only in isolated test directories/CI fixtures; deployment never creates simulated user profiles or fake live Human verification.

## Trust commitments

`HS_TRUST_STATE_V1` is a distinct deterministic commitment over Human Proof statuses/evidence hashes/times, wallet credential binding, credential epochs/revocation, trust edges, neutral contribution proofs, signed agent/grant state, and authorization provenance. It excludes signal points, COH balance/rewards, mining/streak/pioneer fields and the mixed legacy event chain. Historical HSC 0.1 roots remain available as legacy application commitments.

`GET /api/hsc/state-root` returns both `state` (historical format) and `trustState` (new trust-only format). New optional Devnet checkpoints use the trust root/version. No blockchain transaction is enabled by this migration; the existing anchor gate remains off. Graph/risk/reputation expansion follows tested external utility.

## Backups and recovery

- Local JSON prior-version backups live under the existing private data volume. `scripts/storage-backup.mjs backup source destination` creates a manifest with hashes; `restore` validates all files first and only writes into an empty destination. It never silently repairs a corrupt live store.
- `scripts/postgres-backup.mjs backup file` exports authoritative PoHA tables in a repeatable-read snapshot with a SHA-256 envelope. `restore` requires an empty target database and restores replay/revocation ledgers as well as records. Use a separate database for a restore drill, never overwrite production in place.
- The runtime offsite worker uploads JSON plus a PostgreSQL snapshot to a private S3-compatible bucket on startup and every six hours. It reads bytes back and verifies SHA-256 before recording success. Credentials use Railway reference variables, not source files or chat. `/api/v1/status` reports last backup success/error without returning bucket credentials or backup data.
- Offsite bundles can contain account/session/provider state and must stay private. They are recovery data, not downloadable public reports. Operator treasury/signing-key recovery is outside this worker's guarantee; keep key custody separately.
- JSON snapshots are per-file during transition; they are not a cross-store ACID snapshot. PostgreSQL authority and replay ledger are transaction-consistent. External application's own draft/key recovery remains its operator's responsibility.

## Validation and rollout

Local tests use embedded PostgreSQL for SQL/transaction/restore contracts. CI uses PostgreSQL 18 with native node-postgres connections, including concurrent replay and a two-process HTTP integration. Test service credentials are generated ephemerally. Backups are tested by hash read-back and restoring the replay ledger into an empty database.

Additive rollout: provision private PostgreSQL and backup bucket; wire only reference variables; deploy tested main code; create the separate Draft Board service/volume; enroll its public key/audience; enable `ALLOW_POHA_AUTHORIZATION=true` for read/draft service policy; verify readiness and backup read-back. Preserve original volume and historical records. No token deployment, treasury operation, mass account rewrite or blockchain transaction is part of this rollout.
