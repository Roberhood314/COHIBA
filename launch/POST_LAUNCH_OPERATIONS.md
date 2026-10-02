# COHIBA Launch & Post-Launch Operations Plan v1.0

## Status
**PRE-MAINNET RUNBOOK — DOES NOT AUTHORIZE MAINNET**

## T-7d to T-24h: release readiness
Required:
- production commit selected and frozen;
- CI/security verification green;
- independent review complete;
- Critical/High findings closed or explicitly blocking;
- legal/compliance release gate complete;
- treasury multisig verified;
- allocation/vesting disclosure finalized;
- canonical registry prepared with Mainnet fields null;
- backup/restore drill passed;
- incident tabletop exercise completed;
- RPC/explorer verification sources selected;
- liquidity plan approved;
- evidence-capture template ready.

## T-2h
- confirm authorized release participants;
- confirm network = Mainnet beta;
- verify signer public key;
- fund payer with only required operational SOL;
- verify destination wallet;
- verify canonical metadata;
- confirm `ALLOW_MAINNET=false` before release window;
- capture release commit SHA.

## Launch window
Only after explicit owner authorization:
1. enable approved Mainnet gate;
2. arm launch;
3. create mint;
4. create destination ATA;
5. mint exactly 1,000,000,000 COH;
6. verify exact base-unit supply;
7. verify destination balance;
8. revoke freeze authority;
9. verify freeze authority null;
10. revoke mint authority;
11. verify mint authority null;
12. persist locked launch state;
13. verify using independent RPC/explorer;
14. capture all transaction signatures;
15. disable Mainnet launch gate;
16. update canonical registry with verified mint.

Stop immediately on any invariant mismatch.

## T+1h
- verify website/registry consistency;
- verify supply and authorities again;
- verify metadata;
- check for impersonation/fake-token activity;
- confirm no unexpected signer transactions;
- publish factual launch evidence only.

## Liquidity phase
Before creating a pool:
- venue and pair approved;
- seed amounts recorded;
- paired asset source recorded;
- LP custody/lock/burn policy recorded;
- slippage/price-impact test documented;
- treasury exposure limit approved.

After pool creation:
- record pool address;
- verify reserves;
- update canonical registry;
- publish actual facts, not price predictions.

## T+24h
Review:
- website uptime and error logs;
- RPC/provider health;
- registry consistency;
- treasury transactions;
- holder/account concentration from public source;
- liquidity changes;
- reported impersonation/security issues;
- community feedback;
- analytics integrity.

## T+7d
Publish an evidence-based operating review:
- security incidents/findings;
- treasury movements;
- liquidity state;
- community contribution metrics;
- organic vs paid distribution;
- registry changes;
- open risks and remediation.

## T+30d
Conduct:
- post-launch security review;
- key/signer health review;
- treasury governance review;
- dependency review;
- incident-response review;
- community traction evidence review;
- listing-data accuracy review;
- circulating-supply methodology review.

## Continuous monitoring
Monitor:
- DNS/domain integrity;
- official social account security;
- GitHub/release changes;
- Railway production health;
- RPC availability;
- treasury signer/member changes;
- unexpected treasury movement;
- fake token/pool reports;
- security reports;
- canonical registry drift.

## Release stop conditions
Do not proceed or continue release if:
- network mismatch;
- destination wallet mismatch;
- supply mismatch;
- authority revoke fails;
- signer identity uncertain;
- release SHA differs from approved build;
- Critical/High security blocker appears;
- canonical metadata unavailable;
- persistent launch state is inconsistent.

## Evidence bundle
Archive:
- release SHA;
- security-evidence manifest hash;
- UTC timestamps;
- mint address;
- metadata address;
- transaction signatures;
- final supply;
- authority state;
- destination balance;
- explorer/RPC evidence;
- treasury Vault;
- pool address when live;
- registry commit SHA.

## Operating principle
COHIBA must prefer a delayed release over an irreversible release with unresolved security or evidence uncertainty.
