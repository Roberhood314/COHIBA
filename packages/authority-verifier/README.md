# Human Signal independent authority verifier

Version **0.1.0-experimental.1**. Node >=22, no runtime dependencies. Copy this directory into another application; it runs without COHIBA source, accounts, token state or network access. Not published to npm; licensing/publication and independent security audit are separate gates.

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

Only one Human→Agent delegation hop is supported. No wildcard scopes, implicit inheritance, Agent→Agent redelegation, token transfers or general tool execution. Expired grants, binding substitution, altered resource/audience and approvals for another action are denied. Network retrieval of issuer status, verified issuer enrollment and externally operated production acceptance remain work to do.

Run `node examples/independent-verifier/demo.mjs` from the repository root for public synthetic vectors. `node --test test/independent-verifier.test.mjs` includes cross-implementation signing/classification, adversarial mutations, concurrent replay, epoch rollback, a PostgreSQL adapter and a copied standalone package with no repository dependency. These are automated checks, not an independent security audit or proof of a third-party customer's adoption.
