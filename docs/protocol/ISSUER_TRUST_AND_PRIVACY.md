# Issuer trust and privacy boundaries — experimental v0.2

This extends PR #28, not the deployed PoHA signing schemas. Production activation remains absent. A service independently selects issuer keys and assurance policy; it does not ask COHIBA for an execution decision. That removes a mandatory COHIBA verification endpoint, **not trust in the issuer's Human evidence**.

## Key lifecycle

Issuer registry entries can explicitly configure enabled, allowedAudiences, minimumEpoch, acceptedAssurances and keys. Each key has id, raw Base64 publicKey, notBefore, notAfter and revoked. A status with keyId is accepted only against that exact pinned key; duplicate IDs/keys, revoked keys, out-of-window status/key times and unknown issuer/key are denied. Rotation requires an operator-approved new public key; the client cannot introduce it. Existing single-key v0.1 fixtures remain supported. keyId selects the pinned key; the status payload and signature establish issuer identity. Never accept TOFU, keys supplied in the client bundle, automatic HTTP key discovery or unreviewed issuer replacement.

Credential epoch rollback is checked both by optional service policy and the monotonic per-issuer/principal replay store. Issuer key revocation is effective once every verifier replica has received the updated trusted configuration. Distribution, admin authorization, compromise response and hardware/KMS key custody are operator responsibilities, not solved by this module.

## Issuer authority source

createAuthorityIssuer accepts a trusted resolveSnapshot callback and signs only projected state. The callback must atomically resolve current principal ID/key, assurance/expiry, epoch, principal revocation, and the exact binding/delegation records with explicit boolean revocation states. Missing revocation state is denied. Request fields cannot override any of these claims. The issuer verifies the presented signed chain before returning a status/bundle and allows only configured audiences. Metadata status is action/challenge/audience-bound and lasts 10 seconds by default (30 maximum).

The optional lib/external-authority-issuer.mjs adapter reads existing PoHA PostgreSQL state under the principal transaction lock and rechecks resolved identity context. It is not imported by web-server.mjs, creates no endpoint and activates no signing key on Railway. Hosts must provide a consistent account-state context to the resolver. Revocation committed before a new snapshot is denied; a previously issued status may remain usable until its deadline. No instantaneous or trustless revocation claim is made.

## Disclosure matrix

| Party | Necessary data | Data deliberately omitted | Residual risk |
|---|---|---|---|
| Human/local Agent | Exact outbound request and requested authority | No wallet private key exported | Local host compromise; malicious alternative network paths |
| Human Proof issuer | Its own evidence, current key/epoch, chain IDs, action hash, audience/challenge | No application payload needed | Issuer can correlate principals, audiences and requests |
| External verifier | Signed chain and minimal authority status; exact bytes of its own requested business action | No raw phone/name/GPS/health evidence from issuer | Stable keys/IDs and metadata remain linkable |
| Public response/log view | Actor class, decision, reason codes, expiry | Principal IDs, keys, issuer ID, action digest and full proofs | Request timing/IP and operational logs need separate controls |
| Remote model | Only fields allowed by local disclosure policy | Authorization bundle and private vault | Provider inference, billing/IP correlation; live adapter not implemented |

publicDecision provides the narrow response/log view. It does not remove data already seen by the verifier, hide network metadata or make signed v1 delegation unlinkable. Plain content hashes may reveal low-entropy facts; do not publish them. Name/resource fields may also leak identity unless developers choose opaque identifiers.

No custom ZK scheme, anonymous credential, selective-disclosure proof, Tor or zkAPI implementation is added. Pairwise keys/pseudonyms would require reviewed Human identity binding, revocation and recovery semantics; do not relabel stable v1 keys as privacy-preserving anonymity. The current claim is **minimal disclosure and private evidence separation**.

## Independent HTTP integration

examples/external-trust-service defines two separately hosted components: an issuer returning signed status from its trusted resolver, and an external application which pins issuer trust, issues its own challenge and verifies locally. The application's runtime imports only the standalone package and Node built-ins; its PostgreSQL pool belongs to the application. No COHIBA bearer token, COH balance or COHIBA authorization call is used.

The application derives audience/action/resource/payloadHash from its own configuration and exact submitted bytes. It atomically consumes replay state, deletes its issued challenge and queues a durable business intent in the same transaction. Failure of business persistence rolls back nonce consumption. An outbox worker still needs explicit idempotent delivery semantics; queued intent is not an executed remote side effect.

These are integration examples tested over separate loopback HTTP servers with synthetic signers, not independent customer adoption. Before internet exposure: TLS, ingress limits, durable issuer evidence, reviewed key custody, backup/restore of ALL verifier/challenge/outbox tables, bounded retention and independent audit. No example is publicly deployed by this change.
