# Human Signal → PoHA → SI: implemented review boundary

Version: `HS_REVIEW_SPEC_1`. Status: **PRE-AUDIT**. This document describes existing versioned components; it introduces no new wire protocol.

## Authority classes and inputs

| Component | Inputs from trusted host | Untrusted request | Output |
| --- | --- | --- | --- |
| PoHA v1 | Principal public key, audience, identity assurance, current binding/delegation/revocation state, expected action/resource/actual-byte hash, current time | Strict signed ACTION and optional signed APPROVAL | ALLOW, REQUIRE_APPROVAL or DENY; actor class and reasons; `executionAuthorized: false` |
| Signed PoHA SI | In-process verifier result, credential epoch, expected context and time | Original proof, never client-supplied inspection verdict | ALLOW/DENY and decision digest; `executionAuthorized: false` |
| Session SI/framework | Trusted policy catalog, state, epoch, spent budget, recovery fence and time | Session envelope and proposal | ALLOW/DENY, proposal binding and required commit revalidation; `executionAuthorized: false` |
| Effect boundary | Current verified authority, actual bytes, replay ledger and destination-specific commit policy | Proposed effect | Commit once or deny; only this layer performs an effect |

Signed PoHA and session envelopes are different authority classes. Session SI does not verify Ed25519 signatures; an envelope must originate from trusted host/session infrastructure. Framework ALLOW binds a proposal digest but does not by itself compare it to a human-signed exact-effect grant; the effect adapter must enforce that binding. Do not pass arbitrary client JSON or a model's ALLOW into a trusted-verifier argument.

## Signed wire and lifetime rules

The normative implemented schemas and canonical bytes are `fields`, `schema` and `signingBytes` in `lib/poha-v1.mjs`. Fields must match the chosen kind exactly. Version is `1`; domain prefixes are `HS/1/AGENT_BINDING`, `HS/1/DELEGATION`, `HS/1/ACTION`, `HS/1/APPROVAL`, followed by newline and sorted-key restricted JSON. Keys/signatures are canonical base64 Ed25519; payload hashes are lowercase SHA-256 of actual bytes. Nonces are 22–128 base64url characters. Audience is an HTTPS origin.

Bindings require signatures from distinct human and agent keys. One-level delegation is human-signed and binds that registered agent, audience, scopes, resource and approval policy. Delegation cannot outlive binding. Maximum lifetimes: binding 30 days, delegation 7 days, action/approval 5 minutes. Future issuance and `now >= expiresAt` reject. Recursive delegation is not implemented. Approval, when required, binds the exact signed action digest.

## Evaluation and commit order

1. Host establishes principal trust and expected action/resource/hash from the intended effect, not from attacker-controlled claims alone.
2. PoHA verifies schema, time, audience/context, action signature, human assurance, current signed binding/delegation, scope/resource and any fresh approval.
3. SI accepts only the trusted in-process verification result and checks the expected context, expiry and credential epoch format. It does not independently fetch or authenticate issuer state.
4. The destination revalidates current authority at commit, consumes replay identifiers and commits the exact effect under its destination-specific transaction/idempotency semantics.

Read-only inspection does not consume action nonces, so repeated inspection can ALLOW. A previous decision is not a reusable execution capability. In the review demo, current inspection + SI + nonce admission + memory write happen synchronously. In the supported deployed draft path, the authoritative SQL transaction is documented in `docs/SI_PRODUCTION_DRAFT_COMMIT.md`. No global atomicity follows from either example.

## Mandatory negative outcomes within tested scope

Missing/invalid signature or proof, mismatched audience/action/resource/bytes, substituted agent/principal, expired/future proof, absent required approval, revoked binding/delegation and unavailable recovered authority state cannot reach an effect. Session SI additionally enforces trusted action/effect policy, matching subject/epoch and budget. Effect admission rejects used nonces. Revocation must come from current authoritative state, never a stale caller-provided boolean.

Trust boundaries include identity/issuer trust, principal key ownership, signed delegation, host policy catalog, authority store, effect gateway and destination. An alternate unwrapped handler, compromised host, stale authority snapshot, independent replay database or external crash after admission is outside the offline demo guarantee. No claims of privacy anonymity, real identity uniqueness, post-quantum cryptography, AI containment outside mediated effects or independent audit are made.
