# COHIBA Hybrid Human + Resource Mining v0.2

## Objective
COHIBA mining is a **server-accounted contribution system** for the Human Signal Network.

It is not Proof-of-Work and does not reward raw CPU/GPU consumption. Before Mainnet, mining records:
- non-transferable Signal Points (SP);
- equal provisional Pending COH in an off-chain ledger.

Pending COH is not SPL COH, is not transferable/tradable, and does not guarantee future conversion or distribution.

## Design principle
A mining reward should correspond to verifiable value supplied to the ecosystem. COHIBA therefore combines:
1. **Human Signal** — verified people, trust, participation, contribution, utility and referrals.
2. **Resource Contribution** — server-observed availability and verified useful node work.

Passive electricity use, self-reported hardware performance and unverified bandwidth are not mining resources.

## v0.2 rate formula

`R = B(N) × M(H,Q) × E`

Where:
- `R` = SP/Pending COH provisional rate per hour;
- `B(N)` = dynamic network base rate;
- `H` = normalized Human Signal score;
- `Q` = verified Resource Contribution score;
- `E` = Human Proof eligibility factor.

### Dynamic base rate
`B(N) = 1 / sqrt(1 + N / 10,000)`

### Hybrid weighting
Human and resource contribution are combined at:
- **60% Human Signal**
- **40% Resource Contribution**

Human raw components are:
- Pioneer;
- Trust / Security Circle;
- Streak;
- Verified Contribution;
- Utility;
- Verified Referral Growth.

The combined hybrid score is:

`HybridScore = 0.60 × H + 0.40 × Q`

and the mining multiplier is:

`M = min(2.5, 1 + 1.5 × HybridScore)`

The global multiplier ceiling remains **2.5×**.

Active mining sessions keep their rate snapshot. Formula changes affect newly created sessions rather than rewriting already-accrued history.

## Human Signal components

### Pioneer
The first 10,000 profiles form the Pioneer cohort.

The Pioneer component starts at **+50% raw Human boost** and decays linearly to zero after 180 active days.

### Trust
`T = 0.08 × min(validTrustConnections, 5)`

Maximum raw Trust contribution: +40%.

### Streak
`S = min(0.20, log2(1 + streakDays) × 0.04)`

### Verified contribution
Only verified community contribution/reputation contributes to this component.

### Utility
Only server-recognized meaningful actions contribute. Merely opening a page is not counted as useful application work.

### Referral
Only referred profiles that later satisfy the required verification criteria count toward the verified referral component. Self-referral is rejected.

## Resource Contribution score

`Q = 0.30 Uptime + 0.25 UsefulWork + 0.20 Reliability + 0.15 Storage + 0.10 Network`

Every component is bounded to 0..1.

### Uptime — 30%
The browser can send authenticated resource heartbeats only while a mining session is active.

Server rules:
- server timestamp is authoritative;
- sub-five-minute heartbeat spam is ignored;
- distinct 10-minute availability buckets are measured;
- the browser does not report or control the resulting score.

### Useful Work — 25%
Requires server-issued work and verified results.

Examples for a future COHIBA Node:
- deterministic indexing;
- public-data verification;
- bounded AI inference tasks;
- integrity/hash verification;
- other sandboxed jobs defined by the project.

A client cannot increase this score by simply reporting that work occurred.

### Reliability — 20%
Derived from sustained availability and successful verified resource jobs.

### Storage — 15%
Requires challenge/response proof for data the project actually asked a node to store.

### Network — 10%
Requires verified network/relay jobs that the COHIBA system actually requested.

**Passive bandwidth sharing is not rewarded.**

## Browser mining vs COHIBA Node

### Browser
Production browser mining can currently provide:
- authenticated uptime evidence;
- Human Signal activity;
- Human contribution and trust signals.

It does not perform background CPU/GPU hashing.

### Future COHIBA Node/Desktop Agent
Compute, storage and network resource rewards require a separate controlled node/desktop runtime.

The node must use:
- server-issued jobs;
- bounded resource limits;
- signed/authenticated job assignment;
- deterministic or independently verifiable results;
- replay protection;
- job expiry;
- per-profile/device rate limits;
- no hidden proxying or third-party traffic relay.

Until such a node exists and passes verification, compute/storage/network components remain zero unless backed by real server-verified evidence.

## Mining session
- Maximum session: 24 hours.
- One active session per profile.
- Rate is snapshotted on session start.
- Accrual is calculated server-side.
- Claims add equal numeric amounts to SP and provisional Pending COH.
- A resource heartbeat can be accepted only for an authenticated profile with an active mining session.

## Anti-abuse
Current controls:
- authenticated account session;
- phone verification support;
- wallet signature identity support;
- one active mining session per profile;
- server-side elapsed time;
- rate snapshot;
- capped boost components;
- server-time resource heartbeat;
- heartbeat rate limiting;
- no client-trusted CPU/GPU/bandwidth metrics;
- no reward for passive bandwidth;
- no reward for unverified node work.

Planned node controls:
- job challenge nonce;
- result hash/attestation;
- duplicate-job/replay detection;
- proof expiry;
- resource ceilings;
- anomaly detection;
- independent verification for high-value jobs.

## Economic boundary
Mining never changes the fixed total supply of **1,000,000,000 COH**.

Pre-Mainnet Pending COH is provisional accounting against the project-defined Community Mining Reserve. No SPL token is emitted by browser/resource mining before Mainnet.

Mainnet launch, token distribution, market activation and any final treatment of Pending COH remain separate gated decisions.
