# Formal safety specification and finite verification

## Vocabulary

Let `Admit(i,s)` be an admission of intent `i` in state `s`; `Effect(i,s,s')` a newly committed effect; `A(h)` human-established authority; `Rights(d)` delegated scope/resource/effect/time/budget; `N` consumed nonces; `R` revoked authority; `E` committed effects; and `epoch` a monotonically increasing credential/recovery version.

| Property | Safety obligation |
| --- | --- |
| Complete mediation | `Effect(i,s,s') => Admit(i,s)` and admission requires valid signature, live authority and actual intent binding |
| Non-amplification | `Rights(child) ⊆ Rights(parent)`; effective expiry(child) ≤ effective expiry(parent); cumulative spend ≤ budget; no agent-origin authority creation |
| Revocation | If revoke precedes admission in authoritative order, admission denies; future states retain known revocation |
| Effect containment | Actual `(audience,action,resource,H(bytes),effectClass)` equals authorized tuple; deny unknown effect adapters |
| Distributed enforcement | For each `(principal, signer, nonce)`, globally at most one new admission, including partitions/restarts |
| External-effect atomicity | Across every selected sink, effect and replay consumption either both commit or neither commits; retries do not create an additional effect |

The distributed and arbitrary external obligations above are specifications, **not satisfied global claims**. For production drafts the last obligation is restricted to one PostgreSQL transaction. No liveness/fairness or eventually delivered external-effect theorem is supplied.

## Executable finite abstraction

Run `npm run si:model`. Source: `scripts/si-model-check.mjs`; regression: `test/si-model-check.test.mjs`.

State: `(epoch, grantEpoch, time, revoked, fenced, mask, budget, nonces, effects)`. Bounds: two nonce identities, three possible requested effect bits (two granted, one outside grant), two epochs, three time ticks (tick 2 expired), budget at most two, one fixed grant epoch. Grant scope/budget may shrink. Transitions: revoke, tick, restore with epoch advance/fence, trusted fence clearing, attenuate, and all combinations of nonce/effect/signature-validity/write-failure admission attempts.

Breadth-first search exhausts all reachable states within these bounds, independent of scheduling order or a maximum trace length. Every transition asserts monotonic nonce/effect/revocation/epoch state, non-amplifying scope/budget, equality of committed nonce/effect masks, deny/failure inertness, and authorized fresh contained effects only. State count and transition count are output as evidence, not hard-coded in documentation.

Signatures are abstract booleans; atomic commit is a single modeled transition. The model does **not** implement cryptography, SQL, lock contention, trigger behavior, identity providers, transports, real time or arbitrary nesting. Equality of modeled nonce and effect masks represents one-to-one admission, not cryptographic content equality. Actual exact bytes and deferred-trigger behavior are checked by implementation tests.

This model is an exhaustive proof of these invariants **only in the finite abstraction**. There is no refinement theorem relating all JavaScript/SQL executions to it. The separate implementation tests narrow this gap, but cannot turn it into an unbounded implementation proof.

## Negative architectural witnesses

The runner also asserts three expected counterexamples:

1. The same proof enters two independently initialized replay ledgers and creates two effects. Local deduplication does not imply global deduplication.
2. Issuer revokes after a status snapshot was created; cached snapshot still says active. Signed freshness is not instantaneous revocation.
3. Replay commits, process crashes, remote effect has not committed. Two independent transactions do not imply external atomicity.

These tiny executable witnesses specify missing architecture. They do not call production endpoints or claim a discovered exploit in the atomic draft path. To prove the broader properties, extend the model to an actual distributed protocol/destination contract and establish implementation refinement, including crash/partition schedules.
