# SI production deployment: signed local draft commit

This release deploys a bounded execution path, **not a production certification of the entire Human Signal/Sovereign Continuity protocol**. Independent security audit is outstanding. Distributed SI, automatic recovery and arbitrary external effects remain experimental.

## Supported effect

`POST /api/v1/actions/commit-draft` accepts an existing Ed25519 service-authenticated PoHA request for `DRAFT_APP_ACTION`. The service audience, enrolled scopes, resource prefix, exact payload hash, human assurance, delegation, current credential epoch and approval requirements are checked online. A deterministic SI decision is bound to the verified intent.

One PostgreSQL transaction writes the action nonce, approval nonce when required, exact base64 draft bytes, receipt and audit event. The principal transaction lock serializes authorization against delegation/principal revocation. Database-time expiry is checked before the effect and before returning for commit. The effective deadline is the earliest expiry of the action, approval, human assurance, delegation and agent binding. A deferred PostgreSQL constraint trigger checks that deadline again during COMMIT, so a delay before COMMIT cannot bypass expiry. A failed effect write rolls back the nonce and receipt. The API response follows the successful database commit.

`hs_effects` stores private draft content; it has no public listing endpoint. Draft Board calls this endpoint and displays the authoritative result. It no longer performs a second write into its separate database. Historical rows in `draft_board_drafts` are preserved; this change does not migrate or delete them. This application now depends on the Human Signal store for new drafts, so it is not an independent external-effect atomicity demonstration.

A repeated exact signed request, using fresh service authentication, may report `effectCommitted=true` and `idempotentReplay=true`. That receipt has `executionAuthorized=false`: the caller must not perform a new effect. A revoked/expired proof cannot use the retry path to regain permission. Requests previously consumed through the inspection/authorization-only API cannot manufacture a missing draft later.

## Enable and disable

The endpoint requires all of:

- working PostgreSQL PoHA and account storage;
- `HS_ACCOUNT_STORAGE=postgres`;
- existing `ALLOW_POHA_AUTHORIZATION=true`;
- `ALLOW_SI_DRAFT_COMMIT=true`;
- an enrolled service with a valid Ed25519 key and matching policy.

The new flag defaults to false. Missing storage or a disabled flag returns 503 and performs no effect. `localDraftCommitEnabled` on the SI status endpoint reports configured readiness; it is not an audit assertion. Mainnet/transfer/withdrawal permissions are unchanged.

To stop this effect path, set `ALLOW_SI_DRAFT_COMMIT=false` and redeploy. Do this before rolling back either web or Draft Board source. The migration is additive and retains data. Normal PostgreSQL transaction recovery applies to a crash during commit; exact retries resolve an already committed draft without executing again.

## Backup and remaining operational gates

`hs_effects` is included in the existing private PostgreSQL backup/restore bundle. Restore tests preserve both business content and nonce history. Older bundles normalize the absent table to an empty table while retaining their existing action ledger. Never restore an old backup over a live database; the trusted restore routine requires an empty target. It sets a transaction-local archival-restore flag so expired historical effects can be restored without treating them as new execution; that flag is never set by the public commit path.

An old backup is not proof of current revocation or spend state. Production disaster recovery still requires a separately retained latest head, key validation, credential/session revalidation and a fenced cutover. This release does not enable automatic restoration, add replicas, reset keys or appoint independent node operators.

Verification covers exact-byte substitution, concurrent replay, write-failure rollback, identity change before commit, revoked principal, unsupported effects, full backup/restore and existing regression tests. Independent audit, production load/capacity evidence, multi-region disaster drills and external-effect atomicity remain outstanding.
