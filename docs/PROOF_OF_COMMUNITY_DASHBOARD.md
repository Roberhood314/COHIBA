# COHIBA Proof-of-Community Dashboard Standard v1.0

## Objective
Measure real participation without converting vanity metrics into false claims of users, holders or organic demand.

## North-star metric
**Monthly Active Contributors (MAC)**

A contributor counts only when a verifiable contribution exists during the measurement window.

## Dashboard layers

### Layer A — Reach
- X impressions
- X profile visits
- website views
- referral clicks

Reach is not proof of unique humans unless the source explicitly provides a valid unique-user metric.

### Layer B — Engagement
- GitHub issues opened
- PRs opened/merged
- Open Review submissions
- community content submissions
- translation/research contributions
- verified campaign participation

### Layer C — Contribution
- Monthly Active Contributors
- new contributors
- returning contributors
- second-contribution rate
- 30-day returning contributors
- accepted contributor outputs
- security findings submitted / confirmed / fixed / retested

### Layer D — Distribution quality
- organic vs paid reach
- referral-source mix
- community-created assets
- ambassador outputs
- qualified external mentions
- partner-introduced activity

### Layer E — Post-Mainnet market evidence
Only after Mainnet:
- holders from public source;
- unique traders where reliably available;
- pool/liquidity data;
- on-chain transaction activity.

Market activity must never be mixed with pre-Mainnet community counts.

## Data integrity rules
- First-party aggregate website events are labeled **interaction counts**.
- Do not claim first-party clicks are unique users.
- Do not write wallet, email, IP or device fingerprint into the public aggregate metrics record.
- Paid and incentivized activity is labeled separately.
- Bots, known duplicates, purchased followers and self-generated circular traffic are excluded where identifiable.
- Every published metric includes source, date range and methodology.

## Contribution evidence record
Recommended fields:
- contribution_id
- date
- contributor_alias_or_public_handle
- category
- evidence_url
- status: submitted / accepted / merged / published / rejected
- campaign
- organic_or_incentivized
- notes

No private identity data is required for public contribution proof.

## Dashboard release cadence
- Weekly internal snapshot.
- Monthly public evidence snapshot.
- Quarterly methodology review.

## Minimum public dashboard
Display:
1. MAC;
2. new contributors;
3. returning contributors;
4. GitHub contribution count;
5. Open Review activity;
6. community-created assets;
7. organic vs paid classification;
8. methodology/version date.

## Anti-gaming controls
Exclude:
- purchased engagement;
- fake giveaways;
- bot farms;
- duplicate self-controlled accounts where known;
- wash interactions;
- artificial GitHub spam;
- incentivized actions represented as organic.

## Status labels
Each metric must be one of:
- VERIFIED SOURCE
- FIRST-PARTY AGGREGATE
- COMMUNITY EVIDENCE
- ESTIMATE — not preferred for public headline use
- NOT YET AVAILABLE

## Current state
Instrumentation/framework: **IMPLEMENTED/PREPARED**
Real traction values: **OBSERVATION REQUIRED**

No synthetic number may be inserted merely to make the dashboard appear populated.
