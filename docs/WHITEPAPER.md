# COHIBA ($COH) — Technical Whitepaper v1.0

**Document status:** Pre-Mainnet / Infrastructure Build
**Network:** Solana
**Token standard:** SPL Token
**Symbol:** COH
**Fixed supply target:** 1,000,000,000 COH
**Decimals:** 9
**Token-level tax:** 0%
**Canonical website:** https://cohibameme.site
**Source repository:** https://github.com/Roberhood314/COHIBA
**Official X:** https://x.com/hunhkcgy

> This document separates VERIFIED facts, PLANNED architecture, and POST-MAINNET data. No Mainnet mint, market pair, liquidity, holder count, price, market capitalization, or trading volume is treated as official until independently verifiable.

## 1. Executive Summary
COHIBA is a Solana-based community and cultural crypto project centered on human agency in the age of artificial intelligence. Its core narrative is “Fear the Machine. Defend the Human.”

The project is not positioned as an anti-AI protocol. Its purpose is to create an internet-native cultural asset whose technical design emphasizes transparent issuance, public verification, fixed-supply controls, machine-readable project data, and observable market evidence.

The project is currently in PRE-MAINNET state. The engineering objective is to complete all reversible infrastructure, verification, observability, security, documentation and market-data plumbing before the irreversible Mainnet release.

## 2. Engineering Principles
- Verification before claims.
- Mainnet last.
- Fixed-supply issuance.
- Authority minimization.
- Immutable identity metadata.
- Machine-readable transparency.
- No synthetic market activity.
- Failure-aware architecture.

## 3. System Architecture
### 3.1 Public Web Layer
- Homepage
- Verification page
- Blockchain-data dashboard
- Infrastructure-readiness dashboard
- Market-readiness dashboard
- Whitepaper
- Public metadata

### 3.2 Application/API Layer
- Mainnet readiness API
- Infrastructure readiness API
- Blockchain-data API
- Token-status API
- Health endpoint

### 3.3 Blockchain Layer
- Solana RPC
- SPL Token Program
- Metaplex token metadata
- Associated Token Accounts

### 3.4 Persistent State Layer
- Railway persistent volume
- launch records
- duplicate-launch protection

### 3.5 Market Layer — POST-MAINNET
- DEX pool
- direct pair URL
- liquidity data
- holder data
- public trade activity
- market-data-provider evidence

## 4. Trust Boundaries
### Public zone
Contains non-secret data only: project identity, token specification, public wallet addresses, block/slot data, mint address after launch, explorer URLs and market data after verification.

### Application zone
Contains launch orchestration logic and read-only public APIs.

### Secret zone
Contains SYSTEM_WALLET_SECRET_JSON, COHIBA_MAINNET_LAUNCH_KEY and infrastructure credentials. These values must never be committed to GitHub, returned by public APIs, embedded in frontend JavaScript, or placed in listing forms.

### Blockchain zone
Solana becomes the canonical post-launch source of truth for mint existence, supply, balances, authority state and transaction signatures.

## 5. Token Specification
| Field | Value |
|---|---|
| Name | COHIBA |
| Symbol | COH |
| Network | Solana |
| Standard | SPL Token |
| Total supply | 1,000,000,000 COH |
| Max supply | 1,000,000,000 COH |
| Decimals | 9 |
| Base units | 1,000,000,000,000,000,000 |
| Token-level tax | 0% |
| Post-launch mint authority | null |
| Post-launch freeze authority | null |
| Metadata standard | Metaplex Fungible Token |
| Metadata target | immutable |

## 6. Canonical Destination Wallet
pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t

## 7. Planned Allocation Model
| Allocation | % | COH |
|---|---:|---:|
| Public launch & liquidity | 75% | 750,000,000 |
| Community | 10% | 100,000,000 |
| Marketing | 5% | 50,000,000 |
| Development | 5% | 50,000,000 |
| Treasury | 3% | 30,000,000 |
| Team | 2% | 20,000,000 |

This is a planning model, not a circulating-supply claim. Final circulating supply must be derived from actual post-launch wallet balances, locks, vesting and liquidity positions.

## 8. Launch State Machine
PRE_MAINNET → MINT_CREATED → ATA_READY → SUPPLY_MINTED → METADATA_READY → FREEZE_REVOKED → MINT_REVOKED → LOCKED_VERIFIED

Core invariants:
- supply base units = 1,000,000,000 × 10^9;
- destination token account balance matches verified initial issuance;
- mint authority = null after finalization;
- freeze authority = null after finalization;
- metadata exists and is immutable;
- Mainnet launch record persists.

## 9. Mainnet Safety Gate
Mainnet remains disabled during infrastructure construction.

Required release conditions:
- canonical domain healthy;
- metadata reachable;
- signer configured and valid;
- signer funded;
- Solana Mainnet RPC healthy;
- no previous locked Mainnet record;
- separate launch key present;
- explicit owner approval;
- Mainnet enabled only for the release window.

## 10. Duplicate-Launch Protection
Launch state is stored on persistent Railway volume storage so container restarts and browser resets cannot cause a duplicate mint.

## 11. Metadata Architecture
Canonical endpoint: https://cohibameme.site/token-metadata.json

Metadata includes name, symbol, description, image, official website, network, supply, decimals and token-tax specification.

## 12. Public Blockchain Data Layer
Dashboard: https://cohibameme.site/blockchain.html

APIs:
- Mainnet: https://cohibameme.site/api/blockchain-data?network=mainnet-beta
- Devnet: https://cohibameme.site/api/blockchain-data?network=devnet

Published fields include network, slot, block height, epoch, Solana core version, mint, supply, decimals, authorities, destination account/balance, largest token accounts, recent signatures, explorer links and verification booleans.

## 13. Infrastructure Readiness
Dashboard: https://cohibameme.site/infrastructure.html
API: https://cohibameme.site/api/infra-readiness

Readiness gates cover website, verification, blockchain dashboard, token metadata, machine-readable project/market data, Devnet verification, signer configuration, Mainnet RPC, Mainnet safety lock and non-launch state.

## 14. Machine-Readable Project Data
Canonical file: https://cohibameme.site/project-data.json

## 15. Machine-Readable Market Data
Canonical file: https://cohibameme.site/market-data.json

Pre-market values remain null. Expected POST-MAINNET fields include venue, pair, pool address, market URL, price, liquidity, 24h volume, holders, circulating supply, source and timestamp.

## 16. Explorer Publication Policy
After verified Mainnet launch, the mint will be linked through Solscan, Solana Explorer, the verification page, token page, blockchain dashboard and listing evidence pack.

## 17. Market Infrastructure
Candidate first venue: Raydium.
Candidate pairs: COH/SOL and COH/USDC.

A market is considered live only when a pool exists on-chain, assets are actually deposited, direct pair URL is public, independent swaps can occur and liquidity is observable.

## 18. Liquidity Engineering
Relevant measurements:
- pool reserves;
- price impact;
- effective spread;
- slippage at defined trade sizes;
- reserve concentration;
- LP ownership;
- LP lock/burn status if applicable;
- pool age;
- swap count;
- unique traders.

No LP lock/burn claim may be made without cryptographic verification.

## 19. Market Integrity
Prohibited project practices:
- wash trading;
- self-trading to inflate volume;
- fabricated liquidity;
- fake holders;
- fake exchange screenshots;
- artificial market-cap claims;
- undisclosed circular trading;
- purchased engagement represented as organic adoption.

Only independently observable market activity may be published as evidence.

## 20. Supply Verification
Total supply is deterministic by design. Circulating supply is not assumed from total supply.

Post-launch circulating supply must account for treasury, team, development, marketing, liquidity positions, locked/vested balances and non-circulating reserves.

## 21. Security Controls
- Mainnet disabled by default.
- Separate signer and launch key.
- No private keys in GitHub.
- Origin validation.
- API rate limiting.
- Request size limits.
- Method restrictions.
- Persistent launch state.
- Duplicate-launch prevention.
- Exact supply verification.
- Authority verification.
- Immutable metadata target.
- Public read-only verification endpoints.
- HTTP security headers.
- Health checks.

## 22. Failure Modes
### RPC outage
Launch stops before unverified irreversible transitions.

### Signer underfunded
Launch remains blocked.

### Metadata unavailable
Readiness fails.

### Partial launch
Persistent state allows recovery from the last successful state rather than minting again.

### Authority mismatch
Launch aborts.

### Supply mismatch
Launch aborts before authority revocation.

### Corrupt Mainnet record
Hard failure requiring operator investigation.

## 23. Observability
Operational telemetry should cover deployment health, API health, RPC connectivity, signer balance threshold, launch transitions, verification failures, HTTP errors, latency, volume availability and public endpoint availability.

Secrets must never enter logs.

## 24. Deployment Topology
- GitHub: source control
- Railway: production runtime
- Railway persistent volume: launch-state persistence
- Solana RPC: blockchain interface
- cohibameme.site: canonical public domain

## 25. Release Engineering
### Pre-release
Freeze application changes, verify production commit, metadata, signer address, funding, RPC and safety controls, then capture a readiness snapshot.

### Release
Explicit owner approval, enable Mainnet gate, execute guarded launch, validate every transition.

### Post-release
Verify mint independently, supply and authorities, capture transactions, publish explorer URLs, disable launch path after completion, update project data, Whitepaper status and listing evidence.

## 26. Community and Product/Market Fit
COHIBA is primarily a cultural/community cryptoasset. Product/market fit is intended at the intersection of AI-era cultural anxiety, internet meme distribution, human-first identity, transparent token engineering and verifiable project operations.

## 27. Innovation Position
COHIBA does not claim novel consensus or cryptography. Engineering differentiation focuses on lifecycle states, public readiness APIs, automated blockchain evidence, machine-readable transparency and clear separation of planned vs verified market data.

## 28. Governance
Current governance is founder-led. No decentralized-governance claim is made.

## 29. Treasury and Wallet Disclosure
Post-launch transparency should publish category wallet, amount, percentage, lock/vesting status and unlock schedule where applicable.

## 30. Risk Model
Risks include extreme volatility, total loss of value, liquidity failure, wallet compromise, infrastructure failure, RPC outages, Solana incidents, integration risk, third-party manipulation, regulatory change, brand disputes, community attrition and execution failure.

COHIBA provides no guarantee of price, returns, exchange listing, liquidity, adoption or profitability.

## 31. Regulatory and Legal Position
Documentation is technical and informational, not legal, tax or investment advice. Users are responsible for local compliance.

COHIBA is independent and does not claim affiliation with unrelated companies, cigar manufacturers or trademark owners.

## 32. Roadmap
### Phase 1 — Foundation — VERIFIED/PARTIAL
Brand, website, repository, token architecture, security controls.

### Phase 2 — Devnet Verification — VERIFIED
Devnet issuance, supply verification, authority-revocation testing.

### Phase 3 — Infrastructure — ACTIVE
Blockchain API, infrastructure API, Whitepaper, machine-readable data, listing evidence, monitoring and release runbook.

### Phase 4 — Mainnet — DEFERRED FINAL STEP
Fund signer, authorize release, mint fixed supply, verify, revoke authorities, publish explorer evidence.

### Phase 5 — Market — POST-MAINNET
Create real liquidity pool, publish pair, measure organic market activity.

### Phase 6 — Discovery — POST-MARKET
CMC/CoinGecko/market-data submissions using live evidence.

### Phase 7 — Longevity
Continuous development, community, transparency updates and ecosystem participation.

## 33. Canonical Public References
- Website: https://cohibameme.site
- Whitepaper: https://cohibameme.site/whitepaper.html
- Verification: https://cohibameme.site/verification.html
- Blockchain Data: https://cohibameme.site/blockchain.html
- Infrastructure: https://cohibameme.site/infrastructure.html
- Market Readiness: https://cohibameme.site/market-readiness.html
- Metadata: https://cohibameme.site/token-metadata.json
- Project Data: https://cohibameme.site/project-data.json
- Market Data: https://cohibameme.site/market-data.json
- GitHub: https://github.com/Roberhood314/COHIBA
- X: https://x.com/hunhkcgy

## 34. Versioning and Change Control
Material changes to supply, authority design, wallet allocation, market structure, governance or security architecture require a version increment, dated changelog, Git commit, website update and clear explanation.

## 35. Final Release Gate
Mainnet remains the final irreversible operation.

Required final gate:
- infrastructure complete;
- documentation complete;
- monitoring operational;
- project data complete;
- signer verified and funded;
- explicit owner approval;
- release checklist green;
- evidence capture prepared.

Only then should Mainnet minting occur.

