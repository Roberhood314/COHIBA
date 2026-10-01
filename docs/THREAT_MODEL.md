# COHIBA Threat Model v1.0

## Scope
Production website, launch API, Railway runtime, persistent launch state, Solana signer, RPC dependency, metadata, public evidence endpoints and post-launch market data.

## Assets
- Mainnet signer secret.
- Launch authorization secret.
- Fixed-supply invariant.
- Mint/freeze authority state.
- Persistent launch record.
- Canonical metadata and domain.
- Public verification data.
- Project reputation and market-data integrity.

## Trust boundaries
1. Public internet ↔ web/API edge.
2. Web process ↔ Railway secrets.
3. Web process ↔ persistent volume.
4. Web process ↔ Solana RPC.
5. Signer ↔ Solana transaction submission.
6. Project systems ↔ external market-data providers.

## Adversaries
- Opportunistic internet attacker.
- Credential thief.
- Malicious or compromised dependency.
- RPC/provider failure or manipulation.
- Insider with partial infrastructure access.
- Market participant attempting to falsify public metrics.

## Principal threats and controls
### Unauthorized Mainnet launch
Controls: ALLOW_MAINNET gate, separate launch key, exact-origin requirement, rate limiting, explicit release procedure, persistent duplicate-launch guard.

### Secret exfiltration
Controls: secrets remain in Railway secret storage; no public API returns secret material; repository security scanner rejects private-key/mnemonic patterns in critical files.

### Duplicate mint
Controls: persistent launch record, locked-state check, in-process active-launch lock and idempotent recovery from existing mint state.

### Supply manipulation
Controls: exact BigInt supply constant, pre/post-revocation supply checks, destination balance verification and public on-chain verification.

### Authority retention
Controls: explicit freeze then mint authority revocation followed by null verification.

### Metadata substitution
Controls: canonical HTTPS metadata URI, expected name/symbol/image checks during readiness, immutable Metaplex metadata target.

### Path traversal / malformed HTTP
Controls: path decoding guard, null/backslash/dot-path rejection, method restrictions, body-size bounds and security headers.

### Brute-force launch attempts
Controls: launch-specific rate limiting plus global API rate limiting.

### RPC outage or inconsistent data
Controls: confirmed commitment, readiness RPC check, fail-closed launch checks, post-launch independent explorer verification.

### Persistent-state corruption
Controls: Mainnet corrupt-record hard failure rather than silently rebuilding state.

### Fake market evidence
Controls: market fields remain null until live; policy forbids wash trading, fabricated liquidity/holders/volume; public market evidence must include source and timestamp.

## Residual risks
- Compromise of hosting or secrets platform.
- Supply-chain compromise in npm dependencies.
- Solana protocol/network incidents.
- Domain/DNS compromise.
- Human operational error during final release.
- Third-party market manipulation outside project control.

## Required residual-risk mitigations before Mainnet
- Independent human security review.
- Dependency audit with high/critical findings resolved or documented.
- Backup/restore test for persistent launch record.
- Final signed release/evidence snapshot.
- Signer funding limited to operational need.
