import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  SI_FRAMEWORK_API_VERSION,
  createFrameworkAdapter,
  evaluateFrameworkAction
} from '../lib/si-framework-api.mjs';

const now = new Date('2026-10-05T12:00:00.000Z');
const payloadHash = crypto.createHash('sha256').update('bounded-tool-payload').digest('hex');

function envelope(overrides = {}) {
  return {
    version: '1.0-alpha',
    epoch: 4,
    rootId: 'HUMAN-ABCDEF123456',
    subject: 'external-agent-7',
    actions: ['TOOL_WRITE'],
    effects: ['EXTERNAL_WRITE'],
    budget: 2,
    expiresAt: '2026-10-05T12:05:00.000Z',
    nonce: 'framework-nonce-1',
    ...overrides
  };
}

function proposal(overrides = {}) {
  return {
    adapterId: 'reference-agent-framework',
    action: 'TOOL_WRITE',
    subject: 'external-agent-7',
    resource: 'sandbox://bounded-resource',
    payloadHash,
    effects: ['EXTERNAL_WRITE'],
    ...overrides
  };
}

const policy = {
  adapterId: 'reference-agent-framework',
  policyId: 'bounded-write-v1',
  action: 'TOOL_WRITE',
  effects: ['EXTERNAL_WRITE'],
  risk: 'HIGH'
};

test('framework API binds valid authority to exact proposed effect without authorizing execution', () => {
  const result = evaluateFrameworkAction({
    envelope: envelope(),
    proposal: proposal(),
    policy,
    state: { spent: 0, revoked: false, epoch: 4 },
    now
  });

  assert.equal(result.version, SI_FRAMEWORK_API_VERSION);
  assert.equal(result.verdict, 'ALLOW');
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.requiresCommitRevalidation, true);
  assert.equal(result.commitBinding.payloadHash, payloadHash);
  assert.equal(typeof result.proposalDigest, 'string');
  assert.equal(result.proposalDigest.length, 64);
});

test('framework API denies effect mismatch before SI allow', () => {
  const result = evaluateFrameworkAction({
    envelope: envelope({ effects: ['EXTERNAL_WRITE', 'FINANCIAL_WRITE'] }),
    proposal: proposal({ effects: ['FINANCIAL_WRITE'] }),
    policy,
    state: { spent: 0, revoked: false, epoch: 4 },
    now
  });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'EFFECT_MISMATCH');
});

test('framework API denies revoked, expired and exhausted authority', () => {
  const revoked = evaluateFrameworkAction({
    envelope: envelope(), proposal: proposal(), policy,
    state: { spent: 0, revoked: true, epoch: 4 }, now
  });
  assert.equal(revoked.reason, 'REVOKED');

  const expired = evaluateFrameworkAction({
    envelope: envelope({ expiresAt: '2026-10-05T11:59:59.000Z' }),
    proposal: proposal(), policy,
    state: { spent: 0, revoked: false, epoch: 4 }, now
  });
  assert.equal(expired.reason, 'EXPIRED');

  const exhausted = evaluateFrameworkAction({
    envelope: envelope({ budget: 1 }), proposal: proposal(), policy,
    state: { spent: 1, revoked: false, epoch: 4 }, now
  });
  assert.equal(exhausted.reason, 'BUDGET');
});

test('framework API denies subject and epoch substitution', () => {
  const subject = evaluateFrameworkAction({
    envelope: envelope(),
    proposal: proposal({ subject: 'attacker-agent' }),
    policy,
    state: { spent: 0, revoked: false, epoch: 4 },
    now
  });
  assert.equal(subject.reason, 'SUBJECT');

  const epoch = evaluateFrameworkAction({
    envelope: envelope(),
    proposal: proposal(),
    policy,
    state: { spent: 0, revoked: false, epoch: 5 },
    now
  });
  assert.equal(epoch.reason, 'AUTHORITY_EPOCH');
});

test('trusted adapter catalog prevents model supplied policy replacement', () => {
  const adapter = createFrameworkAdapter({
    adapterId: 'reference-agent-framework',
    policies: [policy],
    getAuthorityState: () => ({ spent: 0, revoked: false, epoch: 4 })
  });

  const allowed = adapter.evaluate({ envelope: envelope(), proposal: proposal(), now });
  assert.equal(allowed.verdict, 'ALLOW');

  const unknown = adapter.evaluate({
    envelope: envelope({ actions: ['UNTRUSTED_ACTION'], effects: ['ADMIN_WRITE'] }),
    proposal: proposal({ action: 'UNTRUSTED_ACTION', effects: ['ADMIN_WRITE'] }),
    now
  });
  assert.equal(unknown.verdict, 'DENY');
  assert.equal(unknown.reason, 'UNKNOWN_FRAMEWORK_ACTION');
});

test('adapter fails closed when authority state is unavailable', () => {
  const adapter = createFrameworkAdapter({
    adapterId: 'reference-agent-framework',
    policies: [policy],
    getAuthorityState: () => { throw new Error('database unavailable'); }
  });

  const result = adapter.evaluate({ envelope: envelope(), proposal: proposal(), now });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'AUTHORITY_STATE_UNAVAILABLE');
});

test('payload tampering changes the proposal binding', () => {
  const a = evaluateFrameworkAction({
    envelope: envelope(), proposal: proposal(), policy,
    state: { spent: 0, revoked: false, epoch: 4 }, now
  });
  const changedHash = crypto.createHash('sha256').update('changed-payload').digest('hex');
  const b = evaluateFrameworkAction({
    envelope: envelope(), proposal: proposal({ payloadHash: changedHash }), policy,
    state: { spent: 0, revoked: false, epoch: 4 }, now
  });

  assert.equal(a.verdict, 'ALLOW');
  assert.equal(b.verdict, 'ALLOW');
  assert.notEqual(a.proposalDigest, b.proposalDigest);
  assert.notEqual(a.commitBinding.payloadHash, b.commitBinding.payloadHash);
});
