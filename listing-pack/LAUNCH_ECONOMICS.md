# COHIBA Launch Economics v1

## Objective
Create a transparent, liquid, community-first launch structure for COHIBA ($COH) without artificial volume, hidden minting, or guaranteed-return claims.

## Token baseline
- Network: Solana
- Symbol: COH
- Total / max supply: 1,000,000,000 COH
- Decimals: 9
- Token tax: 0%
- Mint authority: revoke permanently after verified initial issuance
- Freeze authority: revoke permanently after verified initial issuance

## Launch pricing policy
COHIBA does not publish a reference opening price, target market capitalization or target FDV before a live market exists. Any initial pool ratio will be documented as a liquidity-configuration fact, not as a promised fair value or expected return.

## Allocation guardrails
- Public launch & liquidity: 75%
- Community: 10%
- Marketing: 5%
- Development: 5%
- Treasury: 3%
- Team: 2%

Team, development and treasury allocations must follow the disclosure/custody rules in [Token Allocation & Vesting Policy](../docs/TOKEN_ALLOCATION_VESTING.md). Team and development vesting schedules are defined there; treasury custody must follow the [Treasury & Key Management Policy](../docs/TREASURY_KEY_MANAGEMENT.md).

## Liquidity principles
1. Publish the pool address and trading pair.
2. Do not fabricate liquidity or trading volume.
3. Model price impact and slippage at disclosed test sizes before pool creation; publish assumptions and actual reserves after launch.
4. Publish LP custody / lock / burn policy accurately.
5. Do not claim a fixed future price or guaranteed return.

## Listing readiness gates
COHIBA should not submit a tracked-market listing request until all applicable fields below are independently verifiable:
- Mainnet mint
- Solana explorer URL
- Verified total supply and authorities
- Official logo
- Official website
- Official X account
- Primary DEX pair / pool
- Live liquidity
- Organic market activity
- Circulating-supply methodology
- Project contact
- Risk disclosure
- No wash trading / fake-holder activity

## Go-live sequence
1. Finalize official logo asset and website references.
2. Complete Devnet end-to-end verification.
3. Owner explicitly authorizes Mainnet launch.
4. Fund Mainnet payer with only the required SOL.
5. Mint fixed supply.
6. Verify exact base-unit supply.
7. Revoke mint and freeze authorities.
8. Publish mint and explorer evidence.
9. Create and seed the liquidity pool according to the approved launch budget.
10. Publish pool / DEX links and circulating-supply data.
11. Observe live market data.
12. Submit CoinMarketCap / CoinGecko listing data only with verifiable live metrics.

## Safety
Never commit seed phrases, private keys, exchange credentials, launch keys, or Railway secrets to GitHub or listing forms.


## Governance references
- [Token Allocation & Vesting Policy](../docs/TOKEN_ALLOCATION_VESTING.md)
- [Treasury & Key Management Policy](../docs/TREASURY_KEY_MANAGEMENT.md)
- [Governance Framework](../docs/GOVERNANCE_FRAMEWORK.md)
- [Launch & Post-Launch Operations](../launch/POST_LAUNCH_OPERATIONS.md)
