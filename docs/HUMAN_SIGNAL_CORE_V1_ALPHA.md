# Human Signal Core v1.0-alpha — COHIBA Integration

Status: experimental / pre-audit.

## Integration rule

COHIBA remains the application and data plane. Human Signal Core is the authority/effect enforcement plane.

The alpha core maps state-changing operations to machine-readable effect contracts. Read-only/public data stays outside the protected path. The web server wires mining start, mining claim, app registration, delegation grant and delegation revoke to the session gate. The SI alpha extension adds deterministic authority decisions, an opt-in pinned-quorum research gate and fenced recovery; see [Sovereignty Inference and Continuity](SOVEREIGNTY_INFERENCE_AND_CONTINUITY.md).

## Existing COHIBA domains represented by the project state projection

Profiles, contributions, app registry/utility, event chain, agent/delegation registries, PoHA records, principals, authorization history, mining sessions, resource jobs, state anchors and launch state.

Each domain is hashed separately and combined into a project root. Secrets and private keys are deliberately excluded.

## Protected action registry

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

`MAINNET_LAUNCH` is CRITICAL and is never implied by lower-risk permissions.

## Commit invariant

`ProtectedEffect => ValidHumanAuthorityAtCommit`

`NoValidHumanAuthority => NoNewProtectedEffect`

The alpha gate checks root revocation, subject, expiry, action scope, effect containment, per-authority budget and replay nonce before producing a receipt.

Budgets are scoped to an authority envelope (`authorityId`), while revocation is scoped to the human root. This prevents unrelated fresh authority envelopes from accidentally sharing one global budget.

## Compatibility

This module does not replace historical HSC v0.1 state roots. It adds an independent v1.0-alpha project-state projection so historical roots remain verifiable.

## Security limits

The direct-human adapter currently represents an authenticated human session gate, not a cryptographically signed intent ceremony. It must not be described as equivalent to final PoHA durable authorization.

External-effect atomicity is not solved in this alpha. `STATE_ANCHOR` and `MAINNET_LAUNCH` therefore require a later prepare / external execution / status verification / finalized receipt protocol before the Human Signal gate may be treated as their production enforcement boundary.

This alpha is not an independent audit or a production security guarantee. Durable atomic state, external UEC soundness, distributed refinement, cryptographic authority binding and independent audit remain required.
