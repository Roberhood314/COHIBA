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
