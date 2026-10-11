# Human Signal × Model Context Protocol Reference v0.1

Status: **experimental / pre-audit / official-SDK interoperability evidence**

This is a community-built Human Signal reference adapter for MCP tool calls. It is not an official MCP project integration, endorsement or security review.

## External target

The reference uses the official Model Context Protocol TypeScript SDK v2 packages and an in-memory linked client/server pair. The v2 SDK is the stable line for the 2026-07-28 MCP specification.

Pinned direct dependencies in `examples/mcp/package.json`:

- `@modelcontextprotocol/server@2.2.0`
- `@modelcontextprotocol/client@2.2.0`
- `zod@4.6.5`

The CI job installs these pinned direct dependencies, audits them at high severity and executes the interoperability tests. A committed transitive lockfile is not yet provided, so this evidence is not described as fully source-locked dependency reproduction.

## Security boundary

MCP already defines tool discovery/calling and authorization mechanisms. Human Signal does not replace OAuth or MCP authentication.

Human Signal adds a separate question immediately before a protected tool handler:

> Does this human authority permit this exact tool effect, with these exact arguments and this exact resource, at commit time?

```text
MCP Client
   |
   v
tools/call
   |
   v
Human Signal MCP wrapper
   |-- exact resource + payload hash
   |-- trusted authority state
   |-- Sovereignty Inference
   |-- immediate revalidation
   |-- atomic/idempotent authority-consumption callback
   v
protected MCP handler
```

## v0.1 evidence

The test suite creates a real `McpServer`, a real official `Client`, links them with the SDK's `InMemoryTransport.createLinkedPair()`, registers a protected synthetic write tool through Human Signal, and calls it using `client.callTool()`.

Adversarial cases verify:

1. exact authorized call reaches the handler;
2. post-authorization argument mutation is denied before the handler;
3. revoked authority is denied;
4. authority-provider outage fails closed;
5. replay of already committed authority is rejected before a second side effect.

No external network target, credential, private key, payment or real-world destructive tool is used.

## Claims boundary

Passing CI would establish bounded interoperability evidence for the tested MCP SDK path. It would not establish:

- official MCP adoption;
- protection of arbitrary MCP servers;
- complete mediation when a host exposes alternate unwrapped handlers;
- distributed nonce/authority consumption;
- crash-safe external-effect atomicity;
- independent audit;
- production readiness.

Production hosts must ensure protected tools cannot bypass the wrapper and must implement the `commitAuthority` callback using an atomic/idempotent trusted store appropriate to the external effect.

## v0.2 asynchronous enforcement upgrade

The wrapper now awaits `getAuthorityState` through `evaluateAsync`, so a database
Promise can never be mistaken for a valid state snapshot. The synchronous
`evaluate` API rejects Promise-returning providers. Storage failures deny the call.
Pass a trusted clock function to `evaluateAsync` when storage may be asynchronous;
it is read again after the state query to detect expiry during I/O.

Before any provider is awaited, the wrapper copies and recursively freezes the
JSON arguments and proposal. It copies and freezes the authority envelope after
retrieval. The protected handler receives the same detached arguments that were
hashed. Non-finite numbers, undefined values, functions and non-JSON objects are
rejected rather than silently converted during hashing.

`HS_MCP_V0_2` is included in the proposal digest. Existing v0.1 exact-effect
authorizations must be recreated against the new proposal; do not translate an old
hash into new authority. `bindMcpExactEffectAuthority` only constructs a binding;
it does not verify a signature or create human authority. Hosts must independently
verify the envelope and authenticate the calling principal.

Destination acceptance checklist:

- Route every protected write through the wrapper; remove alternate unguarded routes.
- Fetch revocation, epoch and budget from the trusted durable authority store.
- In `commitAuthority`, recheck live authority, expiry and budgets and consume the
  nonce atomically with destination admission. The callback must return exactly true.
- Keep security-sensitive execution context in trusted host state, not mutable MCP
  `extra` metadata or model-controlled arguments.
- A separate admission callback followed by a handler is not a shared transaction.
  A crash after admission may consume authority without completing the effect.
  Use destination-specific transactions or durable outbox/idempotency and recovery
  evidence before claiming crash-safe external execution. Do not automatically
  retry a failed handler as a newly authorized action.

Run `node --test test/si-framework-api.test.mjs test/mcp-enforcement-boundary.test.mjs`
and `npm test --prefix examples/mcp`. The root suite covers asynchronous revocation,
state outages, mutation across awaits, concurrent replay admission and expiry during
storage reads. These are bounded tests, not an independent audit or live customer
integration.
