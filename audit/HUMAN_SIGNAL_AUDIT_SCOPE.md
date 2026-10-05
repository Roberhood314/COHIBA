# Human Signal audit intake — PRE-AUDIT

No auditor has accepted this package. Audit-ready is a preparation label, never a safety claim. Freeze an exact Git commit at engagement start and supply source, lockfile, CI logs, native PostgreSQL results and reproducible vectors. Changes after that commit require explicit coverage/retest before release claims.

## Review scope

Review lib/poha-v1.mjs, lib/poha-postgres.mjs, lib/account-state-postgres.mjs, origin/session/OTP handling in web-server.mjs, the entire packages/authority-verifier directory, lib/external-authority-issuer.mjs, disclosure authorization and the external HTTP service examples. Map each public endpoint to authentication, origin, authorization, transaction boundaries and rate limits. Review deployment configuration separately without exporting secrets.

Required attacks: signature/domain/canonicalization substitution; duplicate/extra keys; principal and binding substitution; cross-audience/resource/scope escalation; approval for another action; concurrent action/approval/challenge replay across replicas; stale issuance, credential epoch rollback, key compromise/rotation; committed revocation and snapshot freshness; deadlocks, transaction timeout, delayed KMS signing; outbox partial failure; backup restoration replay; malformed bodies, injection and log/evidence leakage.

Assumptions to assess: Ed25519 key custody, issuer evidence quality, shared PostgreSQL ownership, operator distribution of pinned trust, clock accuracy, TLS/ingress controls. PHONE_VERIFIED means control of a verified phone credential; it does not prove uniqueness, liveness or human authorship. Stable IDs/keys remain linkable. Single-hop delegation only. Status freshness is bounded (default 10 s, maximum 30 s); revocation after issuance is not instantaneous.

## Required handoff and acceptance

Provide data-flow/threat matrix in docs/protocol/ISSUER_TRUST_AND_PRIVACY.md, SDK/spec, public synthetic vectors, test commands (`npm ci`, `npm run build`) and operational runbooks. Auditor records identity, independence/conflicts, exact SHA, dates, exclusions, methods, severities and reproducible findings. Maintain findings with owner, fix SHA and auditor retest evidence. Unresolved Critical/High findings block the four-gate release; maintainer assertion or risk acceptance alone does not clear them.

Public report must have stable URL and SHA-256. Separate source review from live infrastructure assessment. Local test success is not an audit. No public production probing is authorized by this file.
