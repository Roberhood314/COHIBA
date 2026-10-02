# COHIBA Human Signal Protocol — MVP v0.1

## Purpose
Human Signal is COHIBA's application layer for recording attributable community contributions, producing deterministic evidence hashes, verifying accepted work and deriving a transparent reputation score.

This is an application/protocol layer built **on top of** Solana. It is not a new blockchain and does not claim consensus, validator or settlement independence.

## MVP flow

1. Contributor submits a contribution with type, title, summary, public evidence URL and optional public handle.
2. Server canonicalizes the record and computes SHA-256 over the canonical payload.
3. Record receives deterministic ID `HSP-<16 hex>`.
4. Persistent record is stored on the COHIBA Railway volume.
5. Public verifier exposes the record and proof hash.
6. Maintainer review can mark it VERIFIED / REJECTED when a separate review secret is configured.
7. Reputation points are derived **only** from VERIFIED records.
8. Public leaderboard aggregates verified contributions by contributor handle.

## Proof boundary
Current proof class:
`COHIBA_HUMAN_SIGNAL_OFFCHAIN_SHA256_V1`

This proves deterministic integrity of the submitted canonical payload as recorded by the COHIBA service. It is **not** an on-chain proof and must not be described as one.

## Future Solana layer
A later release may anchor batches of proof hashes or a Merkle root to Solana Devnet, then Mainnet only after explicit technical/legal approval. The application should continue to function as a contribution registry even without token trading or DEX liquidity.

## Contribution types
- CODE
- SECURITY
- RESEARCH
- TRANSLATION
- CREATIVE
- DOCUMENTATION
- COMMUNITY

## Reputation
Initial verified weights:
- SECURITY 30
- CODE 25
- RESEARCH 20
- DOCUMENTATION 15
- TRANSLATION 12
- CREATIVE 10
- COMMUNITY 8

Weights are transparent and may change by version. No reputation points imply token entitlement, financial reward or investment return.

## Security
- strict field length limits;
- http/https evidence URLs only;
- canonical server-side normalization;
- duplicate proof rejection;
- bounded request body;
- same-origin submission requirement;
- optional separate review secret;
- atomic JSON persistence;
- public reads expose no IP or hidden account identifiers.

## Mainnet safety
Human Signal does not change or bypass COHIBA's Mainnet launch gates.
