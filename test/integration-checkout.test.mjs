import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {Keypair, PublicKey} from '@solana/web3.js';
import {MintLayout, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {AccountStateDatabase} from '../lib/account-state-postgres.mjs';
import {IntegrationCheckout, CHECKOUT_STORE, checkoutStoreSpec, checkoutReadiness, checkoutCatalog} from '../lib/integration-checkout.mjs';
import {PiPlatformPayments, piAmountUnits} from '../integrations/pi/platform-payments.mjs';
import {PohaDatabase} from '../lib/poha-postgres.mjs';
import pg from 'pg';
import crypto from 'node:crypto';

const address = () => Keypair.generate().publicKey.toBase58();
async function fixture() {
  const native = Boolean(process.env.TEST_DATABASE_URL), schema = 'checkout_' + crypto.randomBytes(8).toString('hex');
  const admin = native ? new pg.Pool({connectionString: process.env.TEST_DATABASE_URL, max: 1}) : null;
  if (admin) await admin.query('CREATE SCHEMA ' + schema);
  const engine = native ? new pg.Pool({connectionString: process.env.TEST_DATABASE_URL, max: 8, options: '-c search_path=' + schema}) : new PGlite(); let tail = Promise.resolve();
  const pool = native ? engine : {async connect() { let release; const next = new Promise(r => release = r), previous = tail; tail = next; await previous;
    return {query: (sql, args) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({rows: []}) : engine.query(sql, args), release}; }, end: () => engine.close()};
  const database = new AccountStateDatabase({pool, stores: {[CHECKOUT_STORE]: checkoutStoreSpec}}); await database.initialize();
  if (admin) {const close = database.close.bind(database); database.close = async () => {try {await close(); await admin.query('DROP SCHEMA ' + schema + ' CASCADE');} finally {await admin.end();}};}
  const env = {INTEGRATION_PAYMENT_CATALOG: JSON.stringify([{sku: 'pilot', label: 'Test service', piAmount: '1.25', ousdAmount: '1.25'}]),
    PI_APP_ENABLED: 'true', ALLOW_PI_CHECKOUT: 'true', PI_SERVER_API_KEY: 'synthetic-secret', HUMAN_IDENTITY_PEPPER: 'synthetic-pepper', PI_APP_WALLET: 'G' + 'A'.repeat(55),
    ALLOW_OUSD_CHECKOUT: 'true', OUSD_MERCHANT_WALLET: address(), OUSD_SOLANA_RPC_URL: 'https://trusted.invalid'};
  let clock = Date.now();
  const p = {id: 'alice', wallet: address(), externalIdentities: {pi: {identityHash: 'hash:uid-a', validUntil: new Date(clock + 3600000).toISOString()}}};
  const mintData = Buffer.alloc(MintLayout.span);
  MintLayout.encode({mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 1000000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default}, mintData);
  const connection = {getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', getAccountInfo: async () => ({owner: TOKEN_PROGRAM_ID, data: mintData})};
  const payments = new Map(); let approveCalls = 0, completeCalls = 0, uncertain = false;
  const pi = {get: async id => structuredClone(payments.get(id)), approve: async id => { approveCalls++; payments.get(id).status.developer_approved = true;
    if (uncertain) throw Error('PAYMENT_PI_OUTCOME_UNCERTAIN'); return structuredClone(payments.get(id)); },
    complete: async (id, txid) => { completeCalls++; const dto = payments.get(id); dto.status.developer_completed = true; return structuredClone(dto); }};
  const checkout = new IntegrationCheckout({database, authenticate: req => {if (!req?.id) throw Error('HUMAN_SIGNAL_AUTH_REQUIRED'); if (req.revoked) throw Error('HUMAN_SIGNAL_SESSION_INVALID'); return req.id === 'alice' ? p : {id: req.id, wallet: address()}; },
    env, connection, pi, verifyPi: async token => {if (token !== 'synthetic-token') throw Error('PI_TOKEN_INVALID'); return {uid: 'uid-a', scopes: ['payments'], validUntil: p.externalIdentities.pi.validUntil}; },
    hashUid: uid => 'hash:' + uid, now: () => clock});
  const req = {id: 'alice'};
  function dto(order, id = 'payment-a') {
    const value = {identifier: id, user_uid: 'uid-a', amount: 1.25, memo: order.paymentData.memo, metadata: order.paymentData.metadata,
      to_address: env.PI_APP_WALLET, direction: 'user_to_app', network: 'Pi Testnet', status: {developer_approved: false, developer_completed: false, transaction_verified: false, cancelled: false, user_cancelled: false}, transaction: null};
    payments.set(id, value); return value;
  }
  return {checkout, database, engine, env, req, p, connection, payments, dto, pi, setClock: value => clock = value,
    setUncertain: () => uncertain = true, calls: () => ({approveCalls, completeCalls})};
}

test('checkout readiness is explicit, default-off and never exposes server keys', () => {
  const ready = checkoutReadiness({}, false); assert.equal(ready.pi.enabled, false); assert.equal(ready.ousd.enabled, false);
  assert.ok(ready.pi.blockers.includes('POSTGRES_ACCOUNT_STORAGE_REQUIRED'));
  const mainnet = checkoutReadiness({PI_APP_SANDBOX: 'false'}, true); assert.ok(mainnet.pi.blockers.includes('PI_MAINNET_CHECKOUT_DISABLED'));
  assert.equal(JSON.stringify(checkoutReadiness({PI_SERVER_API_KEY: 'keep-secret'}, true)).includes('keep-secret'), false);
  assert.throws(() => checkoutCatalog('[{"sku":"a","label":"A","piAmount":"1e5"}]'));
  assert.throws(() => checkoutCatalog('[{"sku":"a","label":"A","piAmount":"1"},{"sku":"a","label":"B","piAmount":"2"}]'));
  assert.equal(piAmountUnits(1.25), '12500000'); assert.throws(() => piAmountUnits('0.00000001'));
});
test('Pi adapter uses fixed official endpoints, timeout, no redirects and redacted errors', async () => {
  const calls = []; const api = new PiPlatformPayments({apiKey: 'synthetic-key', fetchImpl: async (url, options) => {calls.push({url, options}); return {ok: true, json: async () => ({identifier: 'a'})}; }});
  await api.get('a'); await api.approve('a'); await api.complete('a', 'a'.repeat(64));
  assert.equal(calls[0].url, 'https://api.minepi.com/v2/payments/a'); assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].options.body, JSON.stringify({txid: 'a'.repeat(64)})); assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(api.get('../me'), /ID_INVALID/);
  const bad = new PiPlatformPayments({apiKey: 'secret', fetchImpl: async () => {throw Error('secret upstream');}});
  await assert.rejects(bad.approve('a'), error => error.message === 'PAYMENT_PI_OUTCOME_UNCERTAIN');
});
test('Pi orders bind server price, owner, network, recipient, memo and one payment before approval', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    const o = await f.checkout.create(f.req, {asset: 'PI', sku: 'pilot', amount: '0.01', recipient: 'attacker'});
    assert.equal(o.amount, '1.25'); assert.equal(o.recipient, f.env.PI_APP_WALLET); assert.equal(o.executionAuthorized, false);
    const dto = f.dto(o); const args = {orderId: o.id, paymentId: dto.identifier, accessToken: 'synthetic-token'};
    for (const [key, bad] of [['amount', .01], ['network', 'Pi Network'], ['to_address', 'attacker'], ['direction', 'app_to_user'], ['user_uid', 'other'], ['memo', 'other']]) {
      const saved = dto[key]; dto[key] = bad; await assert.rejects(f.checkout.piAction(f.req, args, 'approve'), /ORDER_MISMATCH/); dto[key] = saved;
    }
    await assert.rejects(f.checkout.piAction({id: 'bob'}, args, 'approve'), /ORDER_NOT_FOUND/);
    await f.checkout.piAction(f.req, args, 'approve'); await f.checkout.piAction(f.req, args, 'approve'); assert.equal(f.calls().approveCalls, 1);
    f.dto(o, 'payment-b'); await assert.rejects(f.checkout.piAction(f.req, {...args, paymentId: 'payment-b'}, 'approve'), /ID_ALREADY_BOUND/);
    assert.equal((await f.checkout.status(f.req, {orderId: o.id})).status, 'APPROVED');
    const state = await f.database.transaction(() => f.database.read(CHECKOUT_STORE));
    assert.equal(JSON.stringify(state).includes('synthetic-token'), false); assert.equal(state.orders[0].piIdentityHash, 'hash:uid-a'); assert.equal(Object.hasOwn(state.orders[0], 'uid'), false);
  } finally {await f.database.close();}
});
test('Pi uncertain approval remains bound; reconciliation settles once across concurrent retries and restart', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    const o = await f.checkout.create(f.req, {asset: 'PI', sku: 'pilot'}), dto = f.dto(o), args = {orderId: o.id, paymentId: dto.identifier, accessToken: 'synthetic-token'};
    f.setUncertain(); await assert.rejects(f.checkout.piAction(f.req, args, 'approve'), /OUTCOME_UNCERTAIN/);
    assert.equal((await f.checkout.status(f.req, {orderId: o.id})).paymentId, 'payment-a');
    dto.status.transaction_verified = true; dto.transaction = {txid: 'a'.repeat(64), verified: true};
    await assert.rejects(f.checkout.piAction(f.req, {...args, txid: 'b'.repeat(64)}, 'complete'), /TXID_MISMATCH/);
    const results = await Promise.all(Array.from({length: 6}, () => f.checkout.piAction(f.req, args, 'reconcile')));
    assert.equal(results.filter(x => !x.idempotentReplay).length, 1);
    assert.ok(results.every(x => x.status === 'SETTLED' && x.serviceGranted === false));
    await f.database.initialize(); assert.equal((await f.checkout.status(f.req, {orderId: o.id})).receipt.transactionId, 'a'.repeat(64));
    const state = await f.database.transaction(() => f.database.read(CHECKOUT_STORE)); assert.equal(state.claims.length, 1);
    const second = await f.checkout.create(f.req, {asset: 'PI', sku: 'pilot'}), secondDto = f.dto(second, 'payment-b');
    secondDto.status = {...dto.status}; secondDto.transaction = {...dto.transaction};
    await assert.rejects(f.checkout.piAction(f.req, {...args, paymentId: 'payment-b'}, 'reconcile'), /ALREADY_CLAIMED/);
  } finally {await f.database.close();}
});
test('Pi never settles forged completion flags, revoked sessions or missing payment scope; expired orders do not approve', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    const o = await f.checkout.create(f.req, {asset: 'PI', sku: 'pilot'}), dto = f.dto(o), args = {orderId: o.id, paymentId: dto.identifier, accessToken: 'synthetic-token'};
    await assert.rejects(f.checkout.piAction({...f.req, revoked: true}, args, 'approve'), /SESSION_INVALID/);
    dto.status.developer_completed = true; await assert.rejects(f.checkout.piAction(f.req, args, 'reconcile'), /NOT_SETTLED/);
    const verify = f.checkout.verifyPi; f.checkout.verifyPi = async () => ({uid: 'uid-a', scopes: []}); await assert.rejects(f.checkout.piAction(f.req, args, 'approve'), /SCOPE_REQUIRED/); f.checkout.verifyPi = verify;
    f.setClock(Date.parse(o.expiresAt) + 1); await assert.rejects(f.checkout.piAction(f.req, args, 'approve'), /ORDER_EXPIRED/);
    dto.status.developer_approved = true; dto.status.transaction_verified = true; dto.transaction = {txid: 'c'.repeat(64), verified: true};
    assert.equal((await f.checkout.piAction(f.req, args, 'reconcile')).receipt.lateReconciliation, true);
  } finally {await f.database.close();}
});
test('OUSD durable settlement uses the saved invoice and payer; finality, replay and cross-owner claims are enforced', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    const o = await f.checkout.create(f.req, {asset: 'OUSD', sku: 'pilot'});
    const row = (owner, amount) => ({mint: o.request.mint, owner, uiTokenAmount: {decimals: 6, amount}});
    const tx = {slot: 100, transaction: {message: {accountKeys: [{pubkey: f.p.wallet, signer: true}, {pubkey: o.request.reference, signer: false}]}}, meta: {err: null, preTokenBalances: [row(f.p.wallet, '2000000')], postTokenBalances: [row(f.p.wallet, '750000'), row(o.recipient, '1250000')]}};
    let finalized = false; f.connection.getSignatureStatuses = async () => ({value: [{err: null, confirmationStatus: finalized ? 'finalized' : 'confirmed'}]}); f.connection.getParsedTransaction = async () => tx;
    const args = {orderId: o.id, signature: '2'.repeat(88), payer: address(), request: {amount: '0.01'}};
    await assert.rejects(f.checkout.ousdSettle(f.req, args), /NOT_FINALIZED/); finalized = true;
    await assert.rejects(f.checkout.ousdSettle({id: 'bob'}, args), /ORDER_NOT_FOUND/);
    const results = await Promise.all(Array.from({length: 8}, () => f.checkout.ousdSettle(f.req, args)));
    assert.equal(results.filter(x => !x.idempotentReplay).length, 1); assert.equal(results[0].receipt.amountBaseUnits, '1250000');
    await f.database.initialize(); assert.equal((await f.checkout.status(f.req, {orderId: o.id})).status, 'SETTLED');
    const second = await f.checkout.create(f.req, {asset: 'OUSD', sku: 'pilot'}); tx.transaction.message.accountKeys.push({pubkey: second.request.reference, signer: false});
    await assert.rejects(f.checkout.ousdSettle(f.req, {...args, orderId: second.id}), /ALREADY_CLAIMED/);
    await assert.rejects(f.checkout.ousdPrepare(f.req, {orderId: o.id}), /NOT_PAYABLE/);
  } finally {await f.database.close();}
});
test('checkout orders and receipt claims survive the existing PostgreSQL backup format', {timeout: 60000}, async () => {
  const f = await fixture(); try {
    const order = await f.checkout.create(f.req, {asset: 'PI', sku: 'pilot'}), dto = f.dto(order);
    dto.status = {developer_approved: true, developer_completed: true, transaction_verified: true, cancelled: false, user_cancelled: false}; dto.transaction = {txid: 'd'.repeat(64), verified: true};
    await f.checkout.piAction(f.req, {paymentId: dto.identifier, accessToken: 'synthetic-token'}, 'reconcile');
    // Exercise the real exporter against the same embedded PostgreSQL state table.
    const pool = process.env.TEST_DATABASE_URL ? f.database.pool : {connect: async () => ({query: (sql, args) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({rows: []}) : sql.startsWith('CREATE TABLE') && sql.includes('CREATE OR REPLACE FUNCTION') ? f.engine.exec(sql).then(() => ({rows: []})) : f.engine.query(sql, args), release() {}}), on() {}};
    const db = new PohaDatabase({pool}); await db.initialize();
    const backup = await db.exportBackup(); assert.equal(backup.tables.hs_state_documents.find(x => x.id === CHECKOUT_STORE).document.orders.length, 1);
    await f.engine.query('DELETE FROM hs_state_documents');
    await db.restoreBackup(backup);
    const restored = await f.database.transaction(() => f.database.read(CHECKOUT_STORE));
    assert.equal(restored.claims.length, 1); assert.equal(restored.orders[0].receipt.transactionId, 'd'.repeat(64));
    assert.equal((await f.checkout.piAction(f.req, {paymentId: dto.identifier, accessToken: 'synthetic-token'}, 'reconcile')).idempotentReplay, true);
  } finally {await f.database.close();}
});
