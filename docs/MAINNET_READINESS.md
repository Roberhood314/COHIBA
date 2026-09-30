# COHIBA Mainnet Readiness

Official website: https://cohibameme.site

This document defines the gate that must pass **before** a COH Mainnet launch is permitted.

## Token invariants
- Chain: Solana
- Standard: SPL Token
- Symbol: COH
- Decimals: 9
- Fixed supply: 1,000,000,000 COH
- Base-unit supply: 1,000,000,000,000,000,000
- Token tax: 0%
- Destination wallet: `pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t`
- Mint authority after launch: null
- Freeze authority after launch: null

## Mandatory pre-launch checks
- [x] Public source repository
- [x] CI: typecheck + production web build
- [x] Railway production service
- [x] Persistent Railway volume for launch checkpoints
- [x] Resumable/idempotent launch state machine
- [x] Duplicate mint prevention
- [x] Exact-supply verification before authority revocation
- [x] Destination wallet balance verification
- [x] Immutable Metaplex fungible-token metadata in launch flow
- [x] Post-revoke supply verification
- [x] Post-revoke authority verification
- [x] Public token metadata JSON
- [x] Public token/transparency/privacy/terms/security pages
- [x] robots.txt + sitemap.xml + canonical URLs
- [x] Owner console separated from public navigation and noindexed
- [x] Mainnet API origin restriction
- [x] Launch endpoint rate limiting and request-size limit
- [x] Railway healthcheck
- [x] cohibameme.site DNS + HTTPS fully verified
- [x] Devnet public end-to-end launch with current production state machine
- [ ] Mainnet signer configured and funded (configured; funding pending)
- [x] Mainnet RPC connectivity confirmed
- [x] COHIBA_MAINNET_LAUNCH_KEY configured
- [ ] ALLOW_MAINNET=true only at final launch window
- [ ] Final owner approval

## Launch sequence
The production state machine checkpoints every irreversible step:

`NEW → MINT_CREATED → ATA_READY → SUPPLY_MINTED → METADATA_READY → FREEZE_REVOKED → MINT_REVOKED → LOCKED_VERIFIED`

If RPC or deployment interruption occurs, the next run resumes the same mint instead of creating another mint.

## Stop condition
Do not launch Mainnet until `GET /api/mainnet-readiness` reports `OPEN_MAINNET_READY` and the owner explicitly approves the launch.


## Latest production Devnet rehearsal

- Mint: `B5ZTGW5c3A8p7oFme3FDxjBrXLC9EeUko4rzcpiQRLnR`
- Metadata PDA: `3DHuNdZah4M9XCMeYJkupEAMcW1VcTqbEiPKkFihPH1n`
- Metadata URI: `https://cohibameme.site/token-metadata.json`
- Supply: `1000000000000000000` base units = 1,000,000,000 COH
- Decimals: 9
- Destination amount: exact full supply
- Mint authority: null
- Freeze authority: null
- Metadata immutable: true
- Final state: `LOCKED_VERIFIED`
