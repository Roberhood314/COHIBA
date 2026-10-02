# Dependency Security Exception & Local Patch — CVE-2025-3194

## Status
**MITIGATED BY LOCAL PATCH — UPSTREAM PATCH UNAVAILABLE**

## Advisory
- Package: `bigint-buffer`
- Advisory: `GHSA-3gc7-fjrx-p6mg` / `CVE-2025-3194`
- Upstream affected range: through 1.1.5
- Upstream patched version: none published at the time of this mitigation

## COHIBA mitigation
COHIBA replaces the vulnerable transitive package through npm `overrides` with a repository-vendored, pure-JavaScript compatibility fork:

- path: `vendor/bigint-buffer-safe`
- package identity: `bigint-buffer@1.1.6` (**COHIBA-local fork; not an upstream npm release**)
- native N-API path: removed
- API retained: `toBigIntBE`, `toBigIntLE`, `toBufferBE`, `toBufferLE`
- hostile/invalid input: rejected with `TypeError` rather than entering the vulnerable native conversion path

The implementation is based on the public MIT-licensed `bigint-buffer-safe` compatibility implementation and is vendored so the production dependency is pinned to reviewed source rather than fetched from an unpinned third-party branch.

## Verification gates
CI must prove all of the following:
1. the installed production tree resolves `bigint-buffer` to `1.1.6`;
2. conversion compatibility tests pass;
3. invalid-input regression tests pass;
4. invariant/mutation tests pass;
5. security posture verification passes;
6. TypeScript verification passes;
7. production build/evidence generation passes;
8. `npm audit --omit=dev --audit-level=high` passes.

## Upgrade policy
This local fork is a temporary compatibility mitigation, not a permanent preference.

Replace it when either:
- Solana dependencies no longer require the vulnerable package; or
- upstream publishes a reviewed fixed release that can be adopted without breaking the launch invariants.

Any replacement must pass the same verification gates before merge.
