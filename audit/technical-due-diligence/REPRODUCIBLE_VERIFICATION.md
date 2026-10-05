# Reproducible verification

## Clean checkout

Use a fixed commit, the repository's declared Node version (`>=24.15 <25`), and locked dependencies. CI currently also exercises Node 22; record the actual runtime rather than assuming the engine declaration was satisfied.

```sh
git clone https://github.com/Roberhood314/COHIBA.git
cd COHIBA
git checkout <reviewed-commit-sha>
npm ci
npm run verify:all
npm run verify:si-dd
```

Default evidence directory: `operations/evidence/si-due-diligence` (ignored). Override with `npm run verify:si-dd -- /absolute/evidence/path`. This does not modify production, register keys, send messages or perform external effects. Test fixtures use synthetic identities. PostgreSQL tests create test state: use a dedicated disposable database, never production credentials.

## Full native evidence

Provide a disposable PostgreSQL 18 database and Docker with the research guest image available. Variables hold test configuration, not production secrets.

```sh
docker pull node:22-bookworm-slim
export TEST_DATABASE_URL=postgresql://postgres@localhost:5432/human_signal_test
export TEST_AGENT_CONTAINER=1
export SI_REQUIRE_FULL_EVIDENCE=1
npm run verify:si-dd
```

Use `.github/workflows/ci.yml` for the native database/container setup. Without these capabilities, embedded SQL checks still execute where implemented, but native integration/container tests may skip. `SI_REQUIRE_FULL_EVIDENCE=1` makes skips, missing capabilities or failures fail verification; local partial evidence must not be labeled full. Model/benchmark output alone is never equivalent to implementation verification.

## Evidence contents and interpretation

| Artifact | Meaning |
| --- | --- |
| `manifest.json` | Commit/tree, tracked-worktree dirty flag, actual source digest, lock digest, runtime, capability flags, actual test totals and complete/partial verdict |
| `source-files.json` | SHA-256 of every tracked file except generated security/evidence outputs; actual checked-out content, including dirty changes |
| `tests.tap`, `tests.stderr.txt` | Entire Node test output, including skips and failures; inspect errors rather than only totals |
| `verify-security.log`, `verify-evolution.log`, `typecheck.log` | Repository posture, evolution and TypeScript checks, with exit codes in manifest |
| `model.json` | Reachable-state counts, finite invariants and expected architectural counterexamples |
| `benchmark.json` | Measured microbenchmarks and host metadata |

The source digest is SHA-256 of the JSON serialization of sorted `{path,sha256}` entries. It intentionally excludes generated evidence to avoid circular hashing. `git ls-files` covers tracked files only: stage new source before a local development run, or use a clean committed checkout. A dirty manifest cannot be attributed exclusively to its HEAD commit; use the content hashes. Evidence files are not cryptographically attested or independently signed. Preserve them with the exact CI run/source SHA, and rerun to verify.

CI uploads the directory even on failure. A successful CI run should show `completeSuiteEvidence:true` and zero skipped tests; review the existing full build/security/typecheck checks too. Generated timestamps and benchmark timings vary; source digests, finite model counts and successful safety assertions should reproduce for the same content/runtime assumptions.

## Reviewer procedure

1. Pin the source SHA and inspect architecture/scope before reading PASS counts.
2. Reproduce locked install, full suite, posture/evolution/typecheck and this verifier in a clean disposable environment.
3. Compare source/lock hashes and examine skipped/native/container capability fields.
4. Inspect concurrency, rollback, COMMIT-time expiry, exact-byte, revocation and restart test assertions in the attack matrix.
5. Validate negative witnesses and distinguish finite model invariants from implementation theorems.
6. Review privileged DB writers, archival restore exception, issuer trust, clock and operator assumptions.
7. Keep distributed consensus and arbitrary external-effect atomicity marked unimplemented until the acceptance gates in README are independently satisfied.
