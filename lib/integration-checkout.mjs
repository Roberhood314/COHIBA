import crypto from 'node:crypto';
import {PublicKey, Keypair} from '@solana/web3.js';
import {amountBaseUnits, createOpenUsdPaymentRequest, verifyOpenUsdPayment} from '../integrations/open-standard/ousd-wallet-payments.mjs';
import {inspectOpenUsdSolana} from '../integrations/open-standard/ousd-solana.mjs';
import {prepareOpenUsdTransfer} from '../integrations/open-standard/ousd-transaction.mjs';
import {piAmountUnits, validatePiPayment} from '../integrations/pi/platform-payments.mjs';

export const CHECKOUT_STORE = 'integration-checkout-v1';
export const checkoutStoreSpec = {
  readLegacy: () => ({version: 1, orders: [], claims: []}),
  validate: s => Boolean(s && s.version === 1 && Array.isArray(s.orders) && Array.isArray(s.claims))
};
export function checkoutCatalog(value = '') {
  if (!value) return [];
  let entries; try { entries = JSON.parse(value); } catch { throw Error('PAYMENT_CATALOG_INVALID'); }
  if (!Array.isArray(entries) || entries.length > 50) throw Error('PAYMENT_CATALOG_INVALID');
  const ids = new Set();
  for (const x of entries) {
    if (!x || typeof x.sku !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(x.sku) || ids.has(x.sku) ||
        typeof x.label !== 'string' || !x.label || x.label.length > 100 || (!x.piAmount && !x.ousdAmount)) throw Error('PAYMENT_CATALOG_INVALID');
    ids.add(x.sku);
    if (x.piAmount !== undefined) piAmountUnits(x.piAmount);
    if (x.ousdAmount !== undefined) amountBaseUnits(x.ousdAmount, 6);
  }
  return entries.map(x => ({sku: x.sku, label: x.label, ...(x.piAmount ? {piAmount: x.piAmount} : {}), ...(x.ousdAmount ? {ousdAmount: x.ousdAmount} : {})}));
}
const wallet = value => { try { return new PublicKey(value).toBase58() === value; } catch { return false; } };
export function checkoutReadiness(env, databaseReady) {
  let catalog = []; let catalogError = false;
  try { catalog = checkoutCatalog(env.INTEGRATION_PAYMENT_CATALOG); } catch { catalogError = true; }
  const common = [];
  if (!databaseReady) common.push('POSTGRES_ACCOUNT_STORAGE_REQUIRED');
  if (!catalog.length || catalogError) common.push('PAYMENT_CATALOG_REQUIRED');
  const pi = [...common], ousd = [...common];
  if (env.PI_APP_ENABLED !== 'true') pi.push('PI_APP_REGISTRATION_REQUIRED');
  if (env.ALLOW_PI_CHECKOUT !== 'true') pi.push('PI_CHECKOUT_DISABLED');
  if (!env.PI_SERVER_API_KEY) pi.push('PI_SERVER_API_KEY_REQUIRED');
  if (!env.HUMAN_IDENTITY_PEPPER) pi.push('IDENTITY_PEPPER_REQUIRED');
  if (typeof env.PI_APP_WALLET !== 'string' || !/^G[A-Z2-7]{55}$/.test(env.PI_APP_WALLET)) pi.push('PI_APP_WALLET_REQUIRED');
  if (!catalog.some(x => x.piAmount)) pi.push('PI_PRICES_REQUIRED');
  if (env.PI_APP_SANDBOX === 'false' && env.ALLOW_PI_MAINNET_CHECKOUT !== 'true') pi.push('PI_MAINNET_CHECKOUT_DISABLED');
  if (env.ALLOW_OUSD_CHECKOUT !== 'true') ousd.push('OUSD_CHECKOUT_DISABLED');
  if (!wallet(env.OUSD_MERCHANT_WALLET)) ousd.push('OUSD_MERCHANT_WALLET_REQUIRED');
  if (!env.OUSD_SOLANA_RPC_URL) ousd.push('OUSD_MAINNET_RPC_REQUIRED');
  if (!catalog.some(x => x.ousdAmount)) ousd.push('OUSD_PRICES_REQUIRED');
  return {version: 'CHECKOUT_V1', catalog, pi: {enabled: pi.length === 0, blockers: pi, network: env.PI_APP_SANDBOX === 'false' ? 'Pi Network' : 'Pi Testnet'},
    ousd: {enabled: ousd.length === 0, blockers: ousd, network: 'solana-mainnet'},
    humanWalletApprovalRequired: true, agentExecutionEnabled: false, providerPartnerConfirmed: false, independentAuditComplete: false};
}
function publicOrder(o) {
  return {id: o.id, asset: o.asset, sku: o.sku, label: o.label, amount: o.amount, network: o.network,
    recipient: o.recipient, payer: o.payer, status: o.status, createdAt: o.createdAt, expiresAt: o.expiresAt,
    paymentId: o.paymentId || null, receipt: o.receipt || null,
    ...(o.asset === 'OUSD' ? {request: o.request} : {paymentData: {amount: Number(o.amount), memo: o.memo, metadata: {cohibaOrderId: o.id}}}),
    executionAuthorized: false, serviceGranted: false};
}

// Short account transactions own orders/claims. Provider/RPC I/O never holds the account lock.
// No token, Pi UID, private key, financial credit or agent execution is stored/granted.
export class IntegrationCheckout {
  constructor({database, authenticate, env, connection, pi, verifyPi, hashUid, now = () => Date.now()}) {
    Object.assign(this, {database, authenticate, env, connection, pi, verifyPi, hashUid, now});
  }
  async local(req, fn) {
    if (!this.database) throw Error('PAYMENT_STORAGE_UNAVAILABLE');
    return this.database.transaction(() => {
      const profile = this.authenticate(req), ledger = this.database.read(CHECKOUT_STORE);
      const result = fn(ledger, profile);
      this.database.write(CHECKOUT_STORE, ledger);
      return structuredClone(result);
    });
  }
  order(ledger, profile, id) {
    const o = ledger.orders.find(x => x.id === id && x.owner === profile.id);
    if (!o) throw Error('PAYMENT_ORDER_NOT_FOUND');
    return o;
  }
  enabled(asset) {
    const ready = checkoutReadiness(this.env, Boolean(this.database));
    if (!(asset === 'PI' ? ready.pi.enabled : asset === 'OUSD' && ready.ousd.enabled)) throw Error('PAYMENT_CHECKOUT_DISABLED');
    return ready;
  }
  async create(req, {asset, sku}) {
    const ready = this.enabled(asset), item = ready.catalog.find(x => x.sku === sku);
    await this.local(req, () => true);
    const amount = asset === 'PI' ? item?.piAmount : item?.ousdAmount;
    if (!amount) throw Error('PAYMENT_SKU_INVALID');
    const mint = asset === 'OUSD' ? await inspectOpenUsdSolana(this.connection) : null;
    if (mint && (mint.paused || mint.transferHook || mint.transferFeeConfigured)) throw Error('OUSD_WALLET_EXTENSION_REVIEW_REQUIRED');
    return this.local(req, (ledger, p) => {
      if (!p.wallet) throw Error('PAYMENT_WALLET_IDENTITY_REQUIRED');
      if (ledger.orders.length >= 100000 || ledger.orders.filter(x => x.owner === p.id && x.status !== 'SETTLED' && Date.parse(x.expiresAt) > this.now()).length >= 10) throw Error('PAYMENT_ORDER_LIMIT');
      const linked = p.externalIdentities?.pi;
      if (asset === 'PI' && (!linked || Date.parse(linked.validUntil) <= this.now())) throw Error('PAYMENT_PI_LINK_REQUIRED');
      const id = 'PAY-' + crypto.randomUUID(), createdAt = new Date(this.now()).toISOString();
      const recipient = asset === 'PI' ? this.env.PI_APP_WALLET : this.env.OUSD_MERCHANT_WALLET;
      if (asset === 'OUSD' && recipient === p.wallet) throw Error('PAYMENT_SELF_TRANSFER_UNSUPPORTED');
      const request = mint ? createOpenUsdPaymentRequest({recipient, amount, decimals: mint.decimals, reference: Keypair.generate().publicKey.toBase58(), message: id}) : undefined;
      const o = {id, owner: p.id, payer: p.wallet, asset, sku, label: item.label, amount, recipient,
        amountBaseUnits: mint ? request.amountBaseUnits : piAmountUnits(amount), network: mint ? 'solana-mainnet' : ready.pi.network,
        piIdentityHash: linked?.identityHash, request, memo: 'COHIBA: ' + item.label, status: 'CREATED', createdAt,
        expiresAt: new Date(this.now() + 15 * 60 * 1000).toISOString()};
      ledger.orders.push(o); return publicOrder(o);
    });
  }
  status(req, {orderId}) { return this.local(req, (l, p) => publicOrder(this.order(l, p, orderId))); }
  async ousdPrepare(req, {orderId}) {
    this.enabled('OUSD');
    const o = await this.local(req, (l, p) => this.order(l, p, orderId));
    if (o.asset !== 'OUSD' || o.status === 'SETTLED' || Date.parse(o.expiresAt) <= this.now()) throw Error('PAYMENT_ORDER_NOT_PAYABLE');
    const mint = await inspectOpenUsdSolana(this.connection);
    return prepareOpenUsdTransfer({connection: this.connection, mint, request: o.request, payer: o.payer});
  }
  async settle(req, orderId, evidence) {
    return this.local(req, (l, p) => {
      const o = this.order(l, p, orderId);
      const claim = o.asset + ':' + o.network + ':' + evidence.transactionId;
      const previous = l.claims.find(x => x.key === claim);
      if (previous && previous.orderId !== o.id) throw Error('PAYMENT_RECEIPT_ALREADY_CLAIMED');
      if (o.status === 'SETTLED') {
        if (o.receipt.transactionId !== evidence.transactionId) throw Error('PAYMENT_ORDER_ALREADY_SETTLED');
        return {...publicOrder(o), idempotentReplay: true};
      }
      if (!previous) l.claims.push({key: claim, orderId: o.id});
      o.status = 'SETTLED'; o.receipt = {asset: o.asset, network: o.network, transactionId: evidence.transactionId,
        amountBaseUnits: o.amountBaseUnits, recipient: o.recipient, verifiedAt: new Date(this.now()).toISOString(),
        lateReconciliation: Date.parse(o.expiresAt) <= this.now(), ...(evidence.slot ? {slot: evidence.slot} : {})};
      return {...publicOrder(o), idempotentReplay: false};
    });
  }
  async ousdSettle(req, {orderId, signature}) {
    this.enabled('OUSD');
    const o = await this.local(req, (l, p) => this.order(l, p, orderId));
    if (o.asset !== 'OUSD') throw Error('PAYMENT_ASSET_MISMATCH');
    const result = await verifyOpenUsdPayment({connection: this.connection, signature, request: o.request, payer: o.payer});
    return this.settle(req, o.id, {transactionId: result.signature, slot: result.slot});
  }
  async piAction(req, {orderId, paymentId, accessToken, txid}, action) {
    this.enabled('PI');
    // Require the COHIBA session before any external request.
    await this.local(req, () => true);
    const identity = await this.verifyPi(accessToken);
    if (!identity.scopes.includes('payments')) throw Error('PAYMENT_PI_SCOPE_REQUIRED');
    const identityHash = this.hashUid(identity.uid);
    let dto = await this.pi.get(paymentId);
    const id = action === 'reconcile' ? dto.metadata?.cohibaOrderId : orderId;
    const o = await this.local(req, (l, p) => {
      const order = this.order(l, p, id);
      if (Date.parse(identity.validUntil) <= this.now()) throw Error('PI_TOKEN_INVALID');
      if (order.asset !== 'PI' || p.externalIdentities?.pi?.identityHash !== identityHash) throw Error('PAYMENT_PI_ORDER_MISMATCH');
      if (order.paymentId && order.paymentId !== paymentId) throw Error('PAYMENT_PI_ID_ALREADY_BOUND');
      const candidate = {...order, paymentId};
      validatePiPayment(dto, candidate, identityHash, this.hashUid);
      if (action === 'approve' && order.status !== 'SETTLED' && Date.parse(order.expiresAt) <= this.now()) throw Error('PAYMENT_ORDER_EXPIRED');
      if (l.orders.some(x => x.id !== order.id && x.paymentId === paymentId)) throw Error('PAYMENT_PI_ID_ALREADY_BOUND');
      order.paymentId = paymentId; // Durable before the remote effect; retries reconcile this exact payment only.
      return order;
    });
    if (action === 'approve') {
      if (!dto.status.developer_approved) dto = await this.pi.approve(paymentId);
      validatePiPayment(dto, o, identityHash, this.hashUid);
      if (!dto.status.developer_approved) throw Error('PAYMENT_PI_NOT_APPROVED');
      return this.local(req, (l, p) => { const current = this.order(l, p, id); if (current.status !== 'SETTLED') current.status = 'APPROVED'; return publicOrder(current); });
    }
    const chainTx = dto.transaction?.txid;
    if (!chainTx || !dto.status.transaction_verified || dto.transaction?.verified !== true) throw Error('PAYMENT_PI_NOT_SETTLED');
    if (action === 'complete' && txid !== chainTx) throw Error('PAYMENT_PI_TXID_MISMATCH');
    if (!dto.status.developer_completed) dto = await this.pi.complete(paymentId, chainTx);
    validatePiPayment(dto, o, identityHash, this.hashUid, {settled: true, txid: chainTx});
    return this.settle(req, id, {transactionId: chainTx});
  }
}
