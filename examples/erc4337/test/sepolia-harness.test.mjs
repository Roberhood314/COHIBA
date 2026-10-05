import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRYPOINT_V07,
  SEPOLIA_CHAIN_ID,
  assertSepoliaConfig,
  sanitizeEvidence
} from '../testnet/sepolia-e2e.mjs';

test('Sepolia harness refuses mainnet and arbitrary chains', () => {
  assert.throws(() => assertSepoliaConfig({ chainId: 1n }), /SEPOLIA_ONLY/);
  assert.throws(() => assertSepoliaConfig({ chainId: 97n }), /SEPOLIA_ONLY/);
  assert.equal(assertSepoliaConfig({ chainId: SEPOLIA_CHAIN_ID }), true);
});

test('Sepolia harness pins the official EntryPoint v0.7 address', () => {
  assert.throws(
    () => assertSepoliaConfig({ chainId: SEPOLIA_CHAIN_ID, entryPoint: '0x0000000000000000000000000000000000000001' }),
    /ENTRYPOINT_V07_REQUIRED/
  );
  assert.equal(ENTRYPOINT_V07, '0x0000000071727De22E5E9d8BAf0edAc6f37da032');
});

test('public evidence sanitizer removes credential-shaped fields recursively', () => {
  const clean = sanitizeEvidence({
    chainId: 11155111,
    rpcUrl: 'secret',
    nested: {
      privateKey: 'secret',
      txHash: '0xabc',
      apiKey: 'secret'
    }
  });
  assert.deepEqual(clean, { chainId: 11155111, nested: { txHash: '0xabc' } });
});
