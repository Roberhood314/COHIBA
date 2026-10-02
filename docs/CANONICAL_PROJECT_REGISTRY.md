# COHIBA Canonical Project Registry Policy v1.0

## Purpose
Maintain one authoritative, machine-readable source for official COHIBA identifiers and prevent fake-token, fake-domain and fake-pool substitution.

## Source of truth
Machine-readable registry:
`registry/project-registry.json`

Human-readable policy:
this document.

## Precedence
When sources conflict, users and integrators should prefer:
1. canonical registry on the official repository;
2. canonical registry mirrored on `cohibameme.site`;
3. official website pages that reference the same registry;
4. official social channels.

A social post, reply, DM, screenshot or third-party listing never supersedes the canonical registry.

## Registry rules
- Unknown or not-yet-live identifiers must be `null`, never placeholders that resemble real addresses.
- Mainnet mint remains `null` until successfully created and independently verified.
- DEX pool remains `null` until live and verified.
- Treasury Vault remains `null` until the production multisig exists and is verified.
- Every Mainnet identifier update records evidence and timestamp.
- Registry changes are security-sensitive governance changes.

## Required identifiers
- project name;
- symbol;
- chain;
- official website;
- official GitHub repository;
- official X account;
- whitepaper path;
- security policy path;
- Mainnet mint;
- explorer URL;
- metadata address/URI;
- treasury Vault;
- primary DEX/pool;
- launch status;
- last verified timestamp.

## Mainnet update procedure
After successful launch:
1. independently verify mint and authorities;
2. record mint address;
3. generate explorer URL;
4. record metadata evidence;
5. commit registry update;
6. publish/mirror the same registry on the website;
7. verify all official channels reference the same mint.

## Anti-impersonation rule
Before Mainnet, the correct official statement is:
**"COHIBA Mainnet mint: NOT LAUNCHED / null in canonical registry."**

After Mainnet, only the exact registry value is official.
