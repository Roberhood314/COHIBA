# COHIBA Dependency Risk Register v1.0

## Status
**ACTIVE PRE-MAINNET RISK REGISTER**

Baseline production commit: `504b8e43586732cd0494c5dc636d96167aee7f22`

The production security gate currently passes at `npm audit --omit=dev --audit-level=high` with:
- Critical: 0
- High: 0
- Moderate: 13

These Moderate findings are not ignored. They are tracked here because the current transitive chain reports no upstream fix.

## Current Moderate advisories

### D-001 — stream-json nested-input DoS
- Advisory: GHSA-528h-pc64-c93x
- Severity: Moderate
- Package: `stream-json <=3.4.0`
- Dependency path: `@solana/web3.js -> jayson -> stream-json`
- Direct COHIBA import: NO
- npm audit status: No fix available
- Primary risk: crafted deeply nested JSON can cause excessive processing time in affected filter operations.
- COHIBA exposure note: COHIBA does not directly invoke `stream-json`; exposure is inherited through the Solana RPC client dependency chain.

Compensating controls:
1. public request body-size limits;
2. strict API route/method restrictions;
3. fail-closed launch checks;
4. Solana RPC responses are not accepted as authorization by themselves;
5. launch state requires local invariant verification;
6. Mainnet remains default-deny;
7. dependency tree locked by `package-lock.json`;
8. High/Critical audit gate remains mandatory.

Exit criteria:
- upstream dependency chain no longer includes vulnerable `stream-json`, or
- project migrates to a Solana client stack that removes the affected chain, and
- all invariant/security/build tests pass.

### D-002 — uuid buffer-bounds issue
- Advisory: GHSA-w5hq-g745-h8pq
- Severity: Moderate
- Package: `uuid <11.1.1`
- Dependency path: `@solana/web3.js -> jayson -> uuid`
- Direct COHIBA import: NO
- npm audit status: No fix available in the currently resolved upstream chain.
- Primary risk: affected UUID v3/v5/v6 APIs may lack adequate buffer bounds checks when a caller supplies a buffer.

Compensating controls:
1. COHIBA does not directly call affected UUID APIs;
2. no user-supplied UUID buffer is used as a launch authorization primitive;
3. launch secrets, signer checks and state invariants do not depend on UUID values;
4. dependency tree is locked;
5. High/Critical audit gate remains mandatory.

Exit criteria:
- upstream chain resolves to fixed UUID version, or
- migration removes the vulnerable chain,
- then full verification is rerun.

## Acceptance policy
Moderate findings may remain temporarily only when:
- Critical = 0;
- High = 0;
- no direct unsafe use is present;
- compensating controls are documented;
- the risk is reviewed before Mainnet;
- a migration/remediation path is tracked.

No Moderate finding may be silently reclassified as "fixed".

## Review cadence
Review this register:
- on every dependency update;
- before Mainnet;
- after any Solana/Metaplex dependency migration;
- when npm advisory status changes;
- after external security review.
