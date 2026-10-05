import { hashObject } from './human-signal-core.mjs';
import { inferSovereignty, SI_VERSION } from './sovereignty-inference.mjs';

export const SI_FRAMEWORK_API_VERSION = 'HS_SI_FRAMEWORK_V0_1';

const deny = (reason, extra = {}) => ({
  version: SI_FRAMEWORK_API_VERSION,
  sovereigntyVersion: SI_VERSION,
  verdict: 'DENY',
  reason,
  executionAuthorized: false,
  ...extra
});

const text = (value, max = 256) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const digest = value =>
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

function normalizeEffects(effects) {
  if (!Array.isArray(effects) || effects.length === 0 || effects.some(effect => !text(effect))) {
    return null;
  }
  return [...new Set(effects)].sort();
}

function sameEffects(left, right) {
  return left.length === right.length && left.every((effect, index) => effect === right[index]);
}

/**
 * Pure framework boundary for Sovereignty Inference.
 *
 * This function does not create authority, sign transactions, execute tools or
 * authorize an external side effect. The caller must source policy and authority
 * state from trusted infrastructure and revalidate authority at the actual commit
 * boundary.
 */
export function evaluateFrameworkAction({
  envelope,
  proposal,
  policy,
  state = {},
  now = new Date()
} = {}) {
  if (!policy || !text(policy.adapterId) || !text(policy.policyId) || !text(policy.action)) {
    return deny('INVALID_TRUSTED_POLICY');
  }

  const policyEffects = normalizeEffects(policy.effects);
  if (!policyEffects) return deny('INVALID_TRUSTED_POLICY');

  if (
    !proposal ||
    proposal.adapterId !== policy.adapterId ||
    proposal.action !== policy.action ||
    !text(proposal.subject) ||
    !text(proposal.resource, 512) ||
    !digest(proposal.payloadHash)
  ) {
    return deny('PROPOSAL_CONTEXT_INVALID', {
      adapterId: policy.adapterId,
      policyId: policy.policyId
    });
  }

  const proposalEffects = normalizeEffects(proposal.effects);
  if (!proposalEffects || !sameEffects(proposalEffects, policyEffects)) {
    return deny('EFFECT_MISMATCH', {
      adapterId: policy.adapterId,
      policyId: policy.policyId
    });
  }

  const spent = state.spent ?? 0;
  const epoch = state.epoch ?? 0;
  const revoked = state.revoked === true;
  const storageRecovered = state.storageRecovered === true;

  const sovereignty = inferSovereignty({
    envelope,
    action: policy.action,
    subject: proposal.subject,
    contract: {
      effects: policyEffects,
      risk: text(policy.risk) ? policy.risk : 'UNSPECIFIED'
    },
    now,
    spent,
    revoked,
    epoch,
    storageRecovered
  });

  if (sovereignty.verdict !== 'ALLOW') {
    return {
      ...sovereignty,
      frameworkVersion: SI_FRAMEWORK_API_VERSION,
      adapterId: policy.adapterId,
      policyId: policy.policyId,
      executionAuthorized: false
    };
  }

  const proposalBinding = {
    frameworkVersion: SI_FRAMEWORK_API_VERSION,
    sovereigntyVersion: SI_VERSION,
    decisionDigest: sovereignty.decisionDigest,
    adapterId: policy.adapterId,
    policyId: policy.policyId,
    action: proposal.action,
    subject: proposal.subject,
    resource: proposal.resource,
    payloadHash: proposal.payloadHash.toLowerCase(),
    effects: policyEffects,
    epoch
  };

  return {
    version: SI_FRAMEWORK_API_VERSION,
    sovereigntyVersion: SI_VERSION,
    verdict: 'ALLOW',
    reason: 'AUTHORITY_AND_EFFECT_BOUND',
    executionAuthorized: false,
    requiresCommitRevalidation: true,
    adapterId: policy.adapterId,
    policyId: policy.policyId,
    authorityClass: sovereignty.authorityClass,
    decisionDigest: sovereignty.decisionDigest,
    proposalDigest: hashObject(proposalBinding),
    commitBinding: proposalBinding
  };
}

/**
 * Builds a fail-closed adapter boundary around a trusted policy catalog.
 * Framework/model input selects an action only; it cannot supply or replace policy.
 */
export function createFrameworkAdapter({
  adapterId,
  policies,
  getAuthorityState
} = {}) {
  if (!text(adapterId) || !Array.isArray(policies) || policies.length === 0) {
    throw new Error('INVALID_FRAMEWORK_ADAPTER');
  }
  if (typeof getAuthorityState !== 'function') {
    throw new Error('AUTHORITY_STATE_PROVIDER_REQUIRED');
  }

  const catalog = new Map();
  for (const raw of policies) {
    const effects = normalizeEffects(raw?.effects);
    if (
      !raw ||
      !text(raw.policyId) ||
      !text(raw.action) ||
      !effects ||
      catalog.has(raw.action)
    ) {
      throw new Error('INVALID_FRAMEWORK_POLICY');
    }
    catalog.set(raw.action, Object.freeze({
      adapterId,
      policyId: raw.policyId,
      action: raw.action,
      effects: Object.freeze(effects),
      risk: text(raw.risk) ? raw.risk : 'UNSPECIFIED'
    }));
  }

  return Object.freeze({
    version: SI_FRAMEWORK_API_VERSION,
    adapterId,
    actions: Object.freeze([...catalog.keys()].sort()),
    evaluate({ envelope, proposal, now = new Date() } = {}) {
      const policy = catalog.get(proposal?.action);
      if (!policy) return deny('UNKNOWN_FRAMEWORK_ACTION', { adapterId });

      let state;
      try {
        state = getAuthorityState({ envelope, proposal, policy, now });
      } catch {
        return deny('AUTHORITY_STATE_UNAVAILABLE', {
          adapterId,
          policyId: policy.policyId
        });
      }

      if (!state || typeof state !== 'object') {
        return deny('AUTHORITY_STATE_UNAVAILABLE', {
          adapterId,
          policyId: policy.policyId
        });
      }

      return evaluateFrameworkAction({ envelope, proposal, policy, state, now });
    }
  });
}
