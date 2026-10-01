# COHIBA Independent Security Review Package v1.0

## Status
**READY FOR EXTERNAL REVIEW — NOT YET INDEPENDENTLY AUDITED**

This package is designed so an external reviewer can assess the project without relying on founder claims.

## Scope
Review:
- `web-server.mjs`
- `scripts/create-token-staged.ts`
- `scripts/revoke-authorities.ts`
- `scripts/check-token.ts`
- `lib/launch-invariants.mjs`
- `test/launch-invariants.test.mjs`
- launch-state persistence under `/data`
- Mainnet authorization gates
- metadata creation/immutability
- supply and destination-balance invariants
- mint/freeze authority revocation
- duplicate-launch/recovery logic
- public verification/security endpoints
- dependency/supply-chain exposure
- community analytics privacy boundary

## Security properties to independently verify
1. Mainnet cannot launch while `ALLOW_MAINNET != true`.
2. Public launch path requires a separately configured launch secret and exact canonical origin.
3. Fixed supply is exactly 1,000,000,000 COH / 1e18 base units.
4. No code path can increase supply after final authority revocation.
5. Mint authority is null after finalization.
6. Freeze authority is null after finalization.
7. Metadata is immutable.
8. Destination balance equals verified initial issuance.
9. Duplicate Mainnet minting is blocked across process/browser restarts by persistent state.
10. Corrupt Mainnet state fails closed.
11. Partial-launch recovery cannot silently create a second mint.
12. Sensitive secrets are never returned by public APIs or committed.
13. Aggregate community analytics do not persist IP/email/wallet/user identifiers.

## Required attack scenarios
- concurrent launch requests;
- replayed launch request;
- forged origin;
- wrong launch key;
- compromised/non-authority signer;
- RPC outage before/after mint creation;
- process crash at every state-machine boundary;
- corrupted/partial launch record;
- supply mismatch;
- destination ATA mismatch;
- authority mismatch;
- metadata endpoint mismatch;
- oversized/malformed request;
- path traversal;
- dependency compromise assumptions;
- data-evidence tampering.

## Deliverables requested from reviewer
- reviewed commit SHA;
- methodology and scope;
- severity-rated findings;
- evidence/reproduction notes;
- remediation validation;
- residual-risk statement;
- final report suitable for public publication;
- explicit exclusions.

## Audit acceptance gate
COHIBA may mark **INDEPENDENT AUDIT: COMPLETED** only when:
- reviewer identity/entity is disclosed;
- reviewed commit is identified;
- report exists;
- all Critical/High findings are resolved or publicly documented with rationale;
- remediation is re-reviewed where applicable;
- report hash or stable public URL is published.

## Suitable reviewer profile
Prefer firms/researchers with documented Solana/SPL security experience. Solana/Anza public audit repositories show prior work from organizations including OtterSec, Halborn, Neodyme, Zellic, Trail of Bits, NCC Group and others. This is a sourcing reference, not an endorsement or ranking.

## Canonical security references
- `docs/THREAT_MODEL.md`
- `docs/SECURITY_CONTROL_MATRIX.md`
- `docs/VERIFICATION_SPEC.md`
- `SECURITY.md`
- `web/public/security.html`
- `web/public/security-evidence.json`

## External review state
- Scope prepared: YES
- Threat model prepared: YES
- Invariants prepared: YES
- Automated tests prepared: YES
- Evidence manifest prepared: YES
- External reviewer engaged: NO EVIDENCE YET
- Independent report published: NO
