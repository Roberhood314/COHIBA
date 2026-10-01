# COHIBA Verification Specification v1.0

## Purpose
This specification defines what must be true before COHIBA may be described as a verified Mainnet release.

## Canonical invariants
1. Token standard: Solana SPL Token.
2. Decimals: exactly 9.
3. Total base-unit supply: exactly 1,000,000,000,000,000,000.
4. Human-readable supply: exactly 1,000,000,000 COH.
5. Initial verified destination balance: exact full fixed supply at issuance.
6. Metadata exists at the expected Metaplex PDA and is immutable.
7. Mint authority is null after finalization.
8. Freeze authority is null after finalization.
9. Persistent release state is LOCKED_VERIFIED.
10. A second successful launch for the same network must be prevented by persistent state.

## State machine
NEW
→ MINT_CREATED
→ ATA_READY
→ SUPPLY_MINTED
→ METADATA_READY
→ FREEZE_REVOKED
→ MINT_REVOKED
→ LOCKED_VERIFIED

Skipping forward states, moving backward, or repeating finalization is invalid.

## Fail-closed rules
- Unexpected mint authority: abort.
- Unexpected freeze authority: abort.
- Supply mismatch: abort.
- Destination balance mismatch: abort.
- Corrupt Mainnet launch record: hard failure.
- Missing signer: block Mainnet.
- Insufficient signer funding: block Mainnet.
- Metadata validation failure: block Mainnet readiness.
- Invalid launch key or origin: reject launch request.

## Verification layers
### Layer A — static specification
Source constants, Whitepaper, token metadata and project-data schema agree on token identity.

### Layer B — automated logic tests
Node test suite validates exact supply math, final invariants, state transitions and a deterministic 2,000-case mutation corpus.

### Layer C — security posture
Automated checks assert that Mainnet gating, launch-key/origin controls, rate limits, request bounds, immutable metadata and post-revoke checks remain present.

### Layer D — Devnet evidence
Devnet launch must demonstrate supply, metadata and authority revocation before Mainnet.

### Layer E — Mainnet evidence
After release, public Solana RPC data must independently confirm mint, supply, authorities, destination balance and transaction history.

## Evidence policy
A claim is VERIFIED only when its supporting evidence can be reproduced from public source code, CI output or public blockchain data. Planned values are never promoted to verified facts solely because they appear in documentation.
