// Offline reference only: ephemeral keys, synthetic identity and memory-only effect.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { bindAgent, createSignedDelegation, inspectAction, revokeSignedRecord } from '../lib/poha-v1.mjs';
import { signProof, publicKeyBase64, payloadDigest } from '../sdk/human-signal-node.mjs';
import { inferVerifiedPoha } from '../lib/sovereignty-inference.mjs';

export function runReviewDemo() {
  const now = new Date('2026-10-05T14:00:00.000Z');
  const expiry = new Date(now.getTime() + 60000).toISOString();
  const human = crypto.generateKeyPairSync('ed25519');
  const agent = crypto.generateKeyPairSync('ed25519');
  const principalKey = publicKeyBase64(human.privateKey);
  const agentKey = publicKeyBase64(agent.privateKey);
  const context = { principalId: 'HUMAN-AAAAAAAAAAAA', principalKey,
    audience: 'https://review.example', identityAssurance: 'PHONE_VERIFIED' };
  const base = () => ({ version: '1', principalId: context.principalId,
    audience: context.audience, nonce: crypto.randomBytes(24).toString('base64url'),
    issuedAt: now.toISOString(), expiresAt: expiry });
  const store = {};
  const b = { ...base(), principalKey, agentKey, name: 'Synthetic Review Agent' };
  const binding = bindAgent(store, context, { payload: b,
    principalSignature: signProof('AGENT_BINDING', b, human.privateKey),
    agentSignature: signProof('AGENT_BINDING', b, agent.privateKey) }, now);
  const d = { ...base(), principalKey, bindingId: binding.id, agentKey,
    scopes: ['DRAFT_APP_ACTION'], resource: 'draft:review', approvalRequired: false };
  const delegation = createSignedDelegation(store, context,
    { payload: d, signature: signProof('DELEGATION', d, human.privateKey) }, now);
  const bytes = Buffer.from('Synthetic human-authorized draft.');
  const payload = { ...base(), performer: 'AGENT', signerKey: agentKey,
    delegationId: delegation.id, action: 'DRAFT_APP_ACTION', resource: d.resource,
    payloadHash: payloadDigest(bytes) };
  const proof = { payload, signature: signProof('ACTION', payload, agent.privateKey) };
  const expected = { audience: context.audience, action: payload.action,
    resource: payload.resource, payloadHash: payloadDigest(bytes), requireApproval: false };
  const consumed = new Set();
  const effects = [];
  // This synchronous memory boundary has no await between current-state check,
  // nonce admission and synthetic write. Production uses the SQL commit path.
  function commit(candidate, target = expected, at = now) {
    if (!candidate) return { verdict: 'DENY', reason: 'MISSING_PROOF' };
    const inspection = inspectAction(store, context, candidate, target, at);
    const decision = inferVerifiedPoha(inspection,
      { proof: candidate, expected: target, credentialEpoch: 1, now: at });
    if (decision.verdict !== 'ALLOW') return { ...decision, verifierReasons: inspection.reasonCodes };
    if (consumed.has(candidate.payload.nonce)) return { verdict: 'DENY', reason: 'REPLAY' };
    // Compare actual bytes as well as the expected context before writing.
    if (candidate.payload.payloadHash !== payloadDigest(bytes)) {
      return { verdict: 'DENY', reason: 'PAYLOAD_BYTES_MISMATCH' };
    }
    consumed.add(candidate.payload.nonce);
    effects.push(Buffer.from(bytes));
    return { verdict: 'ALLOW', reason: 'SYNTHETIC_MEMORY_EFFECT_COMMITTED' };
  }
  const cases = [];
  function check(name, result, verdict, before) {
    assert.equal(result.verdict, verdict, name);
    assert.equal(effects.length, before + (verdict === 'ALLOW' ? 1 : 0), name);
    cases.push({ name, verdict: result.verdict, reason: result.reason, effectCount: effects.length, verifierReasons: result.verifierReasons || [] });
  }
  const inspection = inspectAction(store, context, proof, expected, now);
  assert.equal(inspection.decision, 'ALLOW');
  assert.equal(inspection.executionAuthorized, false);
  assert.equal(effects.length, 0);
  check('missing-proof', commit(null), 'DENY', 0);
  const forged = structuredClone(proof);
  const sig = Buffer.from(forged.signature, 'base64'); sig[0] ^= 1;
  forged.signature = sig.toString('base64');
  check('forged-signature', commit(forged), 'DENY', 0);
  check('resource-substitution', commit(proof, { ...expected, resource: 'draft:other' }), 'DENY', 0);
  check('payload-substitution', commit(proof, { ...expected, payloadHash: '0'.repeat(64) }), 'DENY', 0);
  const impostor = structuredClone(proof);
  impostor.payload.signerKey = principalKey;
  impostor.signature = signProof('ACTION', impostor.payload, human.privateKey);
  check('agent-impersonation', commit(impostor), 'DENY', 0);
  check('expiry-boundary', commit(proof, expected, new Date(expiry)), 'DENY', 0);
  check('valid-authorized-effect', commit(proof), 'ALLOW', 0);
  check('replayed-action', commit(proof), 'DENY', 1);
  const fresh = { payload: { ...payload, nonce: base().nonce } };
  fresh.signature = signProof('ACTION', fresh.payload, agent.privateKey);
  revokeSignedRecord(store, context, { type: 'DELEGATION', id: delegation.id }, now);
  check('revoked-fresh-action', commit(fresh), 'DENY', 1);
  store.storageRecovered = true;
  check('authority-storage-unavailable', commit(fresh), 'DENY', 1);
  return { version: 'HS_REVIEW_DEMO_1', status: 'PRE-AUDIT',
    scope: 'OFFLINE_SYNTHETIC_MEMORY_EFFECT', identityEvidence: 'SIMULATED',
    independentAudit: false, externalService: false, durableAtomicity: false,
    inspectionAuthorizesExecution: false, effectCount: effects.length, cases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(runReviewDemo(), null, 2));
}
