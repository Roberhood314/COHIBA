# External PoHA integration example

The verifier application and issuer are separate HTTP components. The application pins issuer trust locally and never calls a COHIBA execution endpoint. Synthetic test signers demonstrate the flow; do not use those public fixture keys in production.

Run `node --test test/external-trust.test.mjs` from the repository root. Without TEST_DATABASE_URL it uses embedded PostgreSQL; CI runs native PostgreSQL. The test obtains a service challenge, asks a separate issuer for status, checks exact business bytes and queues exactly one intent across concurrent requests. It also checks key rotation/revocation, actual PoHA database revocation, minimal public responses and transaction rollback when outbox persistence fails.

For your application, install/copy packages/authority-verifier and adapt service.mjs imports. Inject your own PostgreSQL pool, HTTPS audience, service-side trust registry and approval policy. There are no default COHIBA trust anchors. Host behind TLS and enforce request/rate limits. POST /actions accepts exactly `{bundle,payloadBase64,challenge}`; expected policy and trust are not client fields. GET /challenge creates a service nonce with a 30-second lifetime. The sample's fixed resource is draft:external-note; customize it in your server policy, not from a proof.

The issuer requires an operator-selected private signing key kept locally and a trusted resolveSnapshot adapter. It must resolve current evidence and revocation atomically; clients cannot provide assurance fields. The optional PoHA database adapter can serve Human Signal as one chosen issuer, but this is not the only possible authority source. Issuer-service.mjs is a reference handler and is not activated on Railway. The human operator must still assess issuer enrollment/key custody and Human evidence quality.

The included replay store supports a trusted transaction hook: `consume(admission,{onAdmit: async (client, admission) => ...})`. This hook is application code, never a client function. The hook's outbox insert and challenge deletion commit with nonce/epoch consumption. An external action delivery worker must remain idempotent; the example queues intent only.

Backup all hs_verifier_* tables plus hs_external_challenges and hs_external_outbox as one consistent set. Do not restore old or partial data to reset permissions. The prototype does not implement replay-history expiry or outbox dispatch, issuer compromise recovery, blind credentials, ZK or anonymity. Read docs/protocol/ISSUER_TRUST_AND_PRIVACY.md before making privacy claims.
