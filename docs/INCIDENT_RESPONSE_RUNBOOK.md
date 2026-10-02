# COHIBA Incident Response Runbook v1.0

## Objective
Provide a repeatable response to security, identity, treasury, infrastructure and market-integrity incidents.

## Lifecycle
COHIBA uses the operating sequence:
**Prepare → Detect → Verify → Contain → Communicate → Recover → Review**

This aligns operationally with established incident-response practice and the Govern/Identify/Protect/Detect/Respond/Recover lifecycle used by modern cybersecurity frameworks.

## Severity
### SEV-1 Critical
- signer/private-key compromise;
- unauthorized Mainnet launch;
- unauthorized mint/authority change;
- treasury compromise;
- canonical domain hijack with active phishing;
- malicious production deployment affecting signing/launch controls.

### SEV-2 High
- GitHub/Railway privileged-account compromise;
- social takeover posting fake mint;
- persistent-state bypass;
- fake pool/token causing material user confusion;
- high-impact dependency compromise.

### SEV-3 Medium
- evidence/analytics integrity issue;
- service outage;
- non-critical website compromise;
- security-header or monitoring defect.

### SEV-4 Low
- cosmetic issue;
- low-impact information disclosure;
- minor operational defect.

## First-response checklist
1. Open an incident record with UTC timestamp.
2. Assign severity.
3. Preserve evidence; do not delete relevant logs.
4. Stop non-essential changes.
5. Identify affected credentials/assets.
6. Contain the smallest necessary surface.
7. Establish one verified communication source.
8. Record every privileged action.

## Scenario playbooks

### A. Suspected signer compromise
- Stop discretionary signing.
- Do not fund the suspected wallet.
- Verify whether any transaction has been submitted.
- If treasury signer: replace through clean multisig signers.
- If launch payer: rotate/rebuild signer under the approved release process.
- Review Solana transactions from the affected public key.
- Publish a notice only if user-facing risk exists.

### B. Treasury compromise
- Freeze discretionary treasury operations.
- Verify multisig member set and threshold.
- Remove/replace compromised signer using clean signers.
- Trace unauthorized transactions.
- Preserve transaction signatures and affected addresses.
- Do not lower threshold to accelerate recovery.
- Escalate to external security/legal support when material.

### C. DNS / domain compromise
- Lock registrar account and revoke sessions.
- Restore known-good DNS.
- Use GitHub repository and unaffected official channels to warn users.
- Do not publish new mint addresses during domain uncertainty.
- Verify TLS/DNS propagation and website content before declaring recovery.

### D. Official social account takeover
- Revoke sessions and rotate credentials.
- Publish warning from canonical website/GitHub and unaffected channels.
- State that mint/pool identifiers must be checked against the canonical registry.
- Remove malicious posts after evidence preservation.
- Review connected apps and API tokens.

### E. Fake COHIBA token or pool
- Add a warning to canonical website/registry.
- Publish the verified status: Mainnet mint null if pre-launch, or exact official mint if post-launch.
- Report impersonation to relevant platform/provider.
- Do not interact with or trade the fake asset merely to "test" it.
- Preserve links, screenshots and addresses as evidence.

### F. Malicious dependency / CI compromise
- Stop production deployments.
- Pin/revert to known-good commit and lockfile.
- Rotate CI/deployment credentials if exposure is plausible.
- Audit recent workflow/dependency changes.
- Rebuild from trusted source.
- Re-run verification/security evidence generation.

### G. Website/API compromise
- Isolate affected service.
- Preserve logs and release SHA.
- Rotate exposed secrets.
- Restore from known-good build.
- Verify canonical files and security evidence hashes.
- Re-enable only after minimum regression/security checks pass.

## Communications standard
Every material public notice should state:
- what is known;
- what is not yet known;
- affected systems;
- user action required, if any;
- canonical verification source;
- next update only when new verified facts exist.

Never:
- speculate;
- publish secret material;
- claim "funds safe" without verification;
- claim an incident is resolved before containment and verification.

## Recovery criteria
Incident may move to RECOVERED when:
- compromised access is removed;
- critical secrets/signers are rotated where required;
- production state is verified;
- canonical identity is restored;
- no unresolved Critical finding remains in the affected path;
- evidence is preserved.

## Post-incident review
Within the incident record document:
- root cause;
- timeline;
- blast radius;
- detection gap;
- containment actions;
- corrective actions;
- owner for each action;
- verification evidence;
- policy/runbook changes.

## Exercise requirement
Before Mainnet perform at least one tabletop drill for:
1. signer compromise;
2. domain/social takeover;
3. fake-token announcement.

Result must be documented as PASS / PARTIAL / FAIL with remediation.
