// Solana Pay transfer-request builder and read-only settlement verifier.
// No transaction signing, sending, key custody or PoHA execution authority.
export const OUSD_MINT = 'ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function key(value) {
  if (typeof value !== 'string' || value.length > 44 || !value.length) throw Error('INVALID_SOLANA_ADDRESS');
  let n = 0n;
  for (const c of value) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) throw Error('INVALID_SOLANA_ADDRESS');
    n = n * 58n + BigInt(digit);
  }
  let bytes = 0;
  for (let x = n; x > 0n; x >>= 8n) bytes++;
  const leading = value.match(/^1*/)[0].length;
  if (bytes + leading !== 32) throw Error('INVALID_SOLANA_ADDRESS');
  return value;
}
export function amountBaseUnits(amount, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw Error('INVALID_DECIMALS');
  if (typeof amount !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(amount)) throw Error('INVALID_AMOUNT');
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > decimals) throw Error('EXCESS_AMOUNT_PRECISION');
  const units = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (units <= 0n || units > 18446744073709551615n) throw Error('INVALID_AMOUNT_RANGE');
  return units;
}
export function createOpenUsdPaymentRequest({recipient, amount, decimals, reference, label = 'COHIBA', message = ''}) {
  key(recipient); key(reference);
  if (recipient === reference || reference === OUSD_MINT) throw Error('UNIQUE_REFERENCE_REQUIRED');
  const units = amountBaseUnits(amount, decimals);
  if (typeof label !== 'string' || label.length > 100 || typeof message !== 'string' || message.length > 200) throw Error('INVALID_PAYMENT_TEXT');
  const query = new URLSearchParams({amount, 'spl-token': OUSD_MINT, reference, label, message});
  return Object.freeze({
    url: 'solana:' + recipient + '?' + query.toString(),
    recipient, mint: OUSD_MINT, amount, amountBaseUnits: units.toString(), decimals, reference,
    network: 'solana-mainnet', executionAuthorized: false
  });
}

/**
 * Read-only check for an exact recipient balance increase in finalized OUSD.
 * This is settlement evidence, not authorization or a durable invoice ledger.
 * The caller must atomically claim the signature/reference once in trusted storage.
 * Trusted mainnet RPC and standard public token balances are required.
 */
export async function verifyOpenUsdPayment({connection, signature, request, payer}) {
  key(payer);
  if (!request || request.mint !== OUSD_MINT || request.network !== 'solana-mainnet') throw Error('INVALID_OUSD_REQUEST');
  const expected = amountBaseUnits(request.amount, request.decimals);
  key(request.recipient); key(request.reference);
  if (request.amountBaseUnits !== expected.toString()) throw Error('PAYMENT_REQUEST_MISMATCH');
  if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw Error('INVALID_SIGNATURE');
  if (await connection.getGenesisHash() !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw Error('OUSD_SOLANA_MAINNET_REQUIRED');
  const statuses = await connection.getSignatureStatuses([signature], {searchTransactionHistory: true});
  const status = statuses.value?.[0];
  if (!status || status.err || status.confirmationStatus !== 'finalized') throw Error('PAYMENT_NOT_FINALIZED');
  const tx = await connection.getParsedTransaction(signature, {commitment: 'finalized', maxSupportedTransactionVersion: 0});
  if (!tx?.meta || tx.meta.err) throw Error('PAYMENT_FAILED_OR_UNAVAILABLE');
  const keys = tx.transaction.message.accountKeys;
  const address = entry => entry.pubkey.toString();
  if (!keys.some(x => address(x) === request.reference) ||
      !keys.some(x => address(x) === payer && x.signer)) throw Error('PAYMENT_REFERENCE_OR_PAYER_MISMATCH');
  // Only public mint/owner balance evidence is accepted; no floating point uiAmount.
  const pre = tx.meta.preTokenBalances || [], post = tx.meta.postTokenBalances || [];
  function total(rows, owner) {
    return rows.filter(x => x.mint === OUSD_MINT && x.owner === owner).reduce((sum, x) => {
      if (x.uiTokenAmount.decimals !== request.decimals || !/^[0-9]+$/.test(x.uiTokenAmount.amount)) throw Error('PAYMENT_TOKEN_METADATA_MISMATCH');
      return sum + BigInt(x.uiTokenAmount.amount);
    }, 0n);
  }
  if (request.recipient === payer ||
      total(post, request.recipient) - total(pre, request.recipient) !== expected ||
      total(pre, payer) - total(post, payer) !== expected) throw Error('PAYMENT_AMOUNT_OR_OWNER_MISMATCH');
  return {settled: true, signature, slot: tx.slot, reference: request.reference,
    recipient: request.recipient, payer, mint: OUSD_MINT, amountBaseUnits: expected.toString(),
    executionAuthorized: false, invoiceConsumed: false};
}

