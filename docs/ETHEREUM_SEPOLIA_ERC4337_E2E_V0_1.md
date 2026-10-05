# Human Signal × Ethereum Sepolia ERC-4337 E2E v0.1

Status: **public-testnet harness / pre-audit / execution requires dedicated Sepolia credentials**

This milestone completes the intended three-surface interoperability set:

1. Ethereum ERC-4337 — smart-account / protected on-chain effect boundary;
2. BNB Agent — agent identity/job semantics compatibility;
3. MCP — general AI tool-call enforcement.

The Ethereum reference remains pinned to upstream **EntryPoint v0.7** at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. The Sepolia harness refuses every chain except chain ID `11155111` and refuses any alternate EntryPoint address.

## What the public-testnet harness does

`examples/erc4337/testnet/sepolia-e2e.mjs`:

- connects only to Ethereum Sepolia;
- verifies code exists at the pinned EntryPoint v0.7 address;
- deploys the synthetic `DraftSink` and `HumanSignalAccount`;
- creates fresh ephemeral human/agent keys in memory;
- uses a separately supplied dedicated Sepolia deployer key only for testnet gas;
- signs the bounded EIP-712 human delegation;
- signs the full ERC-4337 UserOperation with the agent key;
- compares the locally derived UserOperation hash with `EntryPoint.getUserOpHash()`;
- performs a pre-broadcast `eth_call` revalidation;
- sends one exact synthetic effect through the official EntryPoint `handleOps` path;
- verifies exactly one protected effect committed;
- verifies post-signature payload mutation is rejected **before nonce consumption**;
- verifies replay is rejected after the committed operation;
- relays a human-signed revocation and verifies the old grant cannot authorize a fresh effect;
- emits sanitized evidence containing public addresses and transaction hashes, never credentials.

No mainnet execution path exists in this harness.

## Evidence levels

The normal PR CI runs the Sepolia harness safety/unit tests without network credentials. That proves the harness refuses mainnet/wrong EntryPoint configuration and strips credential-shaped fields from evidence.

A **public-network interoperability claim requires a successful manual workflow run** named `Human Signal ERC-4337 Sepolia Evidence`. That workflow requires the protected `sepolia-evidence` environment and two secrets:

- `SEPOLIA_RPC_URL`
- `SEPOLIA_DEPLOYER_PRIVATE_KEY`

Use a dedicated disposable Sepolia-only key. Do not reuse a mainnet wallet, seed phrase, or production RPC credential.

## Claims boundary

Before a successful manual run, the correct status is:

> Sepolia E2E harness implemented and CI-verified; public-network execution evidence pending.

After a successful run with artifact + transaction hashes, the bounded claim becomes:

> Human Signal ERC-4337 demonstrated a contained human-authorized effect through the official EntryPoint v0.7 contract on Ethereum Sepolia, with pre-broadcast revalidation and adversarial replay/mutation/revocation checks.

Even after that run, this does **not** establish:

- Ethereum Foundation endorsement;
- bundler RPC / ERC-7562 mempool compliance;
- Mainnet readiness;
- arbitrary smart-wallet compatibility;
- production gas economics;
- independent audit;
- complete external-effect atomicity;
- production security.

The public harness deliberately uses direct `EntryPoint.handleOps` submission so bundler interoperability remains a separate evidence gate.
