# Human Signal Agent Control pilot — PRE-AUDIT

Research reference, not deployed execution infrastructure, OS isolation, general AI containment or a claim of controlling superintelligence. Four release evidence gates remain BLOCKED. No live issuer/KMS, real customer adoption or public adversarial round is implied.

## What is implemented

`createAgentControlGateway({pool,audience,trust})` uses the integrating application's PostgreSQL pool and explicitly pinned issuer keys. Runtime imports only Node built-ins and the independent verifier. Agent input accepts exactly bundle, challenge, tool, payloadBase64. Tool definitions, approval requirement, expected audience/resource/action and payload hash are service-derived. Two hard-coded tools: dataset.read returns fixed synthetic data; draft.create stores inert bytes as a local database draft. Neither interprets content, sends messages, calls URLs, launches shell commands, accesses secrets nor dispatches arbitrary plugins.

Operator configurePolicy binds an issuer/principal/agent key to this audience, allowed tools, lifetime call/byte budget and optional Human approval. suspend disables that entry. These are trusted host methods: never expose to the Agent, its tools, or unauthenticated HTTP. The example does not supply an administrator identity/HTTP authentication layer. Host isolation and privilege separation are required before exposing an actual Agent. A compromised database, gateway process, trusted operator or alternate credential/network path invalidates the control assumptions.

## Admission and execution

1. Gateway issues a random, expiring challenge bound to an allowlisted tool.
2. Agent obtains an issuer status and submits its signed PoHA bundle plus exact payload bytes.
3. Verifier checks signatures, chain, policy, scope, audience, expiry, approval and issuer freshness. Admission locks the operator policy row and atomically consumes replay state, reserves calls/bytes, deletes the tool-bound challenge and persists the job. Any failure rolls back all reservations/inserts.
4. Worker locks the same policy row before locking its queued job. It rechecks enabled state, policy revision, allowed tool, signed authority and wall-clock deadline before the harmless effect. Effect and final deadline check commit in one database transaction.

Worker derives action/resource/hash again from the actual queued tool and bytes and verifies signed identity/digest against the job. It does not reuse a cached ALLOW or cached expected action/hash. Expiry is checked before the final database update; commit latency can cross the deadline, so no hard real-time completion guarantee is claimed.

Admission response queued=true means a durable reservation, not execution. executeOne returns DONE/CANCELLED/EMPTY. No external effects exist. An admission deadline expiring immediately after commit can cause a denied response while its reservation was persisted; an expired worker cancels it. Treat uncertain responses as uncertain delivery; never refund/retry with a fresh authority blindly. Budget counters and nonce records persist across module restart. All cancellations retain reserved budget; configuration changes never reset counters. Raising lifetime budgets requires the trusted operator. No monthly reset or distributed service-wide quota is claimed.

Suspension and execution serialize on the policy row: suspension committed first cancels subsequent execution. If a worker already acquired the lock and commits first, its draft remains. No undo/instantaneous global shutdown claim. Any policy reconfiguration advances revision and invalidates pending jobs. Issuer revocation retains the verifier's bounded status freshness; rebuild verifier configuration to distribute revoked issuer keys while preserving the database. Human approval proves signed consent, not the safety of the approved intent.

## Reproduce

`npm ci` then `node --test test/agent-control.test.mjs`. For real PostgreSQL locks/concurrency, use TEST_DATABASE_URL pointing to a disposable database, then run the same command. Local fallback uses PGlite serialized connections and cannot independently prove native concurrency. CI supplies native PostgreSQL. Synthetic signers/evidence are never production credentials. Tests cover actual harmless effects, unknown tools, tampered payloads, distinct-request quotas, replay, suspension, policy changes, Human approval, tool-bound challenge substitution, module restart, concurrent workers and expired queued jobs. Text containing malicious instructions is stored only as inert draft data.

This is deterministic adversarial integration testing, not a live-model red-team evaluation or independent public testing. Next experiments require isolated Agent hosts, explicitly denied alternate egress/credentials, actual model tool interactions, fault-injection and full restore of policy, jobs, drafts, challenge and verifier replay/epoch tables. Before internet exposure: authenticated control plane, bounded ingress/queues, TLS, custody, cancellation/operator observability and independent security assessment. Do not retrofit this research pilot directly into production financial or messaging tools.
