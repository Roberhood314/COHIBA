# COHIBA Signal Mining — Web Mining Model v0.1

## Objective
Signal Mining is a browser-activated contribution-mining system for the Human Signal Network.

It is **not Proof-of-Work**, does not use a visitor's CPU/GPU for hashing, and does not mint COH. Mining here means earning non-transferable **Signal Points (SP)** from measurable participation that helps grow, secure or create utility for the Human Signal ecosystem.

## Why this design
Pi Network's published mining model combines a systemwide base rate with capped trust/security-circle effects, referral/network growth, application utility and node contributions, using diminishing/logarithmic components to reduce gaming.

COHIBA adapts the useful incentive-design idea, not Pi's blockchain or token economics.

## Rate formula

`R = B(N) × [1 + P + T + S + C + U]`

Where:
- `R` = Signal Points per hour;
- `B(N)` = dynamic network base rate;
- `P` = temporary Pioneer boost;
- `T` = trust-graph boost;
- `S` = streak boost;
- `C` = verified-contribution boost;
- `U` = meaningful application-utility boost.

### Dynamic base rate

`B(N) = 1 / sqrt(1 + N / 10,000)`

where `N` is the count of wallet-verified Human Signal profiles.

This creates scarcity pressure without abrupt halvings.

### Pioneer boost
The first 10,000 verified profiles are marked as the Pioneer cohort.

Pioneer boost starts at +25% and linearly decays to 0 after 180 active days.

This rewards early network formation without creating a permanent aristocracy.

### Trust boost
`T = 0.08 × min(validTrustConnections, 5)`

Maximum +40%.

Trust connections are capped and only connect wallet-verified profiles. They do not participate in Solana consensus.

### Streak boost
`S = min(0.20, log2(1 + streakDays) × 0.04)`

Maximum +20%.

### Verified contribution boost
`C = min(0.75, ln(1 + reputation30d) / ln(101) × 0.75)`

Only verified work contributes. This favors useful output rather than passive tapping.

### App utility boost
`U = min(0.35, ln(1 + meaningfulActions7d) / ln(31) × 0.35)`

Maximum +35%. Mere page-open time is not a meaningful action.

## Mining session
- User verifies a Solana wallet.
- User explicitly presses **Start Signal Mining** on the website.
- Server snapshots the current rate.
- Session can accrue for at most 24 hours.
- Points are calculated server-side from elapsed time.
- User may claim during or after the session.
- A profile can have only one active session.

No background browser CPU mining occurs.

## Signal Points
Signal Points:
- are non-transferable;
- are not COH;
- are not a security, investment claim or guaranteed future token allocation;
- have no guaranteed conversion ratio;
- exist to measure participation/reputation in the pre-Mainnet network.

Any future COH-related utility must be separately approved, legally reviewed, publicly specified and technically implemented.

## Anti-abuse
v0.1:
- wallet signature identity;
- one active mining session per profile;
- server-side time calculation;
- 24-hour hard session cap;
- rate snapshot;
- capped trust graph;
- diminishing logarithmic boosts;
- reputation boost only from verified contributions;
- no reward for passive page-open duration;
- no CPU/GPU browser mining.

Future:
- duplicate-account heuristics without invasive fingerprinting;
- challenge-based activity proofs;
- referral graph sybil controls;
- reviewer attestations;
- Devnet proof anchoring.
