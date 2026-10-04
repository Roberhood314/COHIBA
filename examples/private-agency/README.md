# Human Signal local disclosure MVP

**Experimental, synthetic, local-only.** No remote provider, Tor, zkAPI, chain transaction or financial action. The model is an in-process byte-capture mock. Generated owner/Agent keys are ephemeral fixtures, not actual user verification. This feature does not modify PoHA v1 or production permissions.

Run from the repository root:

```sh
node examples/private-agency/demo.mjs
node --test test/private-disclosure.test.mjs
```

The transcript shows the complete outbound mock request: coarse age band and activity category, then dietary data only after a fresh owner signature. Name/email/phone/GPS, owner/Agent keys and proof metadata stay out of the captured request. A synthetic injection response is returned as text and cannot invoke tools. Results are permission checks, not health recommendations or an anonymity certificate.

## Implemented boundary

`lib/private-disclosure.mjs` signs with Ed25519 under a separate `HS/EXPERIMENTAL/DISCLOSURE/1/{kind}` domain. Owner key is pinned at gateway construction. GRANT binds agent key, fixed purpose, fixed mock endpoint/model, sorted fields, sensitive approval fields, max bytes/requests, nonce and time. ACTION binds exact reconstructed request digest and grant digest to the Agent. APPROVAL binds exact request digest AND Agent nonce to that grant. REVOKE is owner-signed. Grant lifetime <=1h; action/approval/revoke <=1m.

The gateway projects its private cloned vault. No user/model-provided prompt, headers, attachment, URL, history or callback is accepted by execute. The vocabulary is finite: age bands, three activity bands, dietary categories. Unknown keys, out-of-scope fields, bad values, forged/substituted proofs and unsupported destinations fail closed. Dietary data always requires fresh approval, even if an owner attempts to sign a grant removing this constraint.

There is intentionally NO networking transport. A new live-provider transport would need separate design/review, pinned destination, redirects/DNS/TLS controls, credential management and OS network confinement. A library cannot stop a different process from exfiltrating files through an unrelated socket. This MVP verifies only its own reachable egress path; it is not an Agent sandbox.

Disclosure outcomes live in `disclosureDecision`; they do not substitute for PoHA's four actor classes or establish Human Proof. A future integration must additionally obtain authoritative identity/delegation authorization from Human Signal before remote execution.

## Local durability

The ledger stores opaque action/approval nonce hashes, grant counts and revoked grant IDs; it stores no raw vault or prompts. Atomic writes, guarded revision, private mode and a per-file process lock preserve admissions across restart. Corruption or an existing lock denies execution. A crash leaving a lock requires operator recovery; there is no automatic lock deletion or stale-state fallback. Do not restore an old ledger to re-enable consumed permissions. Physical local access to rewrite/delete state is outside the threat model.

Nonce/quota consumption is committed before mock execution. An interrupted execution does not refund permission; create a new approved action if policy/budget permits it. Revocation blocks future admissions; a previously admitted request is not retroactively undone. The mock stores captured bytes only in memory for local inspection. Do not publish request digests from real sensitive content: low-entropy content hashes are dictionary-testable.

## Limits and next gate

Finite vocabulary is data minimization, not proof against reidentification or covert channels. Rare dietary categories or combinations of coarse attributes may still identify someone. An owner can grant authority to an Agent without proving that owner is a unique biological Human. No actual model, external privacy provider, biometric check, ZK credential, portable authorization receipt or production privacy claim is implemented here.

Tests cover minimization, exact sensitive approval, restart/revocation/replay, quota/expiry, injection-shaped inputs and inert model output, signatures/domains/agent substitution, corrupted state and lock contention. Next: review this local boundary, integrate real PoHA authorization, then build a separately confined live adapter with synthetic inputs. Real health data requires explicit Human review of outbound bytes and an independently evaluated privacy/utility tradeoff.

Research rationale: `docs/protocol/PRIVATE_AGENCY_RESEARCH.md` on branch `codex/private-agency-research`.
