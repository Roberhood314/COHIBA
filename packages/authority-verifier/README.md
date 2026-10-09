# Human Signal independent authority verifier

Version **0.1.0-experimental.4**. Node >=22, no runtime dependencies. Copy this directory into another application; it runs without COHIBA source, accounts, token state or network access. Not published to npm; licensing/publication and independent security audit are separate gates.

```js
import {inspectAuthority, authorizeAuthority} from './authority-verifier/index.mjs';
import {createPostgresReplayStore} from './authority-verifier/postgres-adapter.mjs';
// pool belongs to YOUR service, not COHIBA.
const consume = await createPostgresReplayStore(pool);
const result = await authorizeAuthority(clientBundle, {
  consume,
  trust: issuerKeysFromYourConfiguration,
  expected: contextDerivedFromYourActualRequest
});
if (result.executionAuthorized === true) {
  // Queue the exact request under a durable idempotency key/outbox.
}
```

**Never take trust, expected context, clock or policy from the client.** Admission input accepts only `{proof,binding,delegation,status}`; trust and expected are service-side options. Derive payloadHash from exact bytes you intend to execute, audience/resource/action from your own endpoint and policy, and challenge from a fresh service-generated random nonce. The synthetic vector file embeds trust and expected solely to make fixtures reproducible.

`inspectAuthority` returns one of the four actor classes and always `executionAuthorized:false`. `authorizeAuthority` requires an atomic replay store; there is no in-memory fallback. Its ALLOW describes this verifier's local admission, not a portable signed receipt, an executed business operation or global replay prevention across independent services. All replicas of your service must share the same store. Do not refund nonces on uncertain delivery or restore old partial backups.

The included PostgreSQL adapter atomically consumes Agent action nonce, optional Human approval nonce and verifier challenge, and raises a monotonic issuer/principal credential epoch floor. Tables have unique keys and epoch row locks. Rejections roll back partial inserts. Keep all four hs_verifier_* tables together in backup and restore. Cleanup/retention requires a reviewed expiry design; this version does not discard replay history. Protect the database and configure timeouts/rate limits at the service boundary.

## Trust and privacy limits

Signature validity establishes key control and delegated authority. Human assurance and current revocation still require an **issuer chosen and pinned by the integrating service**. No COHIBA key or URL is hardcoded. The only supported assurance classification is PHONE_VERIFIED, which does not establish biological uniqueness, liveness or Human authorship. The issuer's authoritative state resolution, key distribution/rotation, compromise handling and anti-Sybil quality need separate assessment.

The experimental authority-status statement is signed by that issuer, bound to exact action digest, service audience and service challenge, and lasts at most 30 seconds. It covers current principal key/epoch, assurance expiry, principal revocation and explicit status for every required binding/delegation ID. Missing coverage, unknown issuer, substituted challenge/action/audience, stale statement and revoked authority fail closed. Snapshot revocation has a bounded freshness window; it is not instantaneous revocation after issuance. This format is **not enabled on the production Human Signal API** and is not a ratified portable Human credential standard.

The verifier sees public keys, signed permissions, identifiers, scopes and hashes. It does not require raw phone, name, email, health data or GPS. This is data minimization, **not unlinkability**: stable keys/IDs and low-entropy hashes remain correlatable. Tor, zkAPI, ZK/selective-disclosure credentials and Solana proofs are not implemented by this package. COH ownership has no role.

Only one Human→Agent delegation hop is supported. No wildcard scopes, implicit inheritance, Agent→Agent redelegation, token transfers or general tool execution. Expired grants, binding substitution, altered resource/audience and approvals for another action are denied. A separate reference HTTP issuer/service flow now exists. Verified issuer enrollment and externally operated production acceptance remain work to do.

Run `node examples/independent-verifier/demo.mjs` from the repository root for public synthetic vectors. `node --test test/independent-verifier.test.mjs` includes cross-implementation signing/classification, adversarial mutations, concurrent replay, epoch rollback, a PostgreSQL adapter and a copied standalone package with no repository dependency. These are automated checks, not an independent security audit or proof of a third-party customer's adoption.

## v0.2 additive issuer and privacy controls

Version 0.1.0-experimental.3 adds optional keyId-pinned issuer registries with key validity/revocation and operator-approved rotation; legacy v0.1 single-key vectors continue to verify. Registry policy remains service-side. createAuthorityIssuer projects a trusted state resolver and checks the proof chain before returning metadata; it never signs arbitrary client assurance. The optional PoHA storage adapter and HTTP issuer example are not activated in production.

publicDecision removes identifying fields from returned responses/log views. This is minimization, not unlinkability. External service example queues its outbox intent in the replay transaction using a trusted onAdmit hook. See the issuer/privacy threat matrix and external-trust-service example for limitations and test evidence. Live third-party adoption and an independent audit are still outstanding.

## Operator signing provider (experimental.3)

Issuer accepts exactly one of privateKey or signer `{publicKey, async sign(bytes)}`. The latter allows an operator-owned Ed25519 KMS/HSM adapter without exporting the private key into this process. The callback signs exact bytes and returns canonical Base64. No cloud-provider adapter is bundled. Output is verified against the configured key at the current time after awaiting signing; timeout (default 5 s, max 30 s), invalid signature and expired status deny issuance without fallback. Timeout does not cancel a provider's remote operation; its adapter must implement cancellation/resource bounds. See operations/HUMAN_SIGNAL_ISSUER_RUNBOOK.md.

Four release evidence gates are tracked separately from token launch and action authorization. Current status is PRE_AUDIT; none is complete. `/api/v1/release-readiness` is a read-only maintainer registry view, not an audit certificate or authorization endpoint. AUDIT_READY only means preparation. Independent evidence is still required.

## Commit-time local revocation gate (experimental.4)

For database effects, use `commitAuthority` with `createPostgresCommitGate`:

```js
import {commitAuthority} from './authority-verifier/index.mjs';
import {createPostgresCommitGate} from './authority-verifier/postgres-adapter.mjs';
const gate = await createPostgresCommitGate(pool, {
  onCommit: async (transaction, verified) => {
    // Operator-owned SQL handler. Derive expected.payloadHash from the actual
    // immutable request bytes before verification; write only that exact effect.
    await transaction.query(
      'INSERT INTO protected_drafts(digest, resource, payload_hash) VALUES($1,$2,$3)',
      [verified.actionDigest, verified.resource, verified.payloadHash]
    );
  }
});
const result = await commitAuthority(clientBundle, {
  commit: gate.commit, trust: configuredIssuerRegistry, expected: actualRequestContext
});
// operationCommitted === true means the adapter committed the SQL transaction.
// Only an authenticated, authorized operator/issuer integration may call revoke.
await gate.revoke({issuer, principalId, authorityId: delegationId});
// Omit authorityId to revoke the principal locally, including direct Human actions.
```

The commit gate locks the same issuer/principal epoch row as revocation. It checks durable local revocation for the principal, binding and delegation inside the transaction that consumes replay records and writes the effect. A successfully committed local revocation blocks all subsequent commits, including proofs with a still-live signed status snapshot. A commit that wins the lock first may finish before revocation returns; revocation cannot undo a committed effect. Local revocations are permanent in this version and survive adapter restarts. A deferred database trigger checks the stored authority deadline at COMMIT using the database clock. Keep application/database clocks synchronized. Include `hs_verifier_revocations` and `hs_verifier_commits` with all replay/epoch and business-effect tables in backups. Never reset or delete that table to reactivate authority.

`onCommit` is trusted operator code and must write through the supplied transaction client. Do not issue HTTP, blockchain, filesystem effects, independent pool queries or asynchronous background work from it. Failed SQL writes roll back effects and replay consumption together. A lost connection during COMMIT has an uncertain outcome: reconcile durable effect records using the action digest; a DENY/error is not proof that an effect was never committed. All service replicas and all local revocation writers must use this gate and the same database. Other services need their own synchronized revocation integration. An issuer revocation not delivered to this database still has the existing status freshness window. This is not global instantaneous revocation or atomic external-chain execution.

The older `authorizeAuthority` remains admission-only. Use `operationCommitted` from `commitAuthority` to identify a confirmed database commit. Its injected `commit` callback is trusted and must implement these transaction guarantees; merely returning true is not evidence of a business write. Scope/resource/audience/payload binding and owner approval checks still run independently before the adapter is called. Integration in production endpoints remains a separate rollout; adding the package API does not automatically protect every COHIBA or third-party effect.

Cryptographic boundary: this version still uses the fixed HS/1 Ed25519 signing format and SHA-256 digests. It adds no post-quantum algorithm, no hybrid signature and no claim of resistance to future AI cryptanalysis. A future algorithm migration needs a new domain-separated signed version, operator-pinned algorithm policy, cross-implementation vectors and downgrade rejection. Do not add client-selectable algorithm fallbacks or silently reinterpret existing HS/1 keys. Keep authorization correctness, cryptographic migration and independent audit as separate evidence requirements.

Run `node --test test/authority-commit-gate.test.mjs test/independent-verifier.test.mjs`. CI can run the gate tests against native PostgreSQL via `TEST_DATABASE_URL`; the local fallback uses PGlite with serialized clients and does not establish native multi-session lock behavior.
