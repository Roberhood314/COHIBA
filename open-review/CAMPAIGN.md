# Current priority: a bounded SI/PostgreSQL review

Start with the [pinned SI review kit](si/README.md): three falsifiable questions, one-command synthetic reproduction, native PostgreSQL evidence, finding templates and response targets. No independent audit is claimed. Outreach drafts are prepared, not sent. The token/launch review surfaces below remain available separately.

# COHIBA OPEN REVIEW — BREAK IT BEFORE MAINNET

## Status
**OPEN — PRE-MAINNET — MAINNET REMAINS LOCKED**

COHIBA is inviting security researchers, Solana engineers, open-source contributors and technical reviewers to challenge the project before any irreversible Mainnet release.

The goal is simple:

> **Find the assumptions that fail before Mainnet makes them expensive.**

This campaign does not claim that COHIBA is audited. It exists specifically because independent review is still required.

## Who should participate
- Solana/SPL security researchers
- protocol and backend engineers
- application security engineers
- open-source contributors
- SRE/reliability engineers
- privacy reviewers
- technical writers who can identify evidence inconsistencies

## Priority review targets

### P0 — Launch safety
Review:
- Mainnet authorization gates
- exact-origin control
- separate launch key
- signer handling
- duplicate-launch protection
- persistent state recovery
- partial-launch recovery
- concurrent launch behavior

### P1 — Token invariants
Review:
- exact fixed-supply math
- destination balance verification
- mint authority revocation
- freeze authority revocation
- immutable metadata
- final `LOCKED_VERIFIED` state

### P2 — Evidence integrity
Review:
- public verification endpoints
- security evidence manifest
- status/claim consistency
- Mainnet/Devnet separation
- planned vs verified facts

### P3 — Web/API security
Review:
- request-size bounds
- path traversal defenses
- origin validation
- rate limiting
- HTTP headers/CSP
- malformed request handling

### P4 — Privacy
Review:
- community aggregate analytics
- whether metrics records store identifiers
- mismatch between Privacy Policy and implementation

## Canonical scope
Primary files:
- `web-server.mjs`
- `lib/launch-invariants.mjs`
- `test/launch-invariants.test.mjs`
- `scripts/create-token-staged.ts`
- `scripts/revoke-authorities.ts`
- `scripts/check-token.ts`
- `scripts/verify-security-posture.mjs`
- `scripts/generate-security-evidence.mjs`
- `docs/THREAT_MODEL.md`
- `docs/VERIFICATION_SPEC.md`
- `docs/SECURITY_CONTROL_MATRIX.md`

Extended scope:
- public website verification/security surfaces
- persistent launch-state handling
- first-party aggregate analytics

## Out of scope
- social engineering against individuals
- credential theft
- denial-of-service against production
- destructive testing against Railway/Solana infrastructure
- accessing data/accounts without authorization
- testing third-party services outside their own published rules
- Mainnet launch attempts
- any action requiring private keys/secrets

Use local, static, test or Devnet methods where possible.

## Finding severity

### Critical
A realistic path to unauthorized Mainnet launch, duplicate Mainnet mint, secret compromise, supply violation after finalization, or irreversible loss of intended launch safety.

### High
A serious control bypass or integrity failure that could materially compromise launch correctness, authority state, persistent recovery or public security claims.

### Medium
A bounded security/reliability weakness requiring non-trivial conditions or with limited impact.

### Low
Hardening, minor inconsistency, defense-in-depth or documentation/evidence issue.

### Informational
Useful observation with no direct security impact.

## Valid submission
A useful report should contain:
1. title;
2. severity proposal;
3. affected file/component;
4. preconditions;
5. reproduction steps or proof;
6. impact;
7. suggested remediation if known;
8. whether disclosure should initially be private.

Do not include real secrets or exploit production systems.

## Submission paths
### Non-sensitive findings
Open a GitHub issue:
https://github.com/Roberhood314/COHIBA/issues

Prefix title:
`[OPEN REVIEW]`

### Potentially sensitive findings
Do not publish exploit details publicly.

Use the repository **Sensitive Security Intake** issue template and include only minimal non-sensitive metadata. The maintainer must establish a private channel before requesting exploit details, credentials, secrets, or sensitive reproduction steps.

Never:
- test Mainnet launch paths;
- attack production availability;
- attempt credential/secret extraction;
- probe third-party infrastructure outside its own rules.

## Review handling
For substantive reports COHIBA should:
- acknowledge receipt;
- reproduce or explain why it cannot be reproduced;
- classify severity;
- link remediation commit/PR when fixed;
- credit the reporter if they want attribution;
- preserve a public evidence trail once safe to disclose.

## Recognition
Verified contributors may receive:
- public credit in the review evidence log;
- contributor profile/spotlight;
- GitHub attribution;
- consideration for Trust/Builder Ambassador roles.

## Financial bounty policy
A cash/token bounty is **not promised unless a funded bounty amount and payment terms are published in advance**.

This rule prevents unfunded reward claims. If a funded bounty pool is later approved, the campaign page must publish:
- total funded pool;
- severity amounts/ranges;
- eligibility;
- duplicate-report policy;
- payment method;
- payment timeline;
- tax/compliance conditions.

Until then, OPEN REVIEW is an open-source review and recognition campaign.

## Evidence log
All accepted public findings should be recorded in:
`open-review/EVIDENCE_LOG.md`

The log must distinguish:
- SUBMITTED
- TRIAGED
- CONFIRMED
- FIXED
- RETESTED
- NOT_REPRODUCIBLE
- DUPLICATE

## Success criteria
The campaign succeeds when it produces one or more of:
- a verified external finding;
- an independent reviewer engagement;
- a merged external PR;
- improved tests/invariants;
- improved evidence/documentation;
- a credible third-party review report.

Follower count is not a success criterion.

## Mainnet rule
This campaign does not authorize Mainnet.

Mainnet remains blocked until all release gates and the separate explicit owner approval requirement are satisfied.
