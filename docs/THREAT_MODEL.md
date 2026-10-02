# COHIBA Threat Model v2.0

## Status
**PRE-MAINNET SECURITY BASELINE**

This threat model is a design and operational control document. It does not claim an independent audit and does not authorize Mainnet.

## Security objectives
COHIBA must preserve:
1. fixed supply integrity;
2. irreversible revocation of mint and freeze authorities after verified issuance;
3. default-deny Mainnet launch authorization;
4. treasury and signer integrity;
5. canonical identity and metadata integrity;
6. availability and recoverability of production services;
7. integrity of public security, community and market evidence;
8. clear separation between implemented controls and independently verified evidence.

## Scope
- Canonical website and DNS.
- GitHub repository and CI/CD.
- Railway production runtime, environment secrets and persistent launch state.
- Solana payer/signer, destination wallet and future treasury multisig.
- SPL mint and metadata.
- RPC providers and explorer verification.
- Social accounts used as official project channels.
- Public analytics/evidence endpoints.
- Third-party dependencies used in build, hosting, analytics, wallet or liquidity operations.

## Critical assets
- Mainnet signer secret material.
- Launch authorization secret.
- Treasury signing keys and recovery material.
- Fixed-supply invariant.
- Mint/freeze authority state.
- Persistent launch record.
- Canonical website/DNS and repository.
- Official social accounts.
- Token metadata and future mint/pool identifiers.
- Public evidence records and release hashes.
- Reputation and disclosure integrity.

## Trust boundaries
1. Public internet ↔ web/API edge.
2. GitHub ↔ CI/CD ↔ deployment platform.
3. Web process ↔ runtime secrets.
4. Web process ↔ persistent volume.
5. Web process ↔ Solana RPC.
6. Signer ↔ Solana transaction submission.
7. Maintainer devices ↔ privileged accounts.
8. Treasury signers ↔ multisig vault.
9. Official project ↔ social platforms / DNS registrar.
10. Project systems ↔ market-data, DEX and explorer providers.

## Threat actors
- Opportunistic internet attacker.
- Credential thief / phishing operator.
- Malicious or compromised package/dependency.
- Compromised CI token or deployment credential.
- RPC/provider failure or manipulated upstream response.
- Insider with partial privileged access.
- Lost or compromised signer device.
- Domain/DNS hijacker.
- Social-account hijacker / impersonator.
- Fake-token deployer or scammer.
- Market participant attempting to fabricate activity or evidence.

## Threat scenarios and required controls

### T01 — Unauthorized Mainnet launch
**Impact:** irreversible mint creation or launch outside approved release window.

**Controls**
- `ALLOW_MAINNET` remains false by default.
- Separate launch authorization secret.
- Explicit arming phrase and owner authorization.
- Rate limiting and exact-origin checks.
- Release checklist with independent evidence capture.
- Persistent duplicate-launch guard.
- Mainnet gate enabled only for the approved release window and disabled immediately after execution.

### T02 — Signer / secret exfiltration
**Impact:** unauthorized transactions or treasury loss.

**Controls**
- No seed phrase/private key in repository, browser storage, analytics or logs.
- Runtime secret store only for required service credentials.
- Treasury uses a multisig rather than a single hot wallet.
- Privileged maintainers use phishing-resistant MFA where supported.
- Signer funding is minimized to the operational requirement.
- Rotation/recovery procedure documented before Mainnet.

### T03 — Treasury compromise
**Impact:** loss or unauthorized movement of project assets.

**Controls**
- Treasury governed by multisig.
- No 1/N threshold and no all-signers-required threshold as the production default.
- Separate signer devices and recovery backups.
- Transaction purpose, destination and amount reviewed before approval.
- Public treasury address and material treasury movements recorded after Mainnet.
- Emergency signer replacement procedure.

### T04 — Duplicate or inconsistent mint
**Impact:** multiple candidate tokens, user confusion, fragmented liquidity.

**Controls**
- Persistent launch record.
- Locked-state check.
- In-process active-launch lock.
- Recovery from existing verified mint state.
- Canonical registry publishes exactly one official Mainnet mint only after verification.

### T05 — Supply manipulation
**Impact:** supply differs from disclosed 1,000,000,000 COH.

**Controls**
- Exact BigInt supply constant.
- Pre/post issuance balance checks.
- Independent RPC verification.
- Mint authority revoked after verified issuance.
- Public supply evidence recorded with transaction signatures and timestamp.

### T06 — Authority retention
**Impact:** future minting or freezing remains possible after launch.

**Controls**
- Freeze authority revoked and verified null.
- Mint authority revoked and verified null.
- Release cannot be marked `LOCKED_VERIFIED` until both are null.
- Canonical evidence page exposes the final authority state.

Solana documents that setting an authority to `None` permanently removes that authority. This is an irreversible control and must occur only in the approved launch sequence.

### T07 — Metadata or canonical-identity substitution
**Impact:** users are directed to fake websites, fake tokens or altered metadata.

**Controls**
- Canonical HTTPS domain.
- Canonical registry containing official website, repository, social channels and future mint/pool identifiers.
- Registry fields remain null until independently verified.
- Metadata name/symbol/image validated during readiness.
- Release hashes published for security-critical records.

### T08 — DNS or website hijack
**Impact:** phishing, fake mint or wallet-drain instructions.

**Controls**
- Registrar and DNS administrative accounts use strong MFA.
- Minimal number of privileged accounts.
- DNS change history monitored.
- Emergency static warning page prepared.
- Canonical GitHub repository acts as a secondary source of truth.
- Incident playbook defines domain-compromise communications.

### T09 — Social-account takeover / impersonation
**Impact:** fake launch announcements, fake mint addresses or malicious links.

**Controls**
- Strong MFA on official social accounts.
- Canonical registry and website always outrank social replies/DMs as identity evidence.
- Project never announces a new official mint only via a social post.
- Compromise procedure revokes sessions, changes credentials, publishes cross-channel warning and freezes discretionary operations.

### T10 — Dependency / supply-chain compromise
**Impact:** malicious build output, secret theft or unauthorized code.

**Controls**
- Lockfile committed.
- CI typecheck/tests/security verification.
- Dependency review before Mainnet.
- High/critical dependency findings resolved or explicitly documented.
- Security-critical release commit frozen and hashed.
- Unexpected dependency or workflow changes trigger manual review.

### T11 — CI/CD or GitHub compromise
**Impact:** malicious production deployment.

**Controls**
- Least-privilege repository access.
- MFA for privileged maintainers.
- Production branch review discipline.
- Protected release procedure.
- Deployment secrets never stored in source.
- Production release SHA recorded in launch evidence.

### T12 — RPC outage or manipulated upstream data
**Impact:** false readiness result or failed launch.

**Controls**
- Confirmed commitment.
- Fail-closed readiness checks.
- Post-launch verification using an independent RPC/explorer source.
- No market/evidence field accepted without source and timestamp.

### T13 — Persistent-state corruption
**Impact:** duplicate launch or inconsistent recovery.

**Controls**
- Mainnet corrupt-record hard failure.
- Backup/restore drill before Mainnet.
- Recovery never silently recreates irreversible state.
- Launch record hash included in evidence bundle.

### T14 — Evidence manipulation
**Impact:** false claims about audit, traction, holders, liquidity or volume.

**Controls**
- Evidence classification and source timestamps.
- External-audit status cannot be self-assigned.
- First-party analytics are not represented as unique humans.
- Paid/incentivized engagement separated from organic evidence.
- Market metrics remain null until live and independently observable.

### T15 — Fake token / fake pool
**Impact:** users trade an impersonation asset.

**Controls**
- Canonical registry is the single authoritative identifier source.
- Mainnet mint and pool remain blank/null before launch.
- Website, repository and social channels publish the same verified identifiers after launch.
- Incident procedure covers fake-token takedown/notification.

### T16 — Operational human error
**Impact:** irreversible configuration mistake.

**Controls**
- Four-eyes review for Mainnet and treasury-critical actions.
- Dry-run on Devnet.
- Step-by-step launch runbook.
- Explicit stop conditions.
- Evidence capture at every irreversible step.
- No rushed bypass of unresolved Critical/High findings.

## Risk rating
Each material risk is rated:
- **Critical:** unauthorized minting, signer compromise, unauthorized Mainnet launch, treasury compromise.
- **High:** authority-control bypass, persistent-state bypass, CI/CD compromise, canonical identity compromise.
- **Medium:** evidence-integrity defect, dependency issue without direct signing impact, material availability failure.
- **Low:** cosmetic/security-hardening issue with no meaningful asset or trust impact.

## Required Mainnet residual-risk gates
Before Mainnet, all of the following must be true or explicitly block launch:
- Independent human security review completed.
- Critical/High findings closed or accepted by documented owner decision.
- Dependency-risk review completed.
- Backup/restore drill completed.
- Treasury/key-management policy activated.
- Canonical registry prepared with Mainnet fields intentionally null until execution.
- Incident-response exercise completed.
- Production release commit frozen and evidence manifest generated.
- Legal/compliance release gate completed.
- Signer minimally funded.
- Explicit owner authorization recorded.

## Residual risks that cannot be eliminated
- Solana network/protocol incidents.
- Third-party DNS/hosting/social platform compromise.
- Zero-day vulnerabilities.
- External market manipulation.
- Signer coercion or simultaneous compromise above multisig threshold.
- Legal/regulatory change after launch.

These risks must be monitored, disclosed when material, and handled under the Incident Response Runbook.
