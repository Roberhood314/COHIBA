# COHIBA Governance Framework v1.0

## Purpose
Define who may change COHIBA code, infrastructure, treasury, disclosures and post-launch operating policy while preserving transparent human oversight.

## Principles
- Human-first accountability.
- No unilateral treasury control.
- No hidden token-policy changes.
- Security overrides speed.
- Mainnet actions require explicit authorization.
- Public claims must be evidence-backed.
- Community input does not equal automatic execution authority.

## Governance domains

### 1. Code & website
Routine content/code changes may proceed through repository workflow.
Security-critical changes require review before production:
- token launch logic;
- authority handling;
- signer handling;
- canonical registry;
- treasury integrations;
- authentication/secret logic;
- release workflows.

### 2. Mainnet launch
Mainnet launch is a one-time critical action requiring:
- all launch gates satisfied;
- independent review complete;
- release evidence snapshot;
- explicit owner authorization;
- controlled release window.

No document, PR merge or community poll alone authorizes Mainnet.

### 3. Treasury
Treasury transactions follow the multisig threshold and Treasury & Key Management Policy.
Material actions require a written purpose and evidence record.

### 4. Token economics
Fixed supply cannot be increased after mint authority is revoked.
Allocation/vesting changes before Mainnet require public versioned disclosure.
Post-Mainnet treasury distribution changes require governance documentation.

### 5. Liquidity
Pool creation, migration, liquidity removal and LP custody changes are high-risk governed actions.
Before execution publish:
- venue/pair;
- amounts;
- LP custody;
- lock/burn policy;
- authorized approvers;
- transaction evidence after execution.

### 6. Brand & canonical identity
Official domain, repository, X account, token mint and pool identifiers are maintained in the Canonical Project Registry.
No social post or DM supersedes the registry.

## Decision classes
### G0 — Editorial
Copy, typo, non-security visual change.
Approval: one maintainer.

### G1 — Operational
Non-critical deployment/configuration with no asset authority impact.
Approval: maintainer review and CI pass.

### G2 — Security-sensitive
Security policy, privileged integration, analytics evidence logic, registry schema.
Approval: at least two human reviewers where practicable; unresolved Critical/High findings block release.

### G3 — Asset-critical
Treasury movement, signer/threshold change, liquidity custody, authority transfer, Mainnet launch.
Approval: documented governance decision + required multisig/owner approvals + evidence capture.

## Community participation
Community may:
- submit issues/PRs;
- propose improvements;
- participate in Open Review;
- provide translations, research and creative contributions;
- challenge public evidence;
- propose governance changes.

Community participation does **not** grant access to private keys, secrets, registrar, hosting or treasury by default.

## Conflict-of-interest disclosure
A contributor or decision-maker should disclose material conflicts when recommending:
- a vendor;
- exchange/listing service;
- liquidity provider;
- auditor;
- paid partner;
- contractor;
- treasury recipient.

## Emergency authority
During an active security incident, maintainers may temporarily:
- pause discretionary deployments;
- rotate platform credentials;
- disable compromised integrations;
- publish emergency warnings.

Emergency authority must not be used to:
- mint extra supply;
- bypass required treasury threshold;
- falsify evidence;
- silently change token allocation.

## Governance record
Material G2/G3 decisions should record:
- decision ID;
- date;
- proposer;
- scope;
- rationale;
- risks;
- approvals;
- implementation commit/transaction;
- resulting evidence;
- status.

## Review cadence
Review this framework:
- before Mainnet;
- after any major incident;
- after any treasury signer change;
- at least annually while the project remains active.
