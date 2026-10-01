# COHIBA ($COH) — Project Profile

## Project identity
**Name:** COHIBA  
**Symbol:** COH  
**Network:** Solana  
**Category:** Community / Meme / Internet Culture  
**Canonical website:** https://cohibameme.site  
**Source repository:** https://github.com/Roberhood314/COHIBA  
**Official X:** https://x.com/hunhkcgy  
**Current stage:** PRE-MAINNET — infrastructure, verification and security hardening

## One-line thesis
**COHIBA is a human-first Solana cultural crypto project built around one question: how do people preserve identity, agency and meaning as artificial intelligence becomes increasingly capable?**

## Core narrative
**Fear the Machine. Defend the Human.**

COHIBA is not positioned as an anti-AI protocol. It uses satire, meme culture and internet-native storytelling to explore a real cultural tension: technology can expand knowledge, creativity and productivity while also changing how people understand identity, authorship, privacy, work and control.

The project converts that tension into a transparent, verifiable digital asset and community brand.

## Mission
**Turn fear into awareness, and awareness into community.**

COHIBA aims to build a recognizable cultural signal for people who support technological progress while believing that human identity, dignity, choice and creativity should remain central.

## Vision
Create a durable internet-native community brand whose cultural identity is supported by transparent token engineering, public verification, measurable security controls and independently observable market data.

## Why COHIBA exists
Many meme projects optimize primarily for speed, attention and short-term speculation. COHIBA takes a different engineering approach:

1. establish the narrative and brand;
2. define the token specification;
3. build verification and security infrastructure;
4. validate issuance mechanics on Devnet;
5. publish machine-readable evidence;
6. launch Mainnet only after release gates are satisfied;
7. publish market claims only after they are independently verifiable.

The objective is not to make a meme project look complex. The objective is to make important claims testable.

## Technical differentiation

### Verification-first architecture
COHIBA publishes explicit launch invariants and does not treat documentation alone as proof.

Core post-launch invariants are designed to require:
- exactly **1,000,000,000 COH** total supply;
- exactly **9 decimals**;
- exactly **1,000,000,000,000,000,000 base units**;
- verified destination token balance at issuance;
- immutable metadata;
- mint authority permanently revoked;
- freeze authority permanently revoked;
- persistent final state: `LOCKED_VERIFIED`.

### Formal launch lifecycle
The release system models issuance as an explicit state machine:

`NEW → MINT_CREATED → ATA_READY → SUPPLY_MINTED → METADATA_READY → FREEZE_REVOKED → MINT_REVOKED → LOCKED_VERIFIED`

Unexpected supply, authority or persistence state causes the launch flow to fail closed.

### Public blockchain evidence
COHIBA exposes read-only blockchain verification data including:
- network state;
- Solana slot and block height;
- mint address after release;
- supply;
- decimals;
- mint/freeze authority state;
- destination token balance;
- largest token accounts;
- recent mint signatures;
- explorer references.

### Machine-readable transparency
Canonical project, token and market state are designed to be available in machine-readable JSON rather than existing only as marketing copy.

### Security evidence
The repository includes:
- formal verification specification;
- threat model;
- security control matrix;
- automated invariant tests;
- deterministic mutation testing;
- security posture checks;
- CI verification gate;
- SHA-256 build evidence manifest.

Implemented controls are intentionally distinguished from independent security audit evidence.

## Token specification

| Field | Specification |
|---|---|
| Name | COHIBA |
| Symbol | COH |
| Network | Solana |
| Standard | SPL Token |
| Total supply | 1,000,000,000 COH |
| Max supply | 1,000,000,000 COH |
| Decimals | 9 |
| Base-unit supply | 1,000,000,000,000,000,000 |
| Token-level tax | 0% |
| Metadata | Metaplex Fungible Token |
| Metadata target | Immutable |
| Mint authority after verified issuance | null |
| Freeze authority after verified issuance | null |
| Mainnet mint | POST-MAINNET — not yet published |

## Planned allocation model

| Allocation | Share | Amount |
|---|---:|---:|
| Public launch & liquidity | 75% | 750,000,000 COH |
| Community | 10% | 100,000,000 COH |
| Marketing | 5% | 50,000,000 COH |
| Development | 5% | 50,000,000 COH |
| Treasury | 3% | 30,000,000 COH |
| Team | 2% | 20,000,000 COH |

This allocation is a planning model. Final circulating supply, category wallets, locks, vesting and liquidity positions must be derived from real post-launch on-chain state.

## Market integrity policy
COHIBA does not treat synthetic activity as evidence of adoption.

The project policy explicitly rejects:
- wash trading;
- self-generated volume represented as organic demand;
- fake holders;
- fabricated liquidity;
- fake exchange screenshots;
- false market-cap claims;
- undisclosed circular trading;
- unverifiable LP-lock claims.

Price, volume, liquidity, holders and market capitalization remain unpublished as verified project facts until they are independently observable.

## Security model
Mainnet launch is default-deny.

The release architecture uses:
- explicit Mainnet enablement;
- separate launch authorization secret;
- signer validation;
- origin validation;
- launch-specific and API rate limits;
- request-size bounds;
- persistent launch records;
- duplicate-launch protection;
- exact supply verification;
- authority-state verification;
- immutable metadata target;
- public post-launch verification.

An external independent security review remains a required pre-Mainnet control and must not be represented as completed until verifiable evidence exists.

## Current verified status

### VERIFIED / IMPLEMENTED
- canonical production website;
- public GitHub repository;
- token specification;
- Devnet issuance/rehearsal evidence;
- fixed-supply verification logic;
- immutable metadata design;
- authority-revocation validation;
- persistent launch-state architecture;
- blockchain-data API/dashboard;
- infrastructure-readiness API/dashboard;
- technical Whitepaper;
- verification specification;
- threat model;
- security control matrix;
- automated invariant/mutation tests;
- CI verification/security gate;
- cryptographic build-evidence generation;
- machine-readable project/market schemas.

### PRE-MAINNET / NOT YET CLAIMED
- official Solana Mainnet mint;
- Mainnet circulating supply;
- public DEX pool;
- real liquidity;
- market price;
- holder count;
- 24-hour trading volume;
- market capitalization;
- CMC/CoinGecko market listing.

## Release philosophy
COHIBA follows a **Mainnet-last** release philosophy.

Infrastructure, documentation, verification, failure handling and evidence collection are built before the irreversible release. The project deliberately prefers delayed claims over unverifiable claims.

## Founder & creator
**JohnPC — Founder & Creator**

Responsibilities include:
- project thesis and cultural narrative;
- brand direction;
- product direction;
- technical architecture direction;
- transparency and release philosophy.

COHIBA currently uses a founder-led governance model. No decentralized-governance claim is made.

## Public evidence
- Website: https://cohibameme.site
- Whitepaper: https://cohibameme.site/whitepaper.html
- Verification: https://cohibameme.site/verification.html
- Security Evidence: https://cohibameme.site/security.html
- Blockchain Data: https://cohibameme.site/blockchain.html
- Infrastructure Readiness: https://cohibameme.site/infrastructure.html
- Market Readiness: https://cohibameme.site/market-readiness.html
- Token Metadata: https://cohibameme.site/token-metadata.json
- Machine-readable Project Data: https://cohibameme.site/project-data.json
- Machine-readable Market Data: https://cohibameme.site/market-data.json
- Source: https://github.com/Roberhood314/COHIBA
- X: https://x.com/hunhkcgy

## Brand and legal position
COHIBA ($COH) is an independent digital community and cultural crypto project.

It does not claim affiliation with unrelated companies, consumer brands, cigar manufacturers or trademark owners.

Project documentation is informational and technical. It is not a guarantee of price, liquidity, adoption, listing, returns or profitability.

## Profile principle
**A COHIBA claim should be considered trustworthy only when a reader can identify what the claim means, where its evidence comes from, and whether the evidence is independently reproducible.**
