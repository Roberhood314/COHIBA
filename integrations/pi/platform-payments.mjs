import {amountBaseUnits} from '../open-standard/ousd-wallet-payments.mjs';

const BASE = 'https://api.minepi.com/v2';
export function piAmountUnits(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  const units = amountBaseUnits(text, 7);
  // Pi's SDK/API uses numbers. Restrict the profile to a lossless SDK round trip.
  if (units > BigInt(Number.MAX_SAFE_INTEGER) || amountBaseUnits(String(Number(text)), 7) !== units) throw Error('PAYMENT_PI_AMOUNT_RANGE');
  return units.toString();
}

export class PiPlatformPayments {
  constructor({apiKey, fetchImpl = fetch}) { this.apiKey = apiKey; this.fetch = fetchImpl; }
  async request(paymentId, action = '', body) {
    if (typeof this.apiKey !== 'string' || !this.apiKey || /\s/.test(this.apiKey)) throw Error('PAYMENT_PI_KEY_REQUIRED');
    if (typeof paymentId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(paymentId)) throw Error('PAYMENT_PI_ID_INVALID');
    if (!['', 'approve', 'complete'].includes(action)) throw Error('PAYMENT_PI_ACTION_INVALID');
    let response;
    try {
      response = await this.fetch(BASE + '/payments/' + encodeURIComponent(paymentId) + (action ? '/' + action : ''), {
        method: action ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: {authorization: 'Key ' + this.apiKey, 'content-type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {})
      });
    } catch { throw Error('PAYMENT_PI_OUTCOME_UNCERTAIN'); }
    if (!response.ok) throw Error(action ? 'PAYMENT_PI_RECONCILIATION_REQUIRED' : 'PAYMENT_PI_PROVIDER_UNAVAILABLE');
    try { return await response.json(); } catch { throw Error('PAYMENT_PI_RESPONSE_INVALID'); }
  }
  get(id) { return this.request(id); }
  approve(id) { return this.request(id, 'approve'); }
  complete(id, txid) {
    if (typeof txid !== 'string' || !/^[a-fA-F0-9]{64}$/.test(txid)) throw Error('PAYMENT_PI_TXID_INVALID');
    return this.request(id, 'complete', {txid});
  }
}

// Only a server-fetched DTO can reach this function in the gateway.
export function validatePiPayment(payment, order, identityHash, hashUid, {settled = false, txid} = {}) {
  if (!payment || payment.identifier !== order.paymentId || payment.direction !== 'user_to_app' ||
      payment.network !== order.network || payment.to_address !== order.recipient ||
      typeof payment.user_uid !== 'string' || hashUid(payment.user_uid) !== identityHash ||
      identityHash !== order.piIdentityHash || payment.metadata?.cohibaOrderId !== order.id ||
      payment.memo !== order.memo || piAmountUnits(payment.amount) !== order.amountBaseUnits) throw Error('PAYMENT_PI_ORDER_MISMATCH');
  const s = payment.status;
  if (!s || ['developer_approved', 'transaction_verified', 'developer_completed', 'cancelled', 'user_cancelled'].some(k => typeof s[k] !== 'boolean')) throw Error('PAYMENT_PI_RESPONSE_INVALID');
  if (s.cancelled || s.user_cancelled) throw Error('PAYMENT_PI_CANCELLED');
  if (settled && (!s.developer_approved || !s.developer_completed || !s.transaction_verified ||
      payment.transaction?.verified !== true || !/^[a-fA-F0-9]{64}$/.test(payment.transaction?.txid || '') ||
      (txid && payment.transaction.txid !== txid))) throw Error('PAYMENT_PI_NOT_SETTLED');
  return payment;
}
