# Human Signal independent authority verifier

Version **0.1.0-experimental.3**. Node >=22, no runtime dependencies. Copy this directory into another application; it runs without COHIBA source, accounts, token state or network access. Not published to npm; licensing/publication and independent security audit are separate gates.

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
