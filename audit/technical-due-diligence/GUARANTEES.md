# Guarantees and non-guarantees

All positive statements assume the documented trusted computing base, authenticated configured services, correct clocks, and the actual adapter path. They are implementation claims backed by tests, not independent certification.

| Property | In-scope guarantee | Evidence | Non-guarantee |
| --- | --- | --- | --- |
| Complete mediation | Signed draft effect is created only through live proof/service/policy validation and replay admission | PoHA PostgreSQL and end-to-end external-app tests | All repo writes, admin SQL, privileged imports, arbitrary AI tools |
| Non-amplifying authority | Agent cannot substitute human key, widen exact resource/scope/audience, exceed grant expiry, or delegate onward in supported PoHA schema; policy budgets survive concurrent calls | Independent verifier and agent-control tests | Arbitrarily nested delegation or authority manufactured by model output; session authentication equals signed consent |
| Revocation | After serialized central revocation wins, new admissions deny; restored authority ledger preserves known revocations and fences old epochs | PostgreSQL and continuity tests | Undoing completed effects; instant remote revocation with cached issuer status |
| Effect containment | Draft action, resource, audience and payload hash bind exact stored bytes; unsupported effect classes deny | Signed draft substitution/class tests | Sandboxing arbitrary code or containing every external network/tool effect |
| Distributed enforcement | Concurrent workers using one replay DB serialize; quorum validator rejects duplicate/untrusted/divergent votes | Replay/worker/quorum tests | Production BFT consensus, independent operator verification, replay prevention across independent ledgers |
| External-effect atomicity | Local draft effect, nonce, service nonce, approval, receipt and audit commit together or roll back; exact retry reads prior committed result without new execution | Concurrency/failure/deferred-expiry/backup tests | Atomic arbitrary HTTP/chain effects, exactly-once network delivery, a receipt as fresh execution permission |

## Linearization and crash boundaries

Production signed draft: durable PostgreSQL COMMIT is the effect boundary. Concurrent retries create one effect; a lost response can be retried with fresh service authentication and the same exact signed proof, returning the existing effect with `executionAuthorized:false`. Changed bytes or changed authority context do not become a new effect under that retry.

The deferred trigger compares database wall time with the earliest action, approval, binding, delegation and identity-assurance deadline. This closes the check-to-COMMIT expiry gap for the local effect. It is not a bound on arbitrary downstream network delivery time.

Central revocation: the shared transaction lock orders authority changes against admissions. An effect committed before revocation is not erased. Recovery is not reauthorization: continuity restore advances epoch and leaves a fence until trusted operator revalidation. A completely lost server needs an authenticated external latest anchor to establish freshness.

Service outbox: atomic admission stores an intent with replay consumption in the same service database. Dispatch to a remote destination is a separate step. Crash after dispatch but before acknowledging delivery can duplicate execution unless the destination durably deduplicates the operation; acknowledgment before dispatch can lose execution. No general solution is claimed here.

## Three principles

**AI owns intelligence:** a design responsibility for proposal generation, not a verified property of an implemented AI engine here. **Humans own authority:** supported PoHA grants/actions/approvals require human keys, with issuer assurance and trusted service policy. **SI enforces the boundary:** true only for adapters wired to the deterministic gate; a registered action name or signed certificate alone does not cover a missing adapter.
