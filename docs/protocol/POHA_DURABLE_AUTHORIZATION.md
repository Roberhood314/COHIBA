# PoHA durable authorization and independent integration

## Migration boundary

PoHA signed bindings, delegations, revocations, principal credential snapshots/epochs, service policies, request nonces, action/approval replay ledgers and authorization audit records now use PostgreSQL when `HUMAN_SIGNAL_DATABASE_URL` is configured. Schema creation and the resumable idempotent import of historical signed registry records are additive transactions; imported metadata-only v0 records never acquire authority. Import uses insert-only conflicts, so re-running it never clears PostgreSQL revocation. Existing JSON records remain historical evidence; subsequent PoHA writes use PostgreSQL exclusively. There is no fallback to JSON if the configured database is unavailable.

With `HS_ACCOUNT_STORAGE=postgres`, profiles, password credentials, sessions, wallet challenges, Human Proof, OAuth state, onboarding records, contributions and the core event ledger use authoritative PostgreSQL JSONB documents. Provider config, community metrics and token launch files remain outside this account boundary. Without that flag, legacy JSON mode remains available for isolated development; disabling it after live migration is not a safe rollback. The guarded writer refuses corrupted files and stale read snapshots, fsyncs replacement files and retains eight prior valid versions. A write conflict is an error, not a silent overwrite; callers can retry from freshly loaded state. The compatibility adapter uses a coarse PostgreSQL advisory transaction lock and request-local documents. Every account/core write in a request commits together; error responses roll back document changes, and successful headers/session tokens are withheld until commit. This preserves existing domain APIs without a destructive relational rewrite. SQL row decomposition and distributed rate limits remain later scale work. Keep one runtime replica while provider/community files and rate limits remain process-local.

In PostgreSQL account mode, external authorization reads current wallet and fresh unique phone evidence under the shared account transaction lock, stores its credential snapshot, and checks it before the separate PoHA transaction commits. All API identity mutations use that same shared lock, closing the former JSON/identity race boundary. Database principal revocation is authoritative. PoHA records and domain documents still use separate transactions: a PoHA revocation can commit even if its later domain audit fails. Revocation stays authoritative. Issuer-signed identity assurance, portable signed receipts, stronger identity providers and distributed execution consistency remain necessary for high-impact actions. Only read/draft scopes exist; do not use this release for settlement or token transfers.

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

For the browser walkthrough, open `/poha-lab.html`, choose direct Human / authorized Agent / Agent requiring approval, enter the resource and exact draft text, and sign the displayed wallet requests. The tab generates a non-extractable Ed25519 Agent key locally; no private key or session is sent to Draft Board. Transfer the signed action to the registered external app and click Save there. Required approvals bind the exact action digest. Proofs expire after one minute; refresh the flow if expired. The SDK path remains available:

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
- The runtime offsite worker excludes stale account JSON files after migration and uploads remaining JSON plus a PostgreSQL snapshot to a private S3-compatible bucket on startup and every six hours. It reads bytes back and verifies SHA-256 before recording success. Credentials use Railway reference variables, not source files or chat. `/api/v1/status` reports last backup success/error without returning bucket credentials or backup data.
- Offsite bundles can contain account/session/provider state and must stay private. They are recovery data, not downloadable public reports. Operator treasury/signing-key recovery is outside this worker's guarantee; keep key custody separately.
- JSON snapshots are per-file during transition; they are not a cross-store ACID snapshot. PostgreSQL authority and replay ledger are transaction-consistent. External application's own draft/key recovery remains its operator's responsibility.

## Validation and rollout

Local tests use embedded PostgreSQL for SQL/transaction/restore contracts. CI uses PostgreSQL 18 with native node-postgres connections, including concurrent replay and a two-process HTTP integration. Test service credentials are generated ephemerally. Backups are tested by hash read-back and restoring the replay ledger into an empty database.

Additive rollout: provision private PostgreSQL and backup bucket; wire only reference variables; deploy tested main code; create the separate Draft Board service/volume; enroll its public key/audience; enable `ALLOW_POHA_AUTHORIZATION=true` for read/draft service policy; verify readiness and backup read-back. Preserve original volume and historical records. No token deployment, treasury operation, mass account rewrite or blockchain transaction is part of this rollout.

## Account migration and restart safety

Before enabling `HS_ACCOUNT_STORAGE=postgres`, confirm a successful private backup and deploy the tested schema/adapter. Initialization acquires the same advisory lock as live account transactions and imports each missing document exactly once in one transaction. Invalid or recovered legacy state aborts import. Existing PostgreSQL documents are validated and never overwritten from historical JSON on restart. Old volumes/files remain historical evidence; they are not live mirrors. Post-migration corruption of a historical file cannot remove an existing PostgreSQL session. Backup/restore includes `hs_state_documents` and `hs_state_roots`; old pre-migration backups remain readable, but restoring one deliberately returns to its earlier account boundary.

Do not disable the account-storage flag or deploy code unaware of it as a rollback: historical JSON is stale. Roll back to a compatible application version, or restore a verified complete backup into a new database/volume and deliberately cut over. Provider config/key custody still needs its original volume.

## Graph, risk evidence and checkpoints

Authenticated `GET /api/v1/agency/graph` exposes the owner's signed delegation/agent provenance and accepted action history. Edges include `trusts` (self-asserted), `delegates`, `acts_for`, `interacts_with`, and explicit `authorizes` for direct Human actions or cryptographically bound Human approvals. Contribution score uses reviewed contributions only, with no COH, signal points or reward inputs. Phone freshness/revocation and principal assurance are explainable risk signals; they neither decide biological humanity nor automatically change permissions. There is no claimed ML/Sybil classifier in this release.

A worker computes deterministic `HS_TRUST_STATE_V1` checkpoints on startup and every five minutes, taking the account transaction lock and a PostgreSQL provenance snapshot. Identical roots deduplicate. `GET /api/v1/checkpoints` exposes up to 25 immutable root/domain-hash commitments. Checkpoints and backup replay/revocation ledgers persist across restarts. They are off-chain, not issuer-signed portable proofs. The existing optional Solana Devnet anchor operation uses the trust root but remains gated; no mainnet, settlement or treasury action is enabled.

Native CI covers all four actor classifications, approval replay, concurrent account login, password rotation, atomic OTP recovery/one-time onboarding, durable logout and restart with corrupted historical JSON. Browser-generated signing bytes are verified against the Node verifier. Production still needs an actual user's own wallet signature and phone verification; automation never fabricates that evidence.
