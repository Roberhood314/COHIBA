# SI threat model

## Assets and adversary

Protect human signing authority; delegation scope and expiry; exact intended payload, audience and resource; revocation and credential epoch; budgets; action/approval/service nonces; stored drafts; recovery fences; and private identity data.

An adversary can control an agent and its key, request bodies, timing, concurrency, retry order, proof transport, and its own service registration requests. It may present valid but stale or substituted signatures, duplicate quorum identities, malformed values, conflicting votes, or rollback snapshots. It cannot forge an uncompromised Ed25519 signature under the cryptographic assumption. A compromised human key can sign harmful authority: the protocol does not infer real-world consent from key possession.

## Trusted computing base and boundaries

| Boundary | Trusted component / assumption | Consequence if compromised |
| --- | --- | --- |
| Human authority | Human wallet/key custody and signing UI | Attacker can authorize within that principal's rights |
| Identity assurance | Account database and verification providers | False or stale PHONE_VERIFIED claims |
| Authority decision | Deployed API, canonicalization, PoHA verifier, SI implementation | Forged allow decisions or bypassed checks |
| Durability and ordering | PostgreSQL transactions, locks, unique constraints, trigger, restricted writer access | Replay, rollback or effects without valid authority |
| Service intent | Registered service key, fixed route adapter and actual bytes | Confused deputy if the adapter lies about business intent |
| Independent verifier | Pinned issuer policy, issuer key custody, local replay DB and worker | False status or local admission bypass |
| Recovery | Authenticated latest external anchor, privileged operator, private backups | Rollback to spent or revoked authority if anchor is lost |
| Runtime | Node, OS, dependencies, deployment operator, secrets handling | Full bypass of application checks |

## Failure policies

Malformed proof, unsupported action, untrusted signer, revoked record, invalid time, exhausted budget, missing durable replay adapter, missing quorum, inconsistent root, or recovery fence must deny. Availability is intentionally sacrificed when authority cannot be established. A denial is not proof of service availability under load.

Central revocation is ordered by the shared principal/account locks. If a commit wins before revocation, its already committed effect remains; revocation is prospective. External cached status can remain valid until its bounded expiry; clock assumptions and current issuer availability matter. A partition cannot simultaneously provide instant revocation and unrestricted offline admission in this design.

## Explicit exclusions and open risks

No proof covers malicious database administrators, arbitrary host compromise, human coercion, phishing-resistant signing UI, malicious issuer identity assurance, universal prompt-injection resistance, side-channel freedom, global multi-database ordering or arbitrary irreversible external effects. Advisory locks require every cooperating writer to obey the lock discipline. Direct SQL and privileged restoration are outside normal admission.

The signed-draft SQL trigger checks freshness at transaction commit. The independent PostgreSQL replay adapter checks time before and after its hook in application code; it does not provide that same deferred-trigger guarantee for every external hook. Do not infer production COMMIT-time freshness from this research adapter. `authorizeAuthority` also checks expiry after the consume callback returns: an expiry-related DENY at that point can follow an already committed admission/outbox. A DENY response cannot be assumed to undo that callback. Integrators need durable admission reconciliation and must distinguish an uncommitted rejection from a committed-but-late response; this research path is not promoted to the production draft guarantee.

Counterexample witnesses and concrete tests are indexed in [the attack matrix](ATTACK_MATRIX.md). System/token threats outside SI remain documented in [the repository threat model](../../docs/THREAT_MODEL.md).
