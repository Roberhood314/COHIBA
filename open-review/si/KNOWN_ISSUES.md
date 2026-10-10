# Known issues in the fixed review target

## Concurrent fresh-schema startup

The target `916f9f6f8d0403a32fbfe83f0f565871ec7e051c` uses `CREATE TABLE IF NOT EXISTS` without a shared initialization lock in the external PostgreSQL verifier adapter. Concurrent fresh-schema startup can fail with PostgreSQL `23505`, `pg_type_typname_nsp_index` duplicate-key errors. This is an availability/setup defect observed by maintainers, not an externally submitted audit finding and not evidence of an unauthorized effect.

Observed in [COHIBA CI run 38063335141](https://github.com/Roberhood314/COHIBA/actions/runs/38063335141), while agent-isolation and verifier tests initialized the same fresh database concurrently. The small pinned workflow passing does not disprove this broader startup race.

[PR #55](https://github.com/Roberhood314/COHIBA/pull/55) adds transaction-scoped advisory locking around both initialization batches and a native regression that races 20 initializers in an empty isolated schema, checks one deferred expiry trigger, and checks recovery after initialization failure. The pinned target stays unchanged so the original behavior remains inspectable. Reviewers should state whether they reviewed the original target or the later fix SHA. Native CI validation of the fix is required before merge.
