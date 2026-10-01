# COHIBA Pre-Mainnet Infrastructure

## Policy
Mainnet launch remains disabled until infrastructure is complete and the owner gives explicit final approval.

## Completed architecture
- Production website and canonical domain.
- Persistent Railway volume for launch records.
- Devnet verified launch record.
- Immutable-metadata launch flow.
- Fixed 1,000,000,000 COH / 9 decimals / 0% token tax.
- Mint/freeze revocation verification.
- Mainnet signer + separate launch key.
- Mainnet origin guard and API rate limits.
- Public verification page.
- Public blockchain-data API and dashboard.
- Public infrastructure-readiness API and dashboard.
- Machine-readable project and market schemas.
- CMC evidence/checklist pack.

## Mainnet safety state
Keep:
- ALLOW_MAINNET=false
- AUTO_MAINNET_LAUNCH disabled

No Mainnet mint or DEX pool should be created during this phase.

## Final release gates
1. Infrastructure readiness = READY.
2. Mainnet signer public address verified.
3. Owner funds only the required operational SOL.
4. Explicit final owner approval.
5. Enable Mainnet gate for the release window only.
6. Execute fixed-supply launch.
7. Verify exact supply and destination balance.
8. Revoke mint and freeze authorities.
9. Verify authorities are null.
10. Publish mint + Solscan/Solana Explorer.
11. Create owner-approved real liquidity pool.
12. Publish only observable liquidity, trades, holders and volume.
13. Update CMC/market evidence pack.
