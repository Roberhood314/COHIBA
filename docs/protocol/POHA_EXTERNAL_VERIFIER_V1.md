# External PoHA verifier experiment v0.1

This additive experiment preserves deployed PoHA v1 signing schemas/scopes. It is not enabled in the production API and does not change existing Human Signal or COH economic policy. The standalone package is packages/authority-verifier; public vectors are examples/independent-verifier/vectors.json.

## Portable evidence and service obligations

The external application receives the original dual-signed AGENT_BINDING, principal-signed DELEGATION, signed ACTION and optional signed APPROVAL. Signing bytes are unchanged: UTF-8 `HS/1/<kind>\n` followed by restricted recursively sorted JSON. SHA-256 IDs, canonical Base64 keys/signatures, nonce/time/resource limits and Ed25519 verification are independently implemented from the public v1 specification. No imports from the COHIBA core are used in the distributed package.

A service pins issuer public keys in its own configuration and accepts PHONE_VERIFIED only if its own policy explicitly permits that assurance. It supplies exact expected payload hash/action/resource/audience and a fresh random challenge. The client cannot select trust anchors or the admission clock. Human Proof issuer trust has not been removed; it is explicit and replaceable. An independent implementation alone is not decentralized trust.

## Experimental signed authority status

The domain is `HS/EXPERIMENTAL/AUTHORITY_STATUS/1\n` + restricted sorted JSON. Exact payload fields:

| Field | Meaning |
|---|---|
| version | HS_AUTHORITY_STATUS_EXPERIMENT_1 |
| issuer | Service-pinned issuer identifier; signing key is obtained from service config |
| audience, challenge, actionDigest | Bind the statement to this service and this exact action/challenge |
| principalId, principalKey | Current issuer-resolved principal and wallet key |
| identityAssurance, assuranceExpiresAt | Current policy confidence and its expiry |
| credentialEpoch | Positive monotonic version, checked against service's durable floor |
| principalRevoked | Authoritative principal revocation flag |
| records | Unique sorted `{id,revoked}` entries explicitly covering required binding and delegation |
| issuedAt, expiresAt | Canonical UTC times; future issue rejected, maximum lifetime 30 seconds |

The envelope is `{payload,signature}` with canonical padded Base64 Ed25519 signature. The issuer MUST resolve current key, assurance, epoch and revocation from authoritative storage atomically when issuing it. An issuer must never sign client-supplied claims or accept unsigned record status. This experiment supplies verification and synthetic issuance fixtures; it does not enable a production issuer endpoint or signing-key deployment. The additive v0.2 reference handler and optional storage adapter are described in ISSUER_TRUST_AND_PRIVACY.md.

After issuer verification, the external verifier independently checks both binding signatures, delegation signature, content-derived IDs, exact principal/Agent/audience linkage, scope/resource, expiry, revocation coverage, action signature and optional exact-action Human approval. The chain is one hop; redelegation is denied.

## Admission and replay

INSPECT ALLOW never authorizes execution. AUTHORIZE requires service-side atomic consumption of `(signerKey,actionNonce)`, optional `(principalKey,approvalNonce)`, `(audience,challenge)` and monotonic issuer/principal epoch update. A reject must roll back all partial inserts. Store failure denies admission. The package rechecks the validity deadline after asynchronous consumption; expired admission consumes state conservatively but never returns execution permission.

All replicas share one durable ledger. An admitted business action requires a durable outbox/idempotency implementation in the integrating app; verifier admission is not distributed exactly-once execution. Freshly issued status can be stale until its 30-second deadline after revocation. Higher-risk policies may require shorter status or online execution-boundary checks. An anchor is not a substitute for fresh revocation.

## Privacy and evidence gates

Raw private facts are unnecessary for this verifier. Stable keys, principal IDs, delegation IDs, issuer identity, metadata and content hashes remain linkable. Do not label the experiment anonymous or zero knowledge. Future selective disclosure needs a reviewed credential format, threat model, issuer enrollment, revocation design and benchmarks; no custom ZK cryptography is proposed here.

Completed evidence: standalone copy execution without COHIBA source; deterministic public vectors; cross-core byte/classification checks; forged/substituted evidence, scope escalation, approval mismatch, expiry/revocation and issuer/challenge attacks; atomic replay adapter.

Remaining gates: independent audit, live authoritative status issuer, issuer key lifecycle, actual third-party deployment/acceptance, privacy/linkability evaluation, operational limits and recovery drill of the external verifier ledger. Do not describe these gates as completed by passing unit tests.
