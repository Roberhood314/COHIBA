import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindProtectedEffectAuthority,
  createProtectedEffectBoundary,
  validateMediationManifest
} from '../lib/complete-mediation.mjs';

const profileId = 'synthetic-mcp-deployment';
const effectId = 'WRITE_RECORD';
const pepId = 'human-signal-pep-v1';
const subject = 'agent:alpha';
const resource = 'synthetic://record/A-1';
const payload = { value: 'approved' };

function authority(extra = {}) {
  return bindProtectedEffectAuthority({
    profileId, effectId, subject, resource, payload,
    authority: { nonce: 'authority-1', epoch: 7, ...extra }
  });
}

function harness({ revokedAtCommit = false, outageAtCommit = false } = {}) {
  let effects = 0;
  let evaluations = 0;
  const consumed = new Set();
  const boundary = createProtectedEffectBoundary({
    profileId, effectId, pepId,
    evaluateAuthority: ({ authority: candidate }) => {
      evaluations += 1;
      if (outageAtCommit && evaluations === 2) throw new Error('partition');
      if (revokedAtCommit && evaluations === 2) return { verdict: 'DENY', reason: 'REVOKED' };
      if (candidate.epoch !== 7) return { verdict: 'DENY', reason: 'STALE_EPOCH' };
      return { verdict: 'ALLOW' };
    },
    commitAuthority: ({ authority: candidate }) => {
      if (consumed.has(candidate.nonce)) return false;
      consumed.add(candidate.nonce);
      return true;
    },
    handler: async () => { effects += 1; return { effects }; }
  });
  return { boundary, effects: () => effects };
}

test('manifest rejects an alternate unmediated route to a protected effect', () => {
  assert.throws(() => validateMediationManifest({
    profileId,
    effects: [{ effectId, protected: true }],
    routes: [
      { routeId: 'official', effectId, mediated: true, pepId },
      { routeId: 'debug-bypass', effectId, mediated: false }
    ]
  }), /UNMEDIATED_PROTECTED_ROUTE/);
});

test('manifest rejects a protected effect with no declared route', () => {
  assert.throws(() => validateMediationManifest({
    profileId,
    effects: [{ effectId, protected: true }],
    routes: []
  }), /PROTECTED_EFFECT_WITHOUT_ROUTE/);
});

test('exact authority commits one protected effect through the PEP', async () => {
  const h = harness();
  const result = await h.boundary.execute({ subject, resource, payload, authority: authority() });
  assert.equal(result.verdict, 'COMMITTED');
  assert.equal(h.effects(), 1);
});

test('post-authorization payload mutation fails before protected handler', async () => {
  const h = harness();
  const result = await h.boundary.execute({
    subject, resource, payload: { value: 'mutated' }, authority: authority()
  });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'EXACT_EFFECT_AUTHORITY_MISMATCH');
  assert.equal(h.effects(), 0);
});

test('resource and subject substitution fail exact-effect binding', async () => {
  for (const request of [
    { subject: 'agent:beta', resource, payload },
    { subject, resource: 'synthetic://record/B-9', payload }
  ]) {
    const h = harness();
    const result = await h.boundary.execute({ ...request, authority: authority() });
    assert.equal(result.verdict, 'DENY');
    assert.equal(result.reason, 'EXACT_EFFECT_AUTHORITY_MISMATCH');
    assert.equal(h.effects(), 0);
  }
});

test('revocation between initial ALLOW and commit-time revalidation fails closed', async () => {
  const h = harness({ revokedAtCommit: true });
  const result = await h.boundary.execute({ subject, resource, payload, authority: authority() });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'REVOKED');
  assert.equal(h.effects(), 0);
});

test('authority-state outage at commit-time revalidation fails closed', async () => {
  const h = harness({ outageAtCommit: true });
  const result = await h.boundary.execute({ subject, resource, payload, authority: authority() });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'AUTHORITY_STATE_UNAVAILABLE');
  assert.equal(h.effects(), 0);
});

test('same exact authority cannot produce a second protected effect', async () => {
  const h = harness();
  const a = authority();
  const first = await h.boundary.execute({ subject, resource, payload, authority: a });
  const second = await h.boundary.execute({ subject, resource, payload, authority: a });
  assert.equal(first.verdict, 'COMMITTED');
  assert.equal(second.verdict, 'DENY');
  assert.equal(h.effects(), 1);
});

test('stale epoch is denied before authority consumption and effect', async () => {
  const h = harness();
  const stale = authority({ epoch: 6 });
  const result = await h.boundary.execute({ subject, resource, payload, authority: stale });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'STALE_EPOCH');
  assert.equal(h.effects(), 0);
});

test('bounded deployment profile passes only when every declared protected route is mediated', () => {
  const result = validateMediationManifest({
    profileId,
    effects: [{ effectId, protected: true }],
    routes: [{ routeId: 'mcp:update-record', effectId, mediated: true, pepId }]
  });
  assert.equal(result.routeCount, 1);
  assert.deepEqual(result.protectedEffects, [effectId]);
});
