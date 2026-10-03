# Human Agency v0.1 — permission registry

Human Signal lets a wallet-linked, authenticated human profile register named AI agents and record limited, expiring permissions. An agent name is an owner declaration, not a verified agent identity.

## User flow

Open `/human-signal.html`, verify a wallet, register an agent, choose a permission and expiry, and grant permission. Active grants can be revoked from the same page. Only the owning profile can list or change its agents and grants.

Allowed scopes: `READ_PUBLIC_SIGNALS`, `DRAFT_CONTRIBUTION`, `DRAFT_APP_ACTION`. Maximum expiry is seven days. An owner can register 20 agents and hold 50 active grants, with a 500-record grant history limit.

## API

All endpoints require the existing Human Signal Bearer session and a wallet-linked profile. Mutations also require an allowed Origin and reject bodies over 4096 bytes. The owner comes from the authenticated session, never the request body.

| Method | Endpoint | Body |
| --- | --- | --- |
| GET | `/api/hsc/agency` | — |
| POST | `/api/hsc/agency/agents` | `{ "name": "Research Assistant" }` |
| POST | `/api/hsc/agency/grant` | `{ "agentId": "AGENT-…", "scopes": ["DRAFT_CONTRIBUTION"], "expiresAt": "ISO-8601 timestamp" }` |
| POST | `/api/hsc/agency/revoke` | `{ "delegationId": "DELEGATION-…" }` |

Revocation is idempotent. Grants expire at the exact expiry boundary. Registration, grant and first revocation append HSC events. The state root includes agency records once present, preserving historical roots for stores without agency records. Storage corruption or invalid event chains block mutations.

## What this version proves

Proof class: `AUTHENTICATED_HUMAN_SESSION_OFFCHAIN_V1`. A valid wallet-linked session recorded consent in the application. This is not a fresh wallet signature for each grant, government identity verification, an independently anchored proof, or authentication of an AI agent.

`executionEnabled` is always false. No agent credential, action execution, automatic posting, token transfer, mining claim, or Mainnet permission is issued. External AI apps do not yet enforce these registry entries. Integration requires agent authentication, per-action authorization checks (owner, scope, expiry and revocation), replay prevention, and human approval of actions before execution is enabled.
