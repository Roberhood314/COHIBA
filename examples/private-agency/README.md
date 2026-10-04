# Human Signal local disclosure MVP

**Experimental, synthetic, local-only.** No remote provider, Tor, zkAPI, chain transaction or financial action. The model is an in-process byte-capture mock. Generated owner/Agent keys are ephemeral fixtures, not actual user verification. The integration preserves PoHA v1 signing schemas and scopes. Disclosure policy is opt-in per registered service; existing production services are not enabled automatically.

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

Disclosure outcomes live in `disclosureDecision`; they do not substitute for PoHA's four actor classes or establish Human Proof. `PohaDisclosureGateway` now composes local consent with authoritative PoHA authorization for the mock. The identity assurance remains the existing PHONE_VERIFIED policy, not proof of a unique biological Human.

## Local durability

The ledger stores opaque action/approval nonce hashes, grant counts and revoked grant IDs; it stores no raw vault or prompts. Atomic writes, guarded revision, private mode and a per-file process lock preserve admissions across restart. Corruption or an existing lock denies execution. A crash leaving a lock requires operator recovery; there is no automatic lock deletion or stale-state fallback. Do not restore an old ledger to re-enable consumed permissions. Physical local access to rewrite/delete state is outside the threat model.

Nonce/quota consumption is committed before mock execution. An interrupted execution does not refund permission; create a new approved action if policy/budget permits it. Revocation blocks future admissions; a previously admitted request is not retroactively undone. The mock stores captured bytes only in memory for local inspection. Do not publish request digests from real sensitive content: low-entropy content hashes are dictionary-testable.

## Limits and next gate

Finite vocabulary is data minimization, not proof against reidentification or covert channels. Rare dietary categories or combinations of coarse attributes may still identify someone. An owner can grant authority to an Agent without proving that owner is a unique biological Human. No actual model, external privacy provider, biometric check, ZK credential, portable authorization receipt or production privacy claim is implemented here.

Tests cover minimization, exact sensitive approval, restart/revocation/replay, quota/expiry, injection-shaped inputs and inert model output, signatures/domains/agent substitution, corrupted state and lock contention. Next: independently review this local boundary and PoHA integration, then build a separately confined live adapter with synthetic inputs. Real health data requires explicit Human review of outbound bytes and an independently evaluated privacy/utility tradeoff.

Research rationale: `docs/protocol/PRIVATE_AGENCY_RESEARCH.md` on branch `codex/private-agency-research`.

## PoHA integration (opt-in, mock only)

Use `PohaDisclosureGateway({localGateway, database})` with a trusted in-process `PohaDatabase` and trusted identity resolver. `preview(grant, proposal)` provides a manifest containing the signed grant, sorted field names, request digest and byte count. Sign that manifest's exact bytes as a normal PoHA `DRAFT_APP_ACTION`, using the same Agent nonce as the local disclosure ACTION. The existing delegation must authorize the service audience and exact resource. Call `execute({input, auth, raw, request, resolveContext})`; raw must equal `Buffer.from(JSON.stringify(request))`.

The verifier sees consent metadata and existing identity keys, not vault values or the model request. This is data minimization, not anonymous verification: low-entropy digests and field names remain sensitive. Never publish them. Enroll a dedicated service using `disclosurePolicy: {version: 'HS_LOCAL_DISCLOSURE_V1', endpoint: 'mock://wellness/v1', model: 'mock-wellness-v1', purpose: 'GENERAL_WELLNESS', maxBytes: 4096}`. Other destinations are rejected. Existing services have no disclosure policy; the wrapper refuses their generic receipts. There is no new HTTP route, provider credential or production activation.

Sensitive fields need BOTH fresh PoHA APPROVAL (bound to action digest, which includes nonce and manifest hash) and local disclosure APPROVAL (bound to request digest and Agent nonce). They have different signing domains and cannot substitute for each other. The backend validates the signed grant against the authoritative principal key and Agent signer, current service policy, PoHA delegation, expiry and revocation. It cannot independently know the private request's actual values or byte count; the trusted local projection is the enforcement boundary for those claims.

PostgreSQL counts are in `hs_state_documents` under `disclosure-key:<principalKey>` and keyed by grant digest. Counts and PoHA action/approval nonce inserts commit in the same principal transaction with an additional owner-key lock shared across profile IDs; backup/restore already covers that table. No new migration or plaintext data storage. Local grants are revoked in the local ledger; authoritative Agent/delegation/principal revocation is checked by PoHA. There is no centralized disclosure-grant revocation API yet.

After backend commit, local execution rechecks grant expiry, revocation, exact digest, approval, replay and quota. Inputs are snapshotted before awaiting authorization. A local rejection/crash after commit consumes the backend nonce and budget without releasing data; there is no automatic retry/refund. This is deliberately conservative, not distributed exactly-once execution. Revocation applies to future admission, not undoing already committed authorization. No live-provider send path is present.

Integration verification: `node --test test/poha-postgres.test.mjs test/private-disclosure.test.mjs`. Tests exercise authoritative consent, mock byte projection, concurrent budget enforcement, replay, delegation revocation, local reset resistance, and restoration of quotas and nonce records. CI runs against native PostgreSQL; local tests use embedded PostgreSQL when TEST_DATABASE_URL is absent.

## Website pilot

Open `/disclosure-pilot.html` from Human Signal or PoHA Lab. Login, current phone verification, linked wallet and Phantom message signing are required. The form accepts finite synthetic categories only. It shows the exact mock request before signing, requests binding/delegation/disclosure-grant signatures, and requires two additional signatures for dietary fields. The mock receives projected facts only in the current tab. Changing selections invalidates local state. Agent private keys are non-extractable and never persisted; a reload requires a new grant.

`GET /api/v1/disclosure/pilot` discovers the mock policy. `POST` accepts the existing PoHA request carrying only the manifest and verifies its principal matches the authenticated session. Both require an allowed Origin. Backend admission uses a separate in-memory per-process service key and registered service ID; no service private key reaches the browser. Each process uses its own ID to avoid replicas overwriting signing keys. Old service public records remain in the database after restart, but their lost private keys cannot authorize requests. Authorization must already be enabled with ALLOW_POHA_AUTHORIZATION=true and PostgreSQL available; otherwise the endpoint fails closed. The pilot adds no provider credential or remote-AI traffic.

The browser rechecks local grant/action/approval signatures, exact outbound digest, expiry and local revocation after online admission. It does not claim OS confinement or anonymity. Production wallet acceptance still needs the owner to interact with their actual wallet; automated tests use synthetic signers. No real credentials are collected by this page.
