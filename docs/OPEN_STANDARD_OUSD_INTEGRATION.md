# Open Standard / Open USD integration target

This is the specific Open Standard at https://joinopenstandard.com/, not a generic open standards claim.

## Official routes checked 2026-10-07

https://joinopenstandard.com/integrate lists Stripe/Bridge/Privy, Mastercard, Coinbase and Visa integration paths. Provider onboarding and account setup happen with the selected provider. The page lists native support on Base, Ethereum, Solana and Tempo; OUSD is issued by Bridge Building Inc.

https://docs.stripe.com/stablecoins/ecosystem/ousd links product-specific guides and states availability depends on product, country, network and release status. The company website is not a universal payment API.

## Implemented readiness

integrations/open-standard/ousd-solana.mjs exports a read-only mint inspector for the official Solana mint. It verifies mainnet genesis, account existence and supported SPL program ownership, then reads decimals and supply rather than guessing them. Use a trusted RPC; RPC output is not independent consensus proof. This function never signs or sends transactions. Provider connectivity remains false.

Official Solana mint: ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB
Source: https://joinopenstandard.com/integrate

## Next implementation gate

Select one provider product or an on-chain wallet execution path. Obtain its applicable sandbox/account access and document its exact supported OUSD operations before implementing payments. Do not invent API endpoints, credentials, testnet mint addresses or acceptance by Open Standard.

The existing DRAFT_APP_ACTION authority must not authorize payments. A payment adapter needs an independently reviewed scope binding network, official mint, payer, recipient, amount in base units, fee ceiling, expiry and replay identity. Human approval and revocation must be checked at the actual execution boundary. Provider retries and reconciliation need destination-specific idempotency. An API acceptance response is not settled payment evidence.

No membership, partnership, production payment readiness or live OUSD transfer is claimed. Registration/rewards require Open Standard acceptance; no form has been submitted.

