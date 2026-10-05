# Human Signal Core v1.0-alpha — COHIBA Integration

Status: experimental / pre-audit.

## Integration rule

COHIBA remains the application and data plane. Human Signal Core is the authority/effect enforcement plane.

Existing public/read-only data remains readable. State-changing protected actions are mapped to a machine-readable effect contract and must pass the Human Signal commit gate.

## Existing COHIBA domains bound into the project state root

Profiles, contributions, app registry/utility, event chain, agent/delegation registries, PoHA records, principals, authorization history, mining sessions, resource jobs, state anchors and launch state.

The integration hashes each domain separately and derives a project root. Secrets and private keys are deliberately not part of this projection.

## Protected actions

- PROFILE_WRITE -> IDENTITY_WRITE
- TRUST_WRITE -> TRUST_GRAPH_WRITE
- CONTRIBUTION_VERIFY -> REPUTATION_WRITE
- APP_REGISTER -> APP_REGISTRY_WRITE
- MINING_START -> MINING_STATE_WRITE
- MINING_CLAIM -> PENDING_COH_WRITE
- AGENT_GRANT -> AUTHORITY_WRITE
- AGENT_REVOKE -> AUTHORITY_REVOKE
- MAINNET_REVIEW -> ELIGIBILITY_WRITE
- STATE_ANCHOR -> EXTERNAL_CHAIN_WRITE
- MAINNET_LAUNCH -> IRREVERSIBLE_TOKEN_ISSUANCE

MAINNET_LAUNCH is intentionally CRITICAL and is never implied by mining, profile, app or agent permissions.

## Commit invariant

ProtectedEffect => ValidHumanAuthorityAtCommit

NoValidHumanAuthority => NoNewProtectedEffect

The alpha gate checks live authority, subject, expiry, action scope, effect containment, budget and replay nonce before producing a receipt.

## Compatibility

This module does not replace historical HSC v0.1 state roots. It adds an independent v1.0-alpha project-state projection so historical roots remain verifiable.

## Security limits

This alpha module is not an independent audit or production guarantee. Cryptographic human signatures, durable atomic commit, real UEC soundness, distributed refinement and external audit remain required before treating the gate as a production security boundary.
