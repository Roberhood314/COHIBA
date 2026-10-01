# COHIBA ($COH) — Token Profile

## Canonical specification

| Field | Value | Evidence state |
|---|---|---|
| Name | COHIBA | VERIFIED PROJECT SPEC |
| Symbol | COH | VERIFIED PROJECT SPEC |
| Network | Solana | VERIFIED PROJECT SPEC |
| Standard | SPL Token | VERIFIED PROJECT SPEC |
| Total / max supply | 1,000,000,000 COH | VERIFIED DESIGN / MAINNET PENDING |
| Decimals | 9 | VERIFIED DESIGN |
| Base-unit supply | 1,000,000,000,000,000,000 | VERIFIED DESIGN |
| Token-level tax | 0% | VERIFIED DESIGN |
| Metadata | Metaplex fungible-token metadata | VERIFIED DESIGN |
| Metadata mutability | immutable | VERIFIED DEVNET / MAINNET PENDING |
| Mint authority after launch | null | VERIFIED DEVNET / MAINNET PENDING |
| Freeze authority after launch | null | VERIFIED DEVNET / MAINNET PENDING |
| Mainnet mint | Not published | POST-MAINNET |
| Explorer URL | Not published | POST-MAINNET |

## Planned allocation

| Allocation | % | COH |
|---|---:|---:|
| Public launch & liquidity | 75% | 750,000,000 |
| Community | 10% | 100,000,000 |
| Marketing | 5% | 50,000,000 |
| Development | 5% | 50,000,000 |
| Treasury | 3% | 30,000,000 |
| Team | 2% | 20,000,000 |

## Supply methodology
Total supply and circulating supply are deliberately treated as different concepts.

The planned total supply is deterministic. Post-launch circulating supply must be calculated from actual on-chain balances and must account for:
- liquidity positions;
- treasury reserves;
- team allocations;
- development allocations;
- marketing allocations;
- community allocations;
- locked or vested balances, if any.

No circulating-supply figure should be submitted to a market-data provider until the supporting wallet evidence can be reproduced.

## Authority policy
The release design permanently revokes:
- mint authority;
- freeze authority.

The project should not describe those authorities as revoked on Mainnet until public on-chain evidence confirms both are null.

## Liquidity policy
Liquidity data is POST-MAINNET evidence.

COHIBA must not describe liquidity as locked, burned, permanent or guaranteed unless the relevant LP position and control state are independently verifiable.

## Canonical verification
- https://cohibameme.site/verification.html
- https://cohibameme.site/blockchain.html
- https://cohibameme.site/security.html
- https://cohibameme.site/token-metadata.json
