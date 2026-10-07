# Human Signal open standards profile v0.1

Status: experimental / pre-audit.

## Implemented in this change

GET /api/v1/openapi.json returns an OpenAPI 3.1.1 description of the existing public GET /api/v1/protocol endpoint. Use this document in API tooling to discover protocol metadata. Storage failure can return 503 through the existing account-storage gate.

Only discovery is described. executionEnabled and actionNonceConsumption describe server configuration, never a grant to execute an action. Ed25519 is the signature algorithm; HS_RESTRICTED_JSON_V1 is a project-specific canonicalization format, not RFC 8785 JCS. No signing bytes or proof semantics change.

## Existing integration paths

- MCP: integrations/mcp/human-signal-mcp-adapter.mjs and examples/mcp. Reference integration; no automatic third-party adoption claim.
- ERC-4337: examples/erc4337. Local reference and Sepolia harness; public execution evidence must be established separately.
- HTTP: sdk/human-signal-node.mjs. Human session authentication and service-signed execution are different security contexts.

## Enforcement contract

Discovery, OpenAPI import, successful authentication and an ALLOW inspection result do not create human authority. Trusted adapters must bind exact tool/resource/payload, check expiry and revocation at commit, and prevent bypasses. Protected external effects require destination-side atomicity or an effect-specific idempotent protocol.

OAuth/OIDC credentials must not be translated directly into PoHA action permission. This release adds no generic OAuth resource-server compliance or A2A support.

## Acceptance gates

Before extending this discovery profile to mutation APIs: document exact request signing and response semantics from implementation, add contract tests, demonstrate denied tampering/revocation/replay against the destination, and distinguish inspection from committed effects. Independent review and external operator evidence remain pending.

Specification: https://spec.openapis.org/oas/v3.1.1.html
