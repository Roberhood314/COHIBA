import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BNB_AGENT_ACTIONS,
  bnbAgentAuthoritySubject,
  bindBnbExactEffectAuthority,
  buildBnbAgentProposal,
  createBnbAgentHumanSignalAdapter
} from '../integrations/bnb-agent/human-signal-bnb-adapter.mjs';

const now = new Date('2026-10-05T13:30:00.000Z');
const chainId = 97;
const agentId = 42;

function baseEnvelope(action, effects) {
  return {
    version: '1.0-alpha',
    epoch: 2,
    rootId: 'HUMAN-ABCDEF123456',
    subject: bnbAgentAuthoritySubject({ chainId, agentId }),
    actions: [action],
    effects,
    budget: 2,
    expiresAt: '2026-10-05T13:35:00.000Z',
    nonce: 'bnb-reference-nonce'
  };
}

function adapter(state = { spent: 0, revoked: false, epoch: 2 }) {
  return createBnbAgentHumanSignalAdapter({
    getAuthorityState: () => state
  });
}

test('ERC-8004 metadata update requires exact human-authority effect binding', () => {
  const proposal = buildBnbAgentProposal({
    action: 'ERC8004_SET_METADATA',
    chainId,
    agentId,
    sdkArguments: { key: 'human-signal', value: 'bounded-reference' }
  });
  const envelope = bindBnbExactEffectAuthority(
    baseEnvelope('ERC8004_SET_METADATA', BNB_AGENT_ACTIONS.ERC8004_SET_METADATA.effects),
    proposal
  );

  const result = adapter().evaluate({ envelope, proposal, now });
  assert.equal(result.verdict, 'ALLOW');
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.requiresCommitRevalidation, true);
  assert.equal(result.commitBinding.resource, proposal.resource);
  assert.equal(result.commitBinding.payloadHash, proposal.payloadHash);
});

test('mutating SDK arguments after authority is issued fails closed', () => {
  const original = buildBnbAgentProposal({
    action: 'ERC8004_SET_AGENT_URI',
    chainId,
    agentId,
    sdkArguments: { uri: 'https://example.invalid/agent-v1.json' }
  });
  const envelope = bindBnbExactEffectAuthority(
    baseEnvelope('ERC8004_SET_AGENT_URI', BNB_AGENT_ACTIONS.ERC8004_SET_AGENT_URI.effects),
    original
  );
  const mutated = buildBnbAgentProposal({
    action: 'ERC8004_SET_AGENT_URI',
    chainId,
    agentId,
    sdkArguments: { uri: 'https://example.invalid/agent-v2.json' }
  });

  const result = adapter().evaluate({ envelope, proposal: mutated, now });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'EXACT_EFFECT_AUTHORITY_MISMATCH');
});

test('substituting another ERC-8004 agent identity is denied', () => {
  const proposal = buildBnbAgentProposal({
    action: 'ERC8004_SET_METADATA',
    chainId,
    agentId: 43,
    sdkArguments: { key: 'role', value: 'changed-agent' }
  });
  const envelope = bindBnbExactEffectAuthority(
    baseEnvelope('ERC8004_SET_METADATA', BNB_AGENT_ACTIONS.ERC8004_SET_METADATA.effects),
    proposal
  );

  const result = adapter().evaluate({ envelope, proposal, now });
  assert.equal(result.verdict, 'DENY');
  assert.equal(result.reason, 'SUBJECT');
});

test('ERC-8183 deliverable submission binds the exact job and payload', () => {
  const proposal = buildBnbAgentProposal({
    action: 'ERC8183_SUBMIT_DELIVERABLE',
    chainId,
    agentId,
    jobId: 'synthetic-job-7',
    sdkArguments: { deliverable: 'ipfs://synthetic-cid', proof: 'synthetic-proof' }
  });
  const envelope = bindBnbExactEffectAuthority(
    baseEnvelope('ERC8183_SUBMIT_DELIVERABLE', BNB_AGENT_ACTIONS.ERC8183_SUBMIT_DELIVERABLE.effects),
    proposal
  );

  assert.equal(adapter().evaluate({ envelope, proposal, now }).verdict, 'ALLOW');

  const otherJob = buildBnbAgentProposal({
    action: 'ERC8183_SUBMIT_DELIVERABLE',
    chainId,
    agentId,
    jobId: 'synthetic-job-8',
    sdkArguments: { deliverable: 'ipfs://synthetic-cid', proof: 'synthetic-proof' }
  });
  assert.equal(adapter().evaluate({ envelope, proposal: otherJob, now }).reason, 'EXACT_EFFECT_AUTHORITY_MISMATCH');
});

test('revoked authority and authority-state outage fail closed', () => {
  const proposal = buildBnbAgentProposal({
    action: 'ERC8004_SET_METADATA',
    chainId,
    agentId,
    sdkArguments: { key: 'status', value: 'synthetic' }
  });
  const envelope = bindBnbExactEffectAuthority(
    baseEnvelope('ERC8004_SET_METADATA', BNB_AGENT_ACTIONS.ERC8004_SET_METADATA.effects),
    proposal
  );

  assert.equal(
    adapter({ spent: 0, revoked: true, epoch: 2 }).evaluate({ envelope, proposal, now }).reason,
    'REVOKED'
  );

  const unavailable = createBnbAgentHumanSignalAdapter({
    getAuthorityState: () => { throw new Error('offline'); }
  });
  assert.equal(
    unavailable.evaluate({ envelope, proposal, now }).reason,
    'AUTHORITY_STATE_UNAVAILABLE'
  );
});

test('unsupported financial lifecycle action is not present in v0.1 policy catalog', () => {
  assert.equal(Object.hasOwn(BNB_AGENT_ACTIONS, 'ERC8183_FUND'), false);
  assert.throws(
    () => buildBnbAgentProposal({
      action: 'ERC8183_FUND',
      chainId,
      agentId,
      jobId: 'synthetic-job-9',
      sdkArguments: { amount: '1' }
    }),
    /UNKNOWN_BNB_AGENT_ACTION/
  );
});
