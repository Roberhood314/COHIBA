# Human Signal PoHA v1 — signed inspection milestone

This release implements cryptographic proof construction and authenticated online inspection. It does **not** issue execution authorization, consume action nonces, execute an agent, transfer tokens, or provide a production developer trust service. The previous `/api/hsc/agency` metadata registry remains unchanged and cannot be used as signed authority.

## Implemented

- Ed25519 agent binding signed by both the current profile wallet and the agent's separate key.
- Principal-signed delegation with exact audience, allowed scopes, exact resource, expiry and optional fresh approval requirement.
- Agent-signed and principal-signed action envelopes binding the exact payload SHA-256 digest.
- Human approval bound to the complete action digest.
- Current key checks, signature verification, scope/resource checks, bounded lifetime, online revocation and all four actor classes.
- Registration/grant replay prevention by principal + nonce. Signed records and their revocations are included in a separate state-root domain.
- Owner-isolated HTTP API, Node proof SDK and an independent local draft-board pilot.

## API

`GET /api/v1/protocol` is public capability discovery. The browser diagnostic console is `/poha-lab.html`, also linked from Human Signal.

Every stateful or owner diagnostic endpoint requires the owner's existing bearer session and exact configured Origin. These are principal diagnostic endpoints, not service credentials for an agent. Agents must never receive the Human session token.

| Endpoint | Request | Result |
| --- | --- | --- |
| `GET /api/v1/agency` | No body | Owner's signed records, configured audience, assurance, execution disabled |
| `POST /api/v1/agents/register` | `{payload, principalSignature, agentSignature}` | Dual-signed binding |
| `POST /api/v1/delegations` | `{payload, signature}` | Principal-signed grant |
| `POST /api/v1/revocations` | `{type: "AGENT" or "DELEGATION", id}` | Immediate owner-session revocation; idempotent |
| `POST /api/v1/actions/inspect` | `{proof: {payload, signature, approval?}, expected: {audience, action, resource, payloadHash, requireApproval}}` | Diagnostic policy classification; `executionAuthorized: false` always |

Audience is the origin of the server's `PUBLIC_BASE_URL`. The API pins the principal key to the authenticated profile's current wallet. Diagnostic expected context is supplied by the owner; an eventual external service must derive this context from its own actual request and server policy. An inspector ALLOW is never permission to execute.

HTTP 200 for inspection means the request was inspected, not that a proof was accepted. Read `result.decision`, `actorClass`, `reasonCodes` and `executionAuthorized`. Authentication failures return 401, wrong origin / missing wallet 403, unavailable or invalid event store 503. Binding and delegation validation failures return 400 without saving.

## Signed schemas and encoding

The exact schemas are defined in `lib/poha-v1.mjs`. No unknown signed fields are accepted. Version is the string `"1"`. Only Ed25519 is supported; keys are canonical padded Base64 of exactly 32 raw public-key bytes; signatures are canonical padded Base64 of exactly 64 bytes. Solana wallets map their Base58 address to these raw bytes. No private key is submitted to the API.

Signing bytes are UTF-8 of `HS/1/<OBJECT_KIND>\n` followed by recursively key-sorted JSON. The supported schema consists only of strings, booleans and arrays of scope strings; scopes must be unique and sorted. This is a restricted canonical JSON profile, not a general-purpose JCS implementation. Timestamps must be canonical UTC ISO strings with milliseconds. Nonces are 22–128 Base64url characters; clients generate at least 128 random bits. Payload hashes are lowercase 64-character SHA-256 hex over the exact application bytes. The SDK does not serialize arbitrary application objects on the caller's behalf.

Binding IDs are `AGENT-` + full SHA-256 of binding signing bytes. Delegation IDs are `DELEGATION-` + full SHA-256 of grant signing bytes. Changing a signed field invalidates the signature; binding and delegation digests are rechecked against stored IDs during inspection.

Maximum lifetimes: binding 30 days, delegation 7 days (never beyond its binding), action and approval 5 minutes. There is no future-time allowance in this milestone. Resource constraints are exact identifiers, with no wildcard or hierarchy expansion. Supported scopes are `READ_PUBLIC_SIGNALS`, `DRAFT_CONTRIBUTION`, `DRAFT_APP_ACTION`; no economic scope exists.

## Human assurance and output semantics

The initial API policy `PHONE_BOUND_DRAFT_V1` requires a phone proof marked verified, no older than 30 days, with a nonempty identity hash shared by no other verified profile. Phone evidence remains private. Wallet possession alone is insufficient. This is a limited phone assurance policy: it does not prove unique humanity, liveness, that a phone is uncompromised, or that a Human authored content. The API has no issuer-signed portable identity attestation yet.

- `VERIFIED_HUMAN`: a direct action is signed by the current principal wallet and meets this phone assurance policy.
- `AUTHORIZED_AGENT`: the agent's signature and the principal's signed binding/delegation satisfy the diagnostic policy.
- `HUMAN_APPROVAL_REQUIRED`: the chain is valid and in scope, but a grant or expected service policy requires an approval that is absent.
- `UNVERIFIED`: missing assurance, forged or changed signatures, wrong key/audience/context/scope, expiry, revocation or unavailable authoritative storage.

The distinction is policy-dependent provenance. Every result has `mode: INSPECT` and `executionAuthorized: false`, including ALLOW. No COH balance, mining rate, signal points or token infrastructure is read by the protocol.

## SDK and pilot

Import `sdk/human-signal-node.mjs` for `signProof`, `publicKeyBase64`, `signingBytes`, `proofDigest`, `payloadDigest` and the owner diagnostic `HumanSignalClient`. Human signatures should normally be produced through the user's wallet `signMessage`; agent signatures stay in the agent runtime. `signProof` is a Node utility for tests and locally controlled keys, not instructions to export a wallet private key.

Run `npm run poha:pilot`. The draft-board example generates ephemeral keys locally and prints the four actor classes using explicitly simulated identity evidence. It demonstrates the cryptographic contract without sending requests, writing user state or performing business actions. It is not evidence of a deployed external customer integration.

## Remaining gates before execution

1. PostgreSQL authoritative identities, grants, revocations and durable unique action/nonce consumption in one transaction. Current JSON is a single-process prototype store, not a multi-replica authorization database.
2. Service enrollment and authentication; trusted service-derived action context and policy, separate from Human sessions.
3. Credential epochs, wallet recovery policy, issuer-signed assurance with explicit freshness and key discovery; fresh user presence for important actions.
4. Atomic approve/authorize/idempotency handling and short-lived signed receipts, with rechecks near execution. Agent retries must not duplicate side effects.
5. Independent security review, restart/concurrency/failure drills and a deployed external pilot.

Revocation currently uses the authenticated owner's session as recovery authority, recorded in the hash chain; it is not a portable Human-signed revocation object. Active signed grants are rechecked against the profile's current wallet. The current root includes signed registry state but is not a signed identity attestation or proof of immutable storage.

The Devnet anchor write re-reads the core after its network transaction so a delayed checkpoint cannot overwrite newer registry or revocation state. Anchoring remains controlled by the existing disabled-by-default gate; this release does not change Railway infrastructure or activate blockchain transactions.
