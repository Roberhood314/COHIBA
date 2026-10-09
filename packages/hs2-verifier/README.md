# HS/2 experimental verifier

Mandatory Ed25519 **AND** SLH-DSA-SHA2-128f across the entire Human Signal proof chain. Operator-pinned PQ keys; exact suite; no classical-only fallback. Exposes `inspectHybridAuthority` (never authorizes execution) and `commitHybridAuthority` (requires the integrating service's atomic SQL adapter). Portable signature checks in `wire.mjs` are shared by the browser lab.

This package requires the sibling `authority-verifier` directory and the exact dependencies in package.json. It does not import COHIBA application/token code or make network requests. Copy both directories into an independent service and install the HS/2 package dependencies. Never use fixture trust or public synthetic keys in production.

Read [the integration guide](../../docs/HS2_INTEGRATION_AND_ROADMAP.md) for the exact signing format, migration/complete-mediation requirements, trust bootstrap, SQL integration and future evidence gates. [Public lab](https://cohibameme.site/si-lab.html) verifies signatures locally, not live authority or business effects.

Experimental, pre-audit; not a ratified protocol or FIPS-validated module. Production authorization routes are unchanged. Secure enrollment, independent cross-implementation vectors, PQ secure channels and chain-native PQ enforcement remain future work.
