# Wallet integrations: Open USD on Solana and Pi Network

Public page: /wallet-integrations.html
Status: experimental / pre-audit; direct human wallet approvals only.

## Open USD

Official asset registry: https://joinopenstandard.com/integrate
Solana mint: ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB

The server verifies mainnet genesis and parses the official mint before constructing requests. Amounts use exact integer base units and live decimals. Each request has a fresh random reference. A Solana Pay transfer URL can be shared. Wallet support for Token-2022 URLs is provider-specific; the built-in Phantom signing path builds an unsigned transaction using the actual token program and its associated token accounts. It never uses COHIBA's system payer.

The user explicitly connects and approves in their own wallet. Only an idempotent recipient ATA creation and TransferChecked with exact amount/mint/reference are included. Source balance and frozen state are checked. Paused mints, nonempty transfer hooks and configured transfer fees fail closed pending dedicated review. Wallet signing can still fail due to issuer policy, wallet support or stale chain state.

Read-only receipt verification requires successful finalized mainnet state, matching reference and payer signer, exact mint/decimals, exact recipient gain and payer loss. It does not consume an invoice, credit a customer or grant a service. Application commerce requires a durable ledger claiming references/signatures once. Confidential token balances and delegated/multi-step settlement are unsupported. A reference is public, not authentication.

This is not PoHA-authorized agent payment execution. DRAFT_APP_ACTION cannot grant payment authority. A wallet-signed transfer request URL cannot be revoked by Human Signal. No server signs or broadcasts payments.

## Pi Network

Official references:
- https://github.com/pi-apps/pi-platform-docs
- https://github.com/pi-apps/pi-platform-docs/blob/master/authentication.md
- https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md

Register COHIBA in develop.pi using Pi Browser; verify the actual hosted domain with the Developer Portal's supplied verification file. Then configure PI_APP_ENABLED=true. PI_APP_SANDBOX defaults true; use false only for a correctly registered mainnet app. Domain verification content, app registration and approval cannot be generated from project code.

Users need an existing authenticated COHIBA profile with verified Solana wallet. Pi SDK 2.0 authenticates in Pi Browser; the server independently checks the access token against https://api.minepi.com/v2/me and credential expiry. It stores only a keyed hash of the app-specific uid plus timestamps in the existing account state store. Access tokens are not persisted, logged or returned. Linking refuses duplicate owners and silent identity replacement; unlinking requires the authenticated COHIBA session. Pi verification never changes human assurance, PoHA keys or mining boosts. Expired verifications need rechecking; a stored link is not proof of current Pi account control.

PI_APP_ENABLED is false by default. No Pi payment, conversion, bridge or partnership is claimed. Pi payments require a separate documented order ledger and server approve/complete flow.

## Validation

Run npm run verify:all and npm run build. Tests exercise exact amount precision, malformed addresses, finalized settlement and tampering negatives, unsigned Token-2022 transaction construction, Pi provider errors and cross-profile identity binding. No real funds are moved during verification.
