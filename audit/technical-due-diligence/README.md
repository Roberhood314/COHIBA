# Human Signal / SI Technical Due-Diligence Pack

This pack assesses source code, not an independently audited security certification. The production scope is **signed local draft commit in one PostgreSQL database**. The remainder of Human Signal and the distributed SI experiments must not inherit that label.

Principles: AI may propose intent; humans establish authority; SI evaluates and enforces the boundary through trusted adapters. SI is deterministic, not an intelligence model. A model response, client-supplied ALLOW, inspection, receipt, or quorum certificate cannot by itself create authority or authorize an additional effect.

| Property | Defensible current conclusion |
| --- | --- |
| Complete mediation | Implemented and tested for the signed draft endpoint and fixed research tools; not established for every mutation in this repository. |
| Non-amplifying authority | Tested for the supported, human-signed, one-level PoHA chain and policy budgets. Session envelopes are a separate, weaker authority class. |
| Revocation | Serialized online checks in the central authority store; bounded freshness in external issuer-status experiments; not instant global revocation. |
| Effect containment | Exact signed bytes, resource, audience and fixed effect class in draft commit; no arbitrary agent tool permission. |
| Distributed enforcement | Shared-database concurrency and pinned quorum validation tested; Byzantine consensus and global replay across independent databases unimplemented. |
| External-effect atomicity | Atomic local SQL effect and replay ledger; service-owned outbox admission demonstrated; arbitrary HTTP/chain effect atomicity unproved. |

Read [architecture](ARCHITECTURE.md), [threat model](THREAT_MODEL.md), [guarantees and non-guarantees](GUARANTEES.md), [formal properties](FORMAL_PROPERTIES.md), [attack matrix](ATTACK_MATRIX.md), [benchmarks](BENCHMARKS.md), and [reproducible verification](REPRODUCIBLE_VERIFICATION.md), and [independent audit / integration / adoption gates](EXTERNAL_VALIDATION.md).

## Evidence levels

1. Specification and code inspection: a reviewable claim, not a proof.
2. Executable tests: finite observed cases against the implementation.
3. Exhaustive finite abstraction: all reachable states of the documented small model, without a refinement proof to JavaScript/SQL.
4. Full CI evidence: native PostgreSQL plus container isolation, source-bound artifacts and test results.
5. Independent audit / unbounded formal proof: **not completed**.

The runnable model includes expected negative witnesses for independent replay ledgers, stale revocation snapshots and split external transactions. These are counterexamples to broad architectural claims, not demonstrations of exploitation against the deployed signed-draft endpoint.

## Remaining acceptance gates

To claim all six properties globally: enumerate and gate every effect adapter; formally connect implementation to specification; deploy independently operated enforcement nodes with durable global admission ordering and membership governance; define revocation linearization and partition policy; integrate destination-side idempotency or a shared transactional protocol for each external sink; perform crash, partition and restore fault campaigns; obtain independent audit. Until then use the scoped conclusions above.
