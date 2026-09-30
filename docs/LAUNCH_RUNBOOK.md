# COHIBA Mainnet Launch Runbook

## Before the launch window
1. Confirm https://cohibameme.site and https://cohibameme.site/token-metadata.json are live over HTTPS.
2. Confirm the latest GitHub Actions CI run is green.
3. Confirm Railway production deployment and /api/health are healthy.
4. Complete a public Devnet rehearsal using the same production launch state machine.
5. Verify the Devnet mint:
   - supply = 1,000,000,000 COH
   - decimals = 9
   - destination holds the full initial supply
   - metadata PDA exists
   - metadata URI resolves
   - metadata is immutable
   - mint authority = null
   - freeze authority = null
6. Configure a dedicated Mainnet RPC endpoint.
7. Configure the Mainnet fee-payer signer only as a Railway secret.
8. Fund the Mainnet fee-payer with a conservative SOL buffer.
9. Configure a strong, unique `COHIBA_MAINNET_LAUNCH_KEY`.
10. Keep `ALLOW_MAINNET` false until the final launch window.

## Open Mainnet gate
1. Set `ALLOW_MAINNET=true`.
2. Read /api/mainnet-readiness.
3. Require `OPEN_MAINNET_READY`.
4. Obtain explicit owner approval.
5. Use the private Owner Console to start the one-time launch.
6. Do not refresh or retry blindly. The state machine is resumable.
7. After completion, independently verify the mint on a Solana explorer.

## Immediately after launch
- Publish the official mint address on cohibameme.site.
- Publish Solana explorer links.
- Confirm mint and freeze authorities are null.
- Record launch transaction signatures and metadata PDA.
- Keep the launch record backed up.
- Return `ALLOW_MAINNET` to false after successful launch.

## Market phase
Only after on-chain verification:
- create the intended liquidity pool
- publish pool address and DEX link
- disclose treasury/team/community wallets as appropriate
- prepare market-data submissions for token directories and aggregators
- never fabricate volume, holders, liquidity or market activity
