# PoHA v1 API reference

Base origin: `https://cohibameme.site`. JSON requests; HTTPS required. API budget: 60 requests/minute/IP in PostgreSQL for this release. Owner payloads <=16KiB; service authorization body <=24KiB. Rate-limit denial is HTTP 429; unavailable storage is 503. Do not reset consumed nonces after a network error.

| Method/path | Credentials | Input/result |
|---|---|---|
| GET `/api/v1/protocol` | Public | Protocol version, mode, execution/nonce consumption flags |
| GET `/api/v1/status` | Public | Storage, account storage and backup/checkpoint health |
| GET `/api/v1/checkpoints` | Public | Last 25 aggregate trust checkpoints; verify pinned issuer/key |
| GET `/api/v1/services/{id}` | Public | Registered service public key, audience and policy; 404 if absent |
| GET `/api/v1/agency` | Owner bearer + allowed Origin | Owner principal/key/assurance, bindings and delegations |
| GET `/api/v1/agency/graph` | Owner bearer | Owner graph and contribution/risk provenance |
| POST `/api/v1/agents/register` | Owner bearer + allowed Origin | `{payload,principalSignature,agentSignature}`; 201 record |
| POST `/api/v1/delegations` | Owner bearer + allowed Origin | `{payload,signature}`; 201 record |
| POST `/api/v1/revocations` | Owner bearer + allowed Origin | `{type:"AGENT"|"DELEGATION",id}`; 200 record |
| POST `/api/v1/identity/revoke` | Owner bearer + allowed Origin | `{}`; irrevocably revokes this principal in v1 |
| POST `/api/v1/actions/inspect` | Owner bearer + allowed Origin | `{proof,expected}`; diagnostic result, consumes no action nonce |
| POST `/api/v1/actions/authorize` | Service signature headers | Actual operation and signed proof; online execution decision |

Owner session acquisition stays in the first-party account UI. Passwords, OTPs, session tokens and wallet keys must never be included in developer evidence. Phone assurance is bounded, not proof of unique biological humanity.

## Signed payloads

All keys are required; no extra keys are accepted in signed payloads. Sorted-key restricted JSON, UTF-8, domain `HS/1/{kind}\n`, Ed25519. Public keys: canonical base64 raw32; signatures: canonical base64 raw64. ISO UTC timestamps, fresh random base64url nonce >=22 characters. Use SDK helpers instead of inventing a serializer.

- AGENT_BINDING: version, principalId, principalKey, agentKey, name, audience, nonce, issuedAt, expiresAt. Human and Agent both sign identical bytes. Max lifetime 30 days.
- DELEGATION: version, principalId, principalKey, bindingId, agentKey, audience, scopes, resource, approvalRequired, nonce, issuedAt, expiresAt. Human signs. Max 7 days, within live binding; scopes sorted/unique.
- ACTION: version, performer (`HUMAN`/`AGENT`), principalId, signerKey, delegationId (empty for Human), audience, action, resource, payloadHash, nonce, issuedAt, expiresAt. Actual actor signs. Max 5 minutes.
- APPROVAL: version, principalId, principalKey, actionDigest, audience, nonce, issuedAt, expiresAt. Human signs exact ACTION digest. Max 5 minutes, single-use when authorized.

Allowed scopes: READ_PUBLIC_SIGNALS, DRAFT_CONTRIBUTION, DRAFT_APP_ACTION. v1 does not grant financial authority. Audience is an exact registered HTTPS origin; resource matching is exact in grants. Hash actual application bytes with SHA256, not arbitrary caller-provided descriptions.

## Service authorization

Headers: `x-hs-service-id`, `x-hs-time` (ISO UTC within 60 seconds), `x-hs-nonce`, `x-hs-signature`. Sign `HS/1/SERVICE\n{id}\n{time}\n{nonce}\n{sha256(rawBody)}`. `HumanSignalServiceClient` creates them locally.

Body:

```json
{
  "proof": {"payload": "ACTION object", "signature": "base64 signature"},
  "action": "DRAFT_APP_ACTION",
  "resource": "draft:article",
  "payloadBase64": "base64 of actual operation bytes"
}
```

An approval adds `proof.approval={payload,signature}`. Output is `{ok:true,result}`. Expected actorClass: VERIFIED_HUMAN, AUTHORIZED_AGENT, HUMAN_APPROVAL_REQUIRED or UNVERIFIED. Decision: ALLOW, REQUIRE_APPROVAL or DENY. Only ALLOW plus executionAuthorized=true permits execution. Denials can be HTTP 200 with a DENY result; transport success is not permission.

Before execution verify serviceId, expiry, actionDigest against the submitted proof, and that the proof payload matches the application's own audience/action/resource/payloadHash. Persist an actionDigest uniqueness constraint. Receipt lifetime <=30 seconds. Receipt is an online response, not an issuer-signed transferable proof. Authorization consumption and external app persistence are not one distributed transaction; failure may require a fresh proof.

Service authentication/replay errors are HTTP 401; malformed request or revoked principal can be 400; oversized service request is 413. ReasonCodes describe exact denial. Never map every failure to APPROVAL_REQUIRED.

## Enrollment and key lifecycle

Enrollment/rotation/disable is operator-reviewed through `node scripts/service-policy.mjs POLICY.json` with the operator's private database connection. Policy fields: id, publicKey, audience, scopes, resourcePrefix, optional enabled/requireApproval booleans. Policy updates are audited. Existing development pilot environment settings may repin its policy on restart; the generic services do not use that bootstrap. To disable the pilot persist its configuration change too.

Generate independent Ed25519 service keys locally; store outside source/chat and never reuse Human/Agent/treasury keys. Replacing publicKey rejects the old service signatures. Set enabled=false to stop new authorizations. Existing accepted execution receipts can remain usable until their short expiry, so incident response must also pause the application's execution path where required.
