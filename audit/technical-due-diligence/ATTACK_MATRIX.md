# Attack matrix and evidence index

Paths are relative to the repository. Test names below can be found verbatim with `rg`. Passing means the named finite case behaved as asserted; it is not exhaustive adversarial coverage.

| Attack / fault | Expected result | Executable evidence |
| --- | --- | --- |
| Unknown/prototype action, malformed time/budget, recovered store | DENY without new execution | `test/sovereign-continuity.test.mjs`: SI fails closed on malformed authority, time, budget and recovery |
| Caller ALLOW or mismatched signed intent/epoch | Not accepted as authority | Same file: signed SI requires verified PoHA and binds service context and credential epoch |
| Signature byte mutation | Signature rejection | `test/poha-adversarial-signatures.test.mjs` (deterministic mutation campaign) |
| Key substitution, wrong issuer/audience, missing coverage, stale status | Fail closed | `test/independent-verifier.test.mjs`: forgery, substituted keys, audience, issuer, stale status and absent coverage fail closed |
| Agent widens resource/scope or delegates onward | Deny | Same file: validly signed agent requests cannot widen exact resource, scope or delegate onward |
| Approval substitution, unsigned assurance, caller clock | Deny | Same file: approval binds exact action; unsigned assurances or caller clocks cannot authorize |
| Concurrent draft replay / payload substitution | One new effect, exact retry only | `test/poha-postgres.test.mjs`: SI commits exact signed draft and replay ledger once in one durable transaction |
| Effect write failure | Roll back replay/service nonce and receipt with effect | Same file: SI effect write failure rolls back nonce, receipt and service authentication together |
| Authority expires after inspection before COMMIT | Deferred trigger rejects and rolls back | Same file: database deferred expiry prevents a stale effect at COMMIT |
| Approval or identity assurance expires first | Earliest deadline governs COMMIT | Same file: commit deadline cannot outlive fresh human approval or identity assurance |
| Revoked identity or unsupported effect class | No draft effect | Same file: SI draft commit rejects revoked identity and unsupported effect classes |
| Draft Board retry / tamper / revoked request | 201 first, 200 exact retry without new execution, deny altered/revoked intent | Same file: Draft Board HTTP uses authoritative atomic commit and idempotent retries |
| Restart / durable account and real HTTP integration | Stored authority/replay survives; unsigned/unauthorized effects deny | `test/external-app.test.mjs` (requires native PostgreSQL; must not silently substitute skipped evidence) |
| Shared budget overspend through concurrency/reconfiguration | No budget reset or excess admission | `test/agent-control.test.mjs`: Concurrent distinct requests cannot exceed shared calls/bytes; replay and reconfiguration do not reset budgets |
| Suspend or change policy with queued jobs | Cancel/deny future execution; retain prior effects | Same file: Suspension before execution cancels queued action and stops fresh admission; committed drafts are not undone |
| Multiple workers / queued expiry | One effect; expired job denies | Same file: Concurrent workers commit one harmless effect; expired queued jobs cannot execute |
| Persisted context lies about actual tool/payload | Worker re-derives actual intent | Same file: Worker re-derives actual payload/tool intent instead of trusting persisted expected context |
| Container guest attempts forbidden capability | Scripted isolation assertions only | `test/agent-isolation.test.mjs` (native container path requires `TEST_AGENT_CONTAINER=1`) |
| Sybil, duplicate key/vote, forged signature, split root, missing quorum | Reject; valid 3-of-4 accepts with one signer absent | `test/sovereign-continuity.test.mjs`: quorum accepts one failed node but rejects Sybil, duplicates, forged and split votes |
| Quorum certificate re-used for altered bytes/current revocation | Deny | Same file: distributed research gate binds effect bytes and live revocation before commit |
| Backup rollback/tamper/missing quorum | No state mutation; restored valid state stays fenced | Same file: continuity refuses rollback, tamper, missing quorum and corrupt receipts without mutation |
| Restored nonce/revocation/old epoch | Preserve ledger; deny recovered/old grants | Same file: continuity restores spent/nonces/revocations, advances epoch and fences execution |
| Native replay adapter restart / hook failure | Replay remains rejected; partial admission rolls back | `test/independent-verifier.test.mjs`: external PostgreSQL adapter persists replay across adapter re-instantiation and rolls back partial admissions |
| Two independent replay DBs, stale snapshot, split remote transaction | Expected negative architectural witnesses | `scripts/si-model-check.mjs`, detailed in FORMAL_PROPERTIES.md |

## Coverage gaps

Not yet established: arbitrary host/code compromise resistance, independently operated quorum fault injection, network-partition convergence, worldwide revocation latency, recovery from complete anchor loss, destination HTTP/chain crash atomicity, universal adapter mediation, full cryptographic proof and independent penetration testing. No rows should be promoted to PASS merely because a document or registry mentions the control.
