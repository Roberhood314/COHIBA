# Human Signal adversarial and public testing — PRE-AUDIT

No public testing round is completed or currently authorized against production. Automated internal tests and loopback examples are distinct from independent public participation.

## Internal reproducibility

Run npm ci and npm run build. Run `node --test test/issuer-custody.test.mjs test/independent-verifier.test.mjs test/external-trust.test.mjs` with TEST_DATABASE_URL pointing to a disposable PostgreSQL database for native transaction coverage. Synthetic fixtures are public and must never become issuer keys. Preserve exact commit, environment, commands, failing seeds/input, severity, fix and retest. Never direct generated traffic at production.

## Public round launch requirements

Publish an isolated staging URL, source SHA, dates, permitted endpoints, synthetic accounts, concurrency/rate ceilings, reporting channel and responsible operator before invitations. No real user records, funds or production credentials. Define stop conditions for infrastructure saturation, unexpected data exposure or escape beyond scope. Disable affected endpoints and retain minimal evidence on a stop condition. A reporting contact, hosting and researcher participation are not provisioned by this document.

Coverage: forgery, malformed serialization, replay across replicas, cross-service/audience confusion, delegation escalation/redelegation, approval substitution, issuer/key/credential revocation, stale status and delayed signer, epoch rollback, transaction/outbox failures, backup restore and metadata privacy. Tests must include negative cases and concurrent duplicate actions with exactly one committed intent.

Completion requires a dated report identifying scope, participants/methods, exercised attacks and uncovered limitations, findings, remediation and retest; publish sanitized reproductions and report hash. A large number of automated cases alone cannot clear this gate. COHIBA-operated external examples are not independent service adoption. An actual external operator must own trust policy, keys, replay store and admission decisions and document valid/denied acceptance themselves.
