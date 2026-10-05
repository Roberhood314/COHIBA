# Sovereignty Inference and Sovereign Continuity — alpha

SI means **Sovereignty Inference**, a COHIBA-defined deterministic authority evaluator. It does not mean superintelligence. No Tesla code, technology license or affiliation is claimed.

## Implemented paths

1. Authenticated Human session → authority envelope → SI → alpha commit receipt.
2. Ed25519 PoHA → online verifier → SI → PostgreSQL authorization transaction.
3. Operator-pinned committee → signed snapshot certificate → opt-in alpha quorum commit gate.
4. Operator-pinned checkpoint → signature/integrity/rollback checks → private authority-ledger restore → execution fence and incremented epoch.

The session envelope is not an Ed25519 human-intent ceremony. The signed PoHA path checks real signatures, identity assurance, delegation, audience, payload, scope and current authority before SI receives the in-process inspection result. SI is never called with a client-supplied inspection result by the public authorization route. `ALLOW_POHA_AUTHORIZATION` continues to control execution; this upgrade does not enable it.

SI decisions are bound to intent and credential epoch and are **not execution capabilities**. Existing nonce consumption, fresh principal revalidation, expiry and transaction checks remain mandatory. The project economy (COH, SP, mining balances) is not an input to SI authority decisions.

## Quorum certificate experiment

`lib/sovereign-quorum.mjs` validates a configured committee with `n = 3f + 1` distinct Ed25519 keys and `2f + 1` signatures. Signatures bind network, kind, epoch, monotonic sequence, state root, policy hash, exact intent, issue time and expiry. A certificate lasts at most 60 seconds. Duplicate identities, duplicate keys, untrusted nodes, divergent roots, stale votes and invalid signatures fail closed.

`commitQuorumProtectedAction` re-derives intent and authority-ledger root immediately before the synchronous alpha commit. The committee, policy and sequence must come from trusted operator configuration. The Agent may provide votes but cannot choose trust anchors or expected state. `receiptData` is included in the intent digest.

This is certificate validation over a pinned snapshot, **not Byzantine consensus**. There is no network transport, replicated log, durable distributed nonce ledger, leader election, membership governance or enforced node anti-equivocation. Certificate validation alone cannot stop a trusted operator from pinning a fork. The web service still runs its existing topology; the quorum gate is an opt-in research API, not a new distributed production network. Passing a four-key local test is not evidence of independent operators.

## Continuity and recovery

`lib/sovereign-continuity.mjs` handles the private alpha authority ledger: spent budgets, revoked roots, used nonces, receipts and epoch. It checks receipt hashes, signed state root and externally pinned minimum sequence. Restoration cannot remove locally known revocations, nonces, expenditure or receipts, or decrease epoch. Restoration increments epoch, invalidates old envelopes and sets `storageRecovered=true`.

The routine never removes its own fence, creates a human grant or performs a protected effect. Operator revalidation and new human authorization are required before resuming. The saved checkpoint must be freshly endorsed by the configured committee for the restore ceremony; a year-old certificate cannot be replayed as a current approval.

This snapshot is not a full database backup. Existing `PohaDatabase.exportBackup/restoreBackup`, private backup worker and checkpoint worker remain the PostgreSQL recovery mechanism. No automatic production restore or public checkpoint download is introduced. The minimum sequence, expected checkpoint root and trust anchors must survive outside the lost server. Losing every copy of those anchors prevents safe bootstrap; absent anchors must halt, not reset to genesis.

The restore function is synchronous and experimental. Durable compare-and-swap of checkpoints, operator authentication, key rotation governance, credential recovery, session invalidation across replicas, encrypted private storage and end-to-end restore/failover drills remain required before unattended production recovery.

## Invariants and verification

- A recovered/corrupt authority store cannot create a commit receipt.
- Malformed expiry, budget, epoch and authority fail closed.
- No quorum certificate creates human authority.
- Recovery cannot turn a revoked or spent authority into a fresh grant.
- A protected external effect still needs its own commit-time verifier and atomic adapter.

Run `npm run verify:all`, `npm run si:drill` and `npm run build`. The drill generates ephemeral test keys in memory, demonstrates a 3-of-4 quorum with one absent signer, restores an endorsed ledger and confirms the execution fence. It publishes no private keys or user state.

## Evidence limits and release gates

Experimental and pre-audit. Independent security review, formal verification, real multi-operator consensus, partition testing, disaster recovery and external-effect atomicity are outstanding. Neither immortality nor control of arbitrary AI systems is claimed. An AI can bypass this boundary whenever it possesses credentials or tools outside a protected adapter.

Public implementation status: `/api/v1/sovereignty/status`. It reports configured availability and research limits, not secret state or independent audit results.
