# COHIBA Security Policy

## Security objective
COHIBA treats fixed supply, authority revocation, launch authorization and public evidence integrity as security-critical properties.

## Supported surface
The supported security surface is the production branch `main`, the canonical site `cohibameme.site`, launch server, token scripts, persistent launch state and public verification endpoints.

## Critical invariants
- Mainnet is default-deny.
- Supply must equal exactly 1,000,000,000 COH / 1,000,000,000,000,000,000 base units.
- Final mint authority must be null.
- Final freeze authority must be null.
- Metadata must be immutable.
- A locked launch cannot be repeated.
- Public market data may not be represented as verified until independently observable.

## Reporting
Do not publish secrets, private keys, exploit payloads against production, or stolen credentials in a public issue. Report suspected vulnerabilities privately through an official project communication channel. A dedicated security email should be added before Mainnet.

## Severity
- **Critical:** signer/private-key compromise, unauthorized Mainnet launch, arbitrary minting, authority-control bypass.
- **High:** persistent-state bypass, supply-verification bypass, launch-auth bypass.
- **Medium:** verification-data integrity flaws, meaningful availability/security-header defects.
- **Low:** non-sensitive information leakage or cosmetic security issues.

## Evidence
Automated security evidence is generated during production builds at:
- `/security-evidence.json`
- `/security.html`

The manifest contains SHA-256 hashes for security-critical source, tests and specifications. It contains no private keys or launch secrets.

## Independent review boundary
Implemented controls and automated tests are not an independent audit. COHIBA must not claim “audited” until an external reviewer has completed a security assessment with verifiable evidence.

## Mainnet rule
Mainnet remains disabled until the final release review, independent review requirement, dependency-risk review and recovery drill have been completed or explicitly documented as unresolved blockers.
