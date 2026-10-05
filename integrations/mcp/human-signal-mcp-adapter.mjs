import crypto from 'node:crypto';
import { createFrameworkAdapter } from '../../lib/si-framework-api.mjs';

export const HS_MCP_ADAPTER_VERSION = 'HS_MCP_V0_1';
export const MCP_ADAPTER_ID = 'mcp-typescript-sdk-reference';

const text = (value, max = 512) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function denyResult(reason) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Human Signal denied MCP tool call: ${reason}` }],
    structuredContent: { humanSignal: { verdict: 'DENY', reason } }
  };
}

export function buildMcpToolProposal({ toolName, subject, resource, arguments: args, effects } = {}) {
  if (!text(toolName, 256) || !text(subject, 256) || !text(resource, 512)) {
    throw new Error('INVALID_MCP_TOOL_CONTEXT');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('INVALID_MCP_TOOL_ARGUMENTS');
  }
  return {
    adapterId: MCP_ADAPTER_ID,
    action: `MCP_TOOL:${toolName}`,
    subject,
    resource,
    payloadHash: hash({
      version: HS_MCP_ADAPTER_VERSION,
      toolName,
      subject,
      resource,
      arguments: stable(args)
    }),
    effects: [...effects]
  };
}

export function bindMcpExactEffectAuthority(envelope, proposal) {
  if (!envelope || !proposal) throw new Error('INVALID_MCP_AUTHORITY_BINDING');
  return Object.freeze({
    ...envelope,
    resource: proposal.resource,
    payloadHash: proposal.payloadHash
  });
}

/**
 * Registers a protected MCP tool through a Human Signal policy-enforcement
 * wrapper. The handler is not called unless authority passes twice: proposal
 * evaluation and immediate pre-handler revalidation. A trusted commitAuthority
 * callback must atomically consume/reject the authority before side effects.
 */
export function registerHumanSignalMcpTool({
  server,
  name,
  config,
  effects,
  risk = 'HIGH',
  subject,
  resourceFor,
  getAuthorityEnvelope,
  getAuthorityState,
  commitAuthority,
  handler,
  now = () => new Date()
} = {}) {
  if (!server || typeof server.registerTool !== 'function') throw new Error('MCP_SERVER_REQUIRED');
  if (!text(name, 256) || !Array.isArray(effects) || effects.length === 0) throw new Error('INVALID_MCP_POLICY');
  if (!text(subject, 256) || typeof resourceFor !== 'function') throw new Error('MCP_RESOURCE_PROVIDER_REQUIRED');
  if (typeof getAuthorityEnvelope !== 'function' || typeof getAuthorityState !== 'function') {
    throw new Error('MCP_AUTHORITY_PROVIDER_REQUIRED');
  }
  if (typeof commitAuthority !== 'function') throw new Error('MCP_COMMIT_AUTHORITY_REQUIRED');
  if (typeof handler !== 'function') throw new Error('MCP_HANDLER_REQUIRED');

  const action = `MCP_TOOL:${name}`;
  const framework = createFrameworkAdapter({
    adapterId: MCP_ADAPTER_ID,
    policies: [{ policyId: `mcp-tool-${name}-v1`, action, effects, risk }],
    getAuthorityState
  });

  server.registerTool(name, config, async (args, extra) => {
    const resource = resourceFor(args, extra);
    const proposal = buildMcpToolProposal({
      toolName: name,
      subject,
      resource,
      arguments: args,
      effects
    });

    let envelope;
    try {
      envelope = await getAuthorityEnvelope({ name, args, extra, proposal });
    } catch {
      return denyResult('AUTHORITY_UNAVAILABLE');
    }

    if (
      !envelope ||
      envelope.resource !== proposal.resource ||
      !digest(envelope.payloadHash) ||
      envelope.payloadHash.toLowerCase() !== proposal.payloadHash.toLowerCase()
    ) {
      return denyResult('EXACT_EFFECT_AUTHORITY_MISMATCH');
    }

    const first = framework.evaluate({ envelope, proposal, now: now() });
    if (first.verdict !== 'ALLOW') return denyResult(first.reason);

    const commitDecision = framework.evaluate({ envelope, proposal, now: now() });
    if (commitDecision.verdict !== 'ALLOW') return denyResult(commitDecision.reason);

    let committed = false;
    try {
      committed = await commitAuthority({ envelope, proposal, decision: commitDecision });
    } catch {
      committed = false;
    }
    if (committed !== true) return denyResult('AUTHORITY_COMMIT_REJECTED');

    return handler(args, extra, {
      humanSignal: {
        version: HS_MCP_ADAPTER_VERSION,
        proposalDigest: commitDecision.proposalDigest,
        commitBinding: commitDecision.commitBinding
      }
    });
  });
}
