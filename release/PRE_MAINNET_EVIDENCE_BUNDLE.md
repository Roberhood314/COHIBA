# COHIBA Pre-Mainnet Evidence Bundle v1.0

## Purpose
One index for evidence required to move from internal release readiness toward an externally validated Mainnet release candidate.

## Internally verifiable evidence
- production CI: GitHub Actions;
- Verification and Security workflow;
- Local Token Verify workflow;
- production runtime smoke test;
- dependency audit;
- threat model;
- security-control matrix;
- fixed-supply/authority invariants;
- operational backup/restore drill artifact;
- incident tabletop artifact;
- treasury activation packet;
- liquidity readiness plan;
- canonical project registry.

## External evidence still required
- independent security audit report + remediation/retest evidence;
- written legal release clearance;
- real 2-of-3 production treasury multisig evidence;
- real community/contributor evidence;
- explicit owner Mainnet authorization;
- post-launch liquidity/on-chain evidence only after launch.

## Status semantics
- **VERIFIED INTERNAL**: reproduced by project automation/evidence.
- **PREPARED**: procedure/package exists but requires real-world inputs.
- **PENDING EXTERNAL**: cannot be self-certified.
- **NOT LAUNCHED**: identifier/evidence must remain null until it actually exists.

No document label can override missing evidence.
