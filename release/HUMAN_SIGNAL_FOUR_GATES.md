# Human Signal four-gate publication policy

Current PRE_AUDIT. All four gates in human-signal-gates.json are null. No tests, fixture, COHIBA-operated reference service or maintainer review may substitute independent acceptance. Development on all tracks can continue concurrently.

The read-only /api/v1/release-readiness endpoint and generated security-evidence.json project the registry. Missing/malformed data fails closed. AUDIT_READY means only completed preparation, never passed audit. EVIDENCE_RECORDED means all four documentary entries match the exact deployed sourceCommit; entries are maintainer assertions requiring independent validation. It is not a cryptographic certificate. This mechanism does not activate issuer routes, authorize actions, bypass owner approval or launch a token. Existing mainnet safety locks remain separate.

Required gate evidence (all four): exact reviewedCommit, responsible operator, HTTPS evidenceUrl, SHA-256 reportSha256, accepted=true, retestComplete=true and unresolvedCriticalHigh=0. The exact-commit requirement intentionally prevents an old report clearing new code; do not substitute dates or a latest-main pointer. No evidence-submission HTTP write route exists. Registry updates require reviewed repository changes. Do not fabricate independent identities/reports to satisfy this structure. Public evidence must omit secrets and raw Human data.

| Gate | Acceptance evidence |
| --- | --- |
| independentAudit | Identifiable independent auditor, scope, exact SHA, findings and independent retest; zero unresolved Critical/High. |
| liveIssuer | Actual operator, enrollment/assurance rules, signing custody, credential/key revocation, rotation/compromise and recovery drill record. |
| externalService | Actual external operator owns trust anchors, policy, nonce/epoch/outbox store and local verification; valid and negative cases with deployment evidence. |
| publicAdversarialTesting | Dated authorized staging round, participants/methods, attack coverage, findings, fixes and retests. |

These records are documentary and cannot automatically establish institutional independence or evidence authenticity. Audit preparation cannot be declared complete merely because an intake document exists; freeze review source, assemble CI/native PostgreSQL evidence and obtain an auditor handoff. Current policy deliberately blocks an open-release claim. Marketing may describe implemented experiments and documented limitations, not a proven-safe or anonymous protocol.
