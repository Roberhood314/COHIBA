# COHIBA / COH

**Tagline:** Fear the Machine. Defend the Human.

COHIBA is a human-first Solana cultural crypto project exploring identity, agency and resilience in the age of artificial intelligence. It combines meme-native storytelling with a verification-first token architecture and public technical evidence.

## Token specification

- Chain: Solana
- Standard: SPL Token
- Symbol: COH
- Total supply: 1,000,000,000 COH
- Decimals: 9
- Tax: 0%
- Destination wallet: `pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t`
- Mint authority after successful launch: permanently revoked
- Freeze authority after successful launch: permanently revoked

## Launch architecture

The Railway service uses a persistent system payer for Devnet fees. The payer is **not** the token owner. A successful launch performs one guarded sequence:

1. Create the SPL mint.
2. Create the authorized wallet ATA.
3. Mint exactly 1,000,000,000 COH to the authorized wallet.
4. Verify the exact base-unit supply.
5. Revoke freeze authority.
6. Revoke mint authority.
7. Verify both authorities are null.
8. Persist the launch record on the Railway volume to prevent duplicate creation.

The web console can recover token state from the server record even when browser local storage is cleared.

## Mainnet safety

Mainnet is disabled by default. It requires all of the following on Railway:

- `ALLOW_MAINNET=true`
- `SYSTEM_WALLET_SECRET_JSON` configured as a Railway secret
- `COHIBA_MAINNET_LAUNCH_KEY` configured as a separate strong secret
- explicit `MAINNET COHIBA` arming in the console

Never commit seed phrases, private keys, wallet JSON files or exchange credentials.

## Metadata

Project metadata: `token/metadata.json`

Website: https://cohibameme.site

Canonical public domain: https://cohibameme.site

## Verification status

- Local validator token logic: verified by GitHub Actions.
- Railway web service: production deployment.
- Devnet public launch: requires a small amount of Devnet SOL in the persistent system payer.
- Mainnet token: intentionally not launched until explicit owner approval and Mainnet secrets/funding are configured.


## Listing Pack

Pre-Mainnet listing preparation for CoinMarketCap, CoinGecko and market-data submissions is maintained in:

- [COHIBA Listing Pack](listing-pack/README.md)
- [Project Profile](listing-pack/PROJECT_PROFILE.md)
- [Token Profile](listing-pack/TOKEN_PROFILE.md)
- [CoinMarketCap Checklist](listing-pack/CMC_CHECKLIST.md)
- [CoinGecko Checklist](listing-pack/COINGECKO_CHECKLIST.md)
- [Submission Data Sheet](listing-pack/SUBMISSION_DATA_TEMPLATE.md)
- [Launch Economics](listing-pack/LAUNCH_ECONOMICS.md)

Mainnet contract, market URLs, liquidity figures and trading metrics remain intentionally blank until they are live and independently verifiable.


## Verification & security evidence

- [Technical Whitepaper](docs/WHITEPAPER.md)
- [Verification Specification](docs/VERIFICATION_SPEC.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Security Control Matrix](docs/SECURITY_CONTROL_MATRIX.md)
- [Security Policy](SECURITY.md)
- Public verification: https://cohibameme.site/verification.html
- Public security evidence: https://cohibameme.site/security.html

COHIBA distinguishes implemented controls from independent audit evidence. No independent-audit claim is made until an external review is completed and verifiably documented.


## Culture & distribution

- [Culture System](docs/CULTURE_SYSTEM.md)
- [Distribution Playbook](docs/DISTRIBUTION_PLAYBOOK.md)
- [Community & Distribution Scorecard](docs/COMMUNITY_SCORECARD.md)
- Public community hub: https://cohibameme.site/community.html

The community north-star metric is **Monthly Active Contributors**, not raw follower count. Participation is open before Mainnet and does not require token ownership.


## Growth execution

- [30-Day Content Execution Calendar](content/CONTENT_CALENDAR_30D.md)
- [Community Activation Playbook](docs/COMMUNITY_ACTIVATION.md)
- [Ambassador Program](docs/AMBASSADOR_PROGRAM.md)
- [Analytics Framework](docs/ANALYTICS_FRAMEWORK.md)
- Ambassador page: https://cohibameme.site/ambassadors.html
- Public aggregate analytics: https://cohibameme.site/analytics.html

Website community analytics are aggregate first-party events only. They do not claim unique users, holders or investors and do not write IP/wallet/email/user identifiers into the metrics record.


## Remaining external gates

The internal preparation for the following areas is complete, but completion depends on independent external evidence:

- **Independent security review:** review package prepared at [audit/INDEPENDENT_REVIEW_PACKAGE.md](audit/INDEPENDENT_REVIEW_PACKAGE.md); an external report is still required.
- **Community traction:** evidence methodology is defined at [docs/TRACTION_EVIDENCE_STANDARD.md](docs/TRACTION_EVIDENCE_STANDARD.md); real observed traction must accumulate over time.
- **Partnerships/integrations:** evidence framework is defined at [docs/PARTNERSHIPS_INTEGRATIONS.md](docs/PARTNERSHIPS_INTEGRATIONS.md); no partner is claimed without counterparty/evidence.
- **Legal/compliance:** internal readiness framework is at [legal/LEGAL_COMPLIANCE_READINESS.md](legal/LEGAL_COMPLIANCE_READINESS.md); external counsel clearance is required before fundraising/token offering.
- **Mainnet/liquidity/market evidence:** irreversible execution remains blocked; evidence standard is at [launch/MAINNET_MARKET_EVIDENCE_STANDARD.md](launch/MAINNET_MARKET_EVIDENCE_STANDARD.md).

No document in this repository authorizes Mainnet launch by itself.


## Governance, treasury & operational hardening

The pre-Mainnet governance/security pack is maintained in:

- [Threat Model v2](docs/THREAT_MODEL.md)
- [Treasury & Key Management Policy](docs/TREASURY_KEY_MANAGEMENT.md)
- [Token Allocation & Vesting Policy](docs/TOKEN_ALLOCATION_VESTING.md)
- [Governance Framework](docs/GOVERNANCE_FRAMEWORK.md)
- [Incident Response Runbook](docs/INCIDENT_RESPONSE_RUNBOOK.md)
- [Proof-of-Community Dashboard Standard](docs/PROOF_OF_COMMUNITY_DASHBOARD.md)
- [Canonical Project Registry Policy](docs/CANONICAL_PROJECT_REGISTRY.md)
- [Machine-readable Canonical Registry](registry/project-registry.json)
- [Launch & Post-Launch Operations Plan](launch/POST_LAUNCH_OPERATIONS.md)

The canonical registry is deliberately null for identifiers that do not yet exist or have not been independently verified. Mainnet mint, treasury vault and liquidity pool values must never be replaced with placeholders that resemble real addresses.


## External readiness & Mainnet go/no-go

The remaining pre-Mainnet external and operational gates are tracked in:

- [Dependency Risk Register](security/DEPENDENCY_RISK_REGISTER.md)
- [External Audit Intake](audit/EXTERNAL_AUDIT_INTAKE.md)
- [External Counsel Intake](legal/EXTERNAL_COUNSEL_INTAKE.md)
- [Treasury Activation Checklist](treasury/TREASURY_ACTIVATION_CHECKLIST.md)
- [Pre-Mainnet Go / No-Go Matrix](launch/PRE_MAINNET_GO_NO_GO.md)

Public work items:
- Independent security audit: GitHub Issue #10
- External legal counsel review: GitHub Issue #11
- Treasury multisig activation: GitHub Issue #12
- Backup/restore + incident tabletop drills: GitHub Issue #13

Internal CI/security readiness is green, but Mainnet remains **NO-GO** until all external/operational blockers carry verifiable evidence.

## Open Review campaign

**COHIBA OPEN REVIEW — BREAK IT BEFORE MAINNET** is open.

- Campaign: [open-review/CAMPAIGN.md](open-review/CAMPAIGN.md)
- Evidence log: [open-review/EVIDENCE_LOG.md](open-review/EVIDENCE_LOG.md)
- Independent review package: [audit/INDEPENDENT_REVIEW_PACKAGE.md](audit/INDEPENDENT_REVIEW_PACKAGE.md)
- Public campaign page: https://cohibameme.site/open-review.html
- Open review targets: https://github.com/Roberhood314/COHIBA/issues

The campaign invites external security/reliability/evidence review before Mainnet. It does not authorize Mainnet and does not advertise an unfunded financial bounty.


## Human Signal Protocol

COHIBA now includes a working Human Signal MVP: a contribution registry and reputation layer for public, verifiable community work.

- dApp: https://cohibameme.site/human-signal.html
- Architecture: [docs/HUMAN_SIGNAL_PROTOCOL.md](docs/HUMAN_SIGNAL_PROTOCOL.md)
- Public registry API: `/api/human-signal/contributions`
- Proof lookup API: `/api/human-signal/proof?id=HSP-...`
- Reputation API: `/api/human-signal/reputation`

Each submission is canonicalized and receives a deterministic SHA-256 proof ID. The current proof class is explicitly off-chain; COHIBA does not claim Solana anchoring until a later version actually writes proof evidence on-chain. Reputation is derived only from verified contributions and creates no token entitlement.


### Human Signal v0.2 — identity and trust network

Human Signal v0.2 adapts useful network-design ideas seen in Pi Network without copying its blockchain or mining model:

- Solana wallet-signature identity;
- daily participation sessions with streaks;
- capped trust connections (max 5);
- derived community roles: SIGNALER, CONTRIBUTOR, BUILDER, CONNECTOR, VERIFIER;
- public aggregate network state;
- no pre-Mainnet COH emission or reward promise;
- trust graph is for reputation/community discovery only and is not part of Solana consensus.

See [docs/HUMAN_SIGNAL_NETWORK.md](docs/HUMAN_SIGNAL_NETWORK.md).


### Signal Mining v0.1 — browser contribution mining

Human Signal now includes a browser-activated mining model for non-transferable Signal Points.

Formula:

`R = B(N) × [1 + P + T + S + C + U]`

where the modifiers represent Pioneer participation, trust graph, streak, verified contribution and meaningful app utility.

- no CPU/GPU Proof-of-Work;
- no COH minting;
- no guaranteed future conversion to COH;
- one active session per verified profile;
- maximum 24-hour session;
- server-side elapsed-time accounting;
- first 10,000 verified profiles form the Pioneer cohort;
- Pioneer boost decays to zero over 180 active days;
- trust/streak/contribution/utility boosts are capped or logarithmic.

See [docs/SIGNAL_MINING.md](docs/SIGNAL_MINING.md).
