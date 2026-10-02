# COHIBA Token Allocation & Vesting Policy v1.0

## Status
**PRE-MAINNET ALLOCATION POLICY**

This document converts the existing launch-economics allocation guardrails into a disclosure and vesting standard. It does not mint, transfer or authorize Mainnet assets.

## Fixed token baseline
- Network: Solana
- Symbol: COH
- Total supply: **1,000,000,000 COH**
- Decimals: **9**
- Token tax: **0%**
- Post-launch mint authority: permanently revoked
- Post-launch freeze authority: permanently revoked

## Allocation
| Category | Share | COH |
|---|---:|---:|
| Public launch & liquidity | 75% | 750,000,000 |
| Community | 10% | 100,000,000 |
| Marketing | 5% | 50,000,000 |
| Development | 5% | 50,000,000 |
| Treasury | 3% | 30,000,000 |
| Team | 2% | 20,000,000 |
| **Total** | **100%** | **1,000,000,000** |

## Vesting standard
### Public launch & liquidity — 75%
No team vesting applies. Actual pool seed amount, paired asset, LP custody and any lock/burn policy must be published before pool creation.

### Community — 10%
Reserved for transparent community programs, contributors and ecosystem participation.
- Distribution must be program-based and evidenced.
- No undisclosed insider allocation.
- Unused balance remains in disclosed treasury/community custody.
- Incentivized distributions must not be represented as organic traction.

### Marketing — 5%
Operational allocation for verifiable distribution, content, campaigns and integrations.
- Spend/distribution is disclosed in aggregate.
- Material grants record recipient purpose and amount.
- Marketing tokens must not be used for fake engagement, wash trading or fabricated holder counts.

### Development — 5%
Default vesting: **18 months linear, 3-month cliff**.
- Vesting start: Mainnet launch timestamp.
- Unvested tokens remain in a disclosed vesting/custody address.
- Early release outside schedule requires a public governance record.

### Treasury — 3%
Held in the production multisig.
- Not treated as circulating unless actually distributed/transferred under the published circulating-supply methodology.
- Treasury movements are governed by the Treasury & Key Management Policy.

### Team — 2%
Default vesting: **24 months linear, 6-month cliff**.
- Vesting start: Mainnet launch timestamp.
- No team token becomes transferable before cliff completion.
- Any amendment requires public disclosure before it takes effect.

## Disclosure requirements before Mainnet
Publish:
- allocation table;
- wallet/vesting addresses for non-public allocations;
- vesting start time;
- vesting contract/program or custody method;
- liquidity allocation actually seeded;
- circulating-supply methodology;
- treasury multisig Vault address;
- team/development vesting evidence.

## Circulating-supply rule
"Circulating" must mean tokens actually available to the market under the published methodology. Treasury, locked, vesting and undistributed program reserves are not automatically counted as circulating.

## Change-control rule
Allocation percentages may not be silently changed. Any pre-Mainnet amendment must:
1. update this file;
2. update the launch economics document;
3. update public token disclosure;
4. record the commit SHA and effective date.

After Mainnet, changes affecting custody/distribution require the governance process and cannot alter the fixed total supply.
