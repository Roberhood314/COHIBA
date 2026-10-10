# Pi Network and Open Standard connection infrastructure

Status: **experimental, pre-audit, opt-in**. This release adds a durable, human-wallet checkout profile. It does not claim Pi app approval, an Open Standard partnership, live payment evidence, automated service delivery or agent payment authority.

## Delivered paths

- Pi Browser SDK 2.0 authenticates with `payments` scope. Every server callback revalidates the token through the official `GET https://api.minepi.com/v2/me` endpoint.
- Pi U2A: server-priced order → SDK payment → server GET/validate/bind payment ID → server approve → human wallet approval → server complete → verified settlement receipt. Direction, UID hash, order metadata, amount, memo, app wallet and network must match.
- Pi incomplete-payment recovery: GET the payment from Pi, find its stored order by verified provider metadata, validate the owner, complete only a verified chain transaction, and claim its receipt once.
- Open USD: server-priced order to a configured merchant wallet → inspect the official Solana mainnet mint → unsigned TransferChecked transaction → human Phantom approval → finalized RPC receipt verification → durable claim once. Uses the saved invoice and profile wallet, never client-supplied replacement prices or recipients.
- Short PostgreSQL account transactions serialize orders, payment bindings and receipt claims. No provider/RPC request holds the account transaction lock. No JSON/in-memory checkout fallback exists.
- Authenticated status/recovery API, browser checkout on `/wallet-integrations.html`, public readiness blockers and reproducible negative tests.

Official references checked 2026-10-10:

- Pi API: https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md
- Pi SDK types/callbacks: https://github.com/pi-apps/pi-platform-docs/blob/master/SDK_reference.md
- Pi payments: https://github.com/pi-apps/pi-platform-docs/blob/master/payments.md
- Open Standard native asset registry/provider paths: https://joinopenstandard.com/integrate

Pi UID is app-specific and can change after permission revocation. Pi authentication is account control, not proof of biological uniqueness or Pi KYC. Only a keyed UID hash is persisted; tokens remain transient.

## Activation configuration

Common requirements:

```dotenv
HS_ACCOUNT_STORAGE=postgres
# HUMAN_SIGNAL_DATABASE_URL=<existing private PostgreSQL secret>
# HUMAN_IDENTITY_PEPPER=<existing identity pepper; do not rotate casually>
INTEGRATION_PAYMENT_CATALOG=[{"sku":"your-service","label":"Your actual service","piAmount":"1.25","ousdAmount":"1.25"}]
ALLOW_PI_CHECKOUT=false
ALLOW_PI_MAINNET_CHECKOUT=false
ALLOW_OUSD_CHECKOUT=false
PI_APP_ENABLED=false
PI_APP_SANDBOX=true
# PI_SERVER_API_KEY=<server API key from the Pi Developer Portal>
# PI_APP_WALLET=<actual app payment recipient for this registered network>
# OUSD_MERCHANT_WALLET=<actual merchant Solana wallet>
# OUSD_SOLANA_RPC_URL=<trusted Solana MAINNET RPC>
```

The prices above illustrate configuration only. No products or prices are added to the running service by this release. Pi has a 7-decimal, lossless SDK-number profile; OUSD amounts use exact base units and inspected mint decimals. Each catalog asset is optional, but a selected asset must have a valid server price. There is no Pi/OUSD exchange rate, bridge or conversion.

1. Register the actual COHIBA app/domain in `develop.pi`, complete the portal's domain verification instructions and configure its sandbox URL. Code cannot substitute for developer registration/approval.
2. Configure the matching Pi server API key and app recipient as server-only secrets/configuration. Set `PI_APP_ENABLED=true` and `ALLOW_PI_CHECKOUT=true` for a controlled sandbox pilot. For mainnet also require `PI_APP_SANDBOX=false` and the separate `ALLOW_PI_MAINNET_CHECKOUT=true`; switching a flag alone is not proof of approval.
3. For OUSD, independently confirm the configured merchant wallet, official mint and trusted mainnet RPC, and define an actual product. OUSD has no invented testnet mint. Keep the transfer flag off until the human owner deliberately chooses a live pilot; OUSD transfer may move real money and consume SOL.
4. Use `/api/integrations/checkout/config` to inspect blockers. An enabled result is configuration readiness, not evidence of a successful provider/network call.
5. Log in to COHIBA with the intended Solana wallet and link Pi for Pi orders. On the wallet page create an order, inspect the asset/network/recipient, and approve only in the wallet.
6. Record a sandbox Pi payment ID/transaction receipt and a deliberately approved OUSD pilot transaction before making a live-integration claim. Confirm restart/retry behavior and capture redacted evidence. No live transaction is executed during tests.

Open Standard's direct Solana asset route is distinct from provider accounts for issuance/redemption. This release implements direct-wallet OUSD transfers, not mint/burn, fiat rails, Stripe/Bridge APIs, reward eligibility or provider onboarding. Those require a chosen provider product, credentials and separate integration.

## HTTP contract

All POST endpoints require a current COHIBA bearer session and an allowed Origin; bodies are limited to 8 KiB. They return `ok:true` only after the local ledger transaction commits. Prices/payers/recipients are derived on the server; client replacement fields never set invoice policy.

| Endpoint | Body |
| --- | --- |
| `GET /api/integrations/checkout/config` | Public catalog and readiness, no secrets |
| `POST /api/integrations/checkout/order` | `{sku, asset:"PI"\|"OUSD"}` |
| `POST /api/integrations/checkout/status` | `{orderId}` |
| `POST /api/integrations/checkout/ousd/prepare` | `{orderId}` |
| `POST /api/integrations/checkout/ousd/settle` | `{orderId, signature}` |
| `POST /api/integrations/checkout/pi/approve` | `{orderId, paymentId, accessToken}` |
| `POST /api/integrations/checkout/pi/complete` | `{orderId, paymentId, txid, accessToken}` |
| `POST /api/integrations/checkout/pi/reconcile` | `{paymentId, accessToken}` |

Orders expire for new approval/preparation after 15 minutes. A real, already-made payment is still reconcilable after expiry; receipts explicitly identify late reconciliation. Local expiry cannot revoke a wallet transaction already prepared or approved on another system.

One provider payment ID binds to one order before Pi approval. One transaction ID can be claimed by one order; duplicate exact receipt retries return `idempotentReplay:true`. No automatic retry creates another payment. A provider mutation timeout or an uncertain local COMMIT is **not proof of no payment**: reconcile the same order/payment/signature. Pi's own protocol handles repeated approve/complete callbacks; local and remote state do not share an atomic transaction.

## Persistence and recovery

Orders and claims are held under `integration-checkout-v1` in `hs_state_documents`, already included by the existing consistent PostgreSQL exporter/restorer. Never erase historical claims or initialize from a stale snapshot over a live database. Restore into an empty target, fence cutover, reconcile provider transactions since the backup head and verify current identity/session state before enabling writes. The current implementation uses the existing coarse serialized document store, not a high-throughput commerce database. It caps the ledger at 100,000 orders and ten active orders per profile, fails closed at capacity and never deletes old receipt claims. Capacity expansion requires normalized tables/indexes and migration review.

The tests reproduce concurrency/retries, expiry, wrong price/identity/network/recipient, failed settlement, provider timeouts, restart and backup preservation using synthetic fixtures. These do not prove provider approval, independent adoption, production load or arbitrary cross-chain atomicity.

## Human Signal boundary

`DRAFT_APP_ACTION` and HS/2 ALLOW decisions do not authorize these payments. Only direct human wallet approval is implemented. Receipts always report `executionAuthorized:false` and `serviceGranted:false`. Agent-driven payments require a separate reviewed payment capability and destination-level execution gate; no browser link can provide global revocation of a signed blockchain transfer. Fulfillment, refunds, ledger credits, payouts and financial reconciliation operations are deliberately outside this profile.

## Verification

```sh
npm ci
node --test test/integration-checkout.test.mjs test/wallet-integrations.test.mjs test/wallet-integrations-http.test.mjs
npm run build
```

Do not submit private API keys, access tokens, UID values, seed phrases or production wallet material as test evidence.
