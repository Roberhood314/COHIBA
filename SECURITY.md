# COHIBA Security Policy

- Never commit seed phrases, private keys, wallet JSON files, RPC secrets or exchange credentials.
- Use a dedicated Devnet wallet for development.
- Mainnet execution is blocked unless ALLOW_MAINNET=true is explicitly set.
- Authority revocation is irreversible. Verify name, symbol, decimals, total supply, mint address and wallet ownership before Mainnet.
- Prefer hardware wallet or multisig for treasury and operational wallets.
- No hidden mint path, freeze backdoor, fake holders, wash trading or fabricated volume.
- Public claims must be independently verifiable on-chain.
