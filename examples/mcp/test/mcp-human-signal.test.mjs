import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  bindMcpExactEffectAuthority,
  buildMcpToolProposal,
  registerHumanSignalMcpTool
} from '../../../integrations/mcp/human-signal-mcp-adapter.mjs';

const effects = ['EXTERNAL_TOOL_WRITE'];
const subject = 'human:synthetic-mcp-operator';
const fixedNow = new Date('2026-10-05T14:00:00.000Z');

function baseEnvelope() {
  return {
    version: '1.0-alpha',
    epoch: 3,
    rootId: 'HUMAN-MCP-ABCDEF',
    subject,
    actions: ['MCP_TOOL:update-record'],
    effects,
    budget: 2,
    expiresAt: '2026-10-05T14:05:00.000Z',
    nonce: 'mcp-reference-nonce'
  };
}

async function harness({ revoked = false, authorityProviderThrows = false } = {}) {
  const server = new McpServer({ name: 'human-signal-reference', version: '0.1.0' });
  let envelope;
  let effectCount = 0;
  const committed = new Set();

  registerHumanSignalMcpTool({
    server,
    name: 'update-record',
    config: {
      description: 'Synthetic protected write',
      inputSchema: z.object({ recordId: z.string(), value: z.string() })
    },
    effects,
    subject,
    resourceFor: args => `synthetic://records/${args.recordId}`,
    getAuthorityEnvelope: () => {
      if (authorityProviderThrows) throw new Error('offline');
      return envelope;
    },
    getAuthorityState: () => ({ spent: 0, revoked, epoch: 3 }),
    commitAuthority: ({ envelope: candidate }) => {
      if (committed.has(candidate.nonce)) return false;
      committed.add(candidate.nonce);
      return true;
    },
    handler: async args => {
      effectCount += 1;
      return {
        content: [{ type: 'text', text: `updated:${args.recordId}` }],
        structuredContent: { updated: true, recordId: args.recordId }
      };
    },
    now: () => fixedNow
  });

  const client = new Client({ name: 'human-signal-test-client', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    server,
    setEnvelope(value) { envelope = value; },
    effectCount() { return effectCount; },
    close: async () => {
      await client.close();
      await server.close();
    }
  };
}

function proposal(args) {
  return buildMcpToolProposal({
    toolName: 'update-record',
    subject,
    resource: `synthetic://records/${args.recordId}`,
    arguments: args,
    effects
  });
}

test('official MCP client/server executes a protected tool only after exact Human Signal authority', async () => {
  const h = await harness();
  try {
    const args = { recordId: 'A-7', value: 'approved' };
    h.setEnvelope(bindMcpExactEffectAuthority(baseEnvelope(), proposal(args)));

    const result = await h.client.callTool({ name: 'update-record', arguments: args });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.updated, true);
    assert.equal(h.effectCount(), 1);
  } finally {
    await h.close();
  }
});

test('post-authorization MCP argument mutation is denied before handler execution', async () => {
  const h = await harness();
  try {
    const authorized = { recordId: 'A-8', value: 'approved' };
    h.setEnvelope(bindMcpExactEffectAuthority(baseEnvelope(), proposal(authorized)));

    const result = await h.client.callTool({
      name: 'update-record',
      arguments: { recordId: 'A-8', value: 'mutated' }
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.humanSignal.reason, 'EXACT_EFFECT_AUTHORITY_MISMATCH');
    assert.equal(h.effectCount(), 0);
  } finally {
    await h.close();
  }
});

test('revoked authority fails closed through the official MCP tool call path', async () => {
  const h = await harness({ revoked: true });
  try {
    const args = { recordId: 'A-9', value: 'blocked' };
    h.setEnvelope(bindMcpExactEffectAuthority(baseEnvelope(), proposal(args)));
    const result = await h.client.callTool({ name: 'update-record', arguments: args });
    assert.equal(result.isError, true);
    assert.equal(h.effectCount(), 0);
  } finally {
    await h.close();
  }
});

test('authority provider outage fails closed through the official MCP tool call path', async () => {
  const h = await harness({ authorityProviderThrows: true });
  try {
    const result = await h.client.callTool({
      name: 'update-record',
      arguments: { recordId: 'A-10', value: 'blocked' }
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.humanSignal.reason, 'AUTHORITY_UNAVAILABLE');
    assert.equal(h.effectCount(), 0);
  } finally {
    await h.close();
  }
});

test('reusing the same committed authority is rejected before a second side effect', async () => {
  const h = await harness();
  try {
    const args = { recordId: 'A-11', value: 'once' };
    h.setEnvelope(bindMcpExactEffectAuthority(baseEnvelope(), proposal(args)));

    const first = await h.client.callTool({ name: 'update-record', arguments: args });
    const second = await h.client.callTool({ name: 'update-record', arguments: args });

    assert.equal(first.isError, undefined);
    assert.equal(second.isError, true);
    assert.equal(second.structuredContent.humanSignal.reason, 'AUTHORITY_COMMIT_REJECTED');
    assert.equal(h.effectCount(), 1);
  } finally {
    await h.close();
  }
});
