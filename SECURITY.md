# COHIBA Security Policy

## Security objective
COHIBA treats fixed supply, authority revocation, launch authorization and public evidence integrity, signed SI authority and atomic PostgreSQL commit admission as security-critical properties.

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

### Sensitive vulnerability reporting
Do **not** publish secrets, private keys, working exploit payloads, credential material, or production-impacting reproduction steps in a public issue.

Until a dedicated private security inbox or GitHub Private Vulnerability Reporting channel is confirmed as active for this repository, use this two-step intake:

1. Open a minimal public issue using the **Sensitive Security Intake** template.
2. Include only:
   - affected component;
   - proposed severity;
   - a one-line impact summary;
   - a request for a private disclosure channel.

Do **not** include exploit code, secrets, private URLs, credentials, signing material, or step-by-step instructions in that public intake.

The maintainer must move the discussion to a private channel before requesting sensitive technical details.

### Safe testing boundary
Allowed:
- static analysis;
- local reproduction;
- unit/integration tests;
- Devnet testing;
- non-destructive review of public endpoints.

Not allowed without explicit written authorization:
- Mainnet launch attempts;
- credential testing;
- secret extraction;
- denial-of-service;
- destructive production testing;
- testing third-party infrastructure outside its own rules.

### Public disclosure
Confirmed findings may be documented publicly only after remediation or when disclosure is otherwise safe. Public evidence should distinguish SUBMITTED, CONFIRMED, FIXED and RETESTED states.

## SI review intake and response targets

The pinned [SI boundary review kit](open-review/si/README.md) describes exact scope, reproduction and exclusions. Maintainer targets: acknowledgment within 2 business days, initial triage within 7 business days after sufficient evidence is received, and weekly updates on open confirmed findings. These are targets, not guaranteed SLAs. Private-channel readiness must be confirmed before sensitive details are requested. See [handling policy](open-review/si/HANDLING.md).

## Severity
- **Critical:** signer/private-key compromise, unauthorized Mainnet launch, arbitrary minting, authority-control bypass, broad unauthorized SI business effects.
- **High:** persistent-state bypass, supply-verification bypass, launch-auth bypass, confirmed SI revocation/scope/replay bypass within the documented SQL boundary.
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


## Operational security references
- [Threat Model v2](docs/THREAT_MODEL.md)
- [Treasury & Key Management Policy](docs/TREASURY_KEY_MANAGEMENT.md)
- [Incident Response Runbook](docs/INCIDENT_RESPONSE_RUNBOOK.md)
- [Canonical Project Registry](docs/CANONICAL_PROJECT_REGISTRY.md)
- [Launch & Post-Launch Operations](launch/POST_LAUNCH_OPERATIONS.md)
