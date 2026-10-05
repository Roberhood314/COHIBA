import crypto from 'node:crypto';
import { createFrameworkAdapter } from '../../lib/si-framework-api.mjs';

export const HS_BNB_AGENT_ADAPTER_VERSION = 'HS_BNB_AGENT_V0_1';
export const BNB_AGENT_ADAPTER_ID = 'bnb-agent-sdk-reference';

export const BNB_AGENT_ACTIONS = Object.freeze({
  ERC8004_REGISTER: Object.freeze({
    policyId: 'bnb-erc8004-register-v1',
    action: 'ERC8004_REGISTER',
    effects: Object.freeze(['EXTERNAL_CHAIN_WRITE', 'AGENT_IDENTITY_WRITE']),
    risk: 'HIGH'
  }),
  ERC8004_SET_METADATA: Object.freeze({
    policyId: 'bnb-erc8004-set-metadata-v1',
    action: 'ERC8004_SET_METADATA',
    effects: Object.freeze(['EXTERNAL_CHAIN_WRITE', 'AGENT_IDENTITY_WRITE']),
    risk: 'HIGH'
  }),
  ERC8004_SET_AGENT_URI: Object.freeze({
    policyId: 'bnb-erc8004-set-agent-uri-v1',
    action: 'ERC8004_SET_AGENT_URI',
    effects: Object.freeze(['EXTERNAL_CHAIN_WRITE', 'AGENT_IDENTITY_WRITE']),
    risk: 'HIGH'
  }),
  ERC8183_SUBMIT_DELIVERABLE: Object.freeze({
    policyId: 'bnb-erc8183-submit-deliverable-v1',
    action: 'ERC8183_SUBMIT_DELIVERABLE',
    effects: Object.freeze(['EXTERNAL_CHAIN_WRITE', 'JOB_DELIVERY_WRITE']),
    risk: 'HIGH'
  })
});

const text = (value, max = 512) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const integer = value => Number.isSafeInteger(value) && value >= 0;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stable(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function agentSubject({ chainId, agentId }) {
  if (!integer(chainId) || chainId < 1 || !integer(agentId)) {
    throw new Error('INVALID_ERC8004_IDENTITY');
  }
  return `erc8004:${chainId}:${agentId}`;
}

function actionResource(action, context) {
  const identity = agentSubject(context);
  if (action === 'ERC8004_REGISTER') {
    return `bnb-agent://${context.chainId}/registry/new/${identity}`;
  }
  if (action === 'ERC8004_SET_METADATA' || action === 'ERC8004_SET_AGENT_URI') {
    return `bnb-agent://${context.chainId}/registry/agent/${context.agentId}`;
  }
  if (action === 'ERC8183_SUBMIT_DELIVERABLE') {
    if (!text(context.jobId, 256)) throw new Error('INVALID_ERC8183_JOB');
    return `bnb-agent://${context.chainId}/erc8183/job/${context.jobId}`;
  }
  throw new Error('UNKNOWN_BNB_AGENT_ACTION');
}

/**
 * Creates a Human Signal authorization adapter for a BNB Agent SDK host.
 *
 * This module deliberately does not import a wallet, sign a transaction, submit
 * a UserOperation or call BNB Chain. It produces a bounded SI decision that a
 * host may use only as input to its own commit-time PEP/revalidation path.
 */
export function createBnbAgentHumanSignalAdapter({ getAuthorityState } = {}) {
  return createFrameworkAdapter({
    adapterId: BNB_AGENT_ADAPTER_ID,
    policies: Object.values(BNB_AGENT_ACTIONS),
    getAuthorityState
  });
}

/**
 * Converts a bounded BNB Agent SDK intent into the framework-neutral proposal.
 * The exact SDK arguments are hash-bound so post-decision mutation changes the
 * payload hash and must be re-authorized.
 */
export function buildBnbAgentProposal({
  action,
  chainId,
  agentId,
  jobId,
  sdkArguments
} = {}) {
  const policy = BNB_AGENT_ACTIONS[action];
  if (!policy) throw new Error('UNKNOWN_BNB_AGENT_ACTION');
  if (!sdkArguments || typeof sdkArguments !== 'object' || Array.isArray(sdkArguments)) {
    throw new Error('INVALID_BNB_SDK_ARGUMENTS');
  }

  const context = { chainId, agentId, jobId };
  const subject = agentSubject(context);
  const resource = actionResource(action, context);
  const payload = {
    version: HS_BNB_AGENT_ADAPTER_VERSION,
    adapterId: BNB_AGENT_ADAPTER_ID,
    action,
    chainId,
    agentId,
    jobId: jobId ?? null,
    resource,
    sdkArguments: stable(sdkArguments)
  };

  return {
    adapterId: BNB_AGENT_ADAPTER_ID,
    action,
    subject,
    resource,
    payloadHash: sha256(canonicalJson(payload)),
    effects: [...policy.effects]
  };
}

export function bnbAgentAuthoritySubject({ chainId, agentId } = {}) {
  return agentSubject({ chainId, agentId });
}
