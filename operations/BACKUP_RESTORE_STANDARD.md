# COHIBA Backup & Restore Standard v1.0

## Status
**IMPLEMENTED FOR PRE-MAINNET INTERNAL DRILLS**

## Protected state
At minimum, preserve and verify:
- launch-state records under the persistent data directory;
- launch lock/recovery records where applicable;
- community aggregate metrics;
- public security/evidence manifests;
- canonical registry snapshots.

## Backup rules
- Production persistent state must not rely on a single live copy.
- Backup copies must be access-controlled and logically separated from the live service.
- Secret material is never copied into GitHub or public evidence.
- Every restore drill compares restored state against a cryptographic hash of the source snapshot.
- Corrupt Mainnet state must fail closed; restore must not silently authorize launch.

## Internal drill
The repository contains `scripts/run-operational-drills.mjs`, which performs a representative copy → delete → restore → SHA-256 comparison on launch/community state.

A passing CI artifact proves the internal recovery procedure is executable on representative protected state. It does **not** prove an external disaster-recovery provider, geographic redundancy or production backup service unless separately evidenced.
