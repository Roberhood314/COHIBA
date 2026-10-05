# Human Signal / PoHA / SI reviewer entry point

Status: **PRE-AUDIT**. This is a community-authored review package, not an independent audit report. SI means Sovereignty Inference, a deterministic authority evaluator.

## Reproduce

Clone this repository, record `git rev-parse HEAD`, then with Node 24 and Git:

```sh
npm run human-signal:demo
npm ci --ignore-scripts
npm run verify:human-signal
```

The demo needs no install. The review suite includes the existing PGlite replay-adapter test and requires locked npm dependencies; installation uses the npm registry. Both verification commands run offline with no account, supplied private key, RPC or token transfer. Fresh Ed25519 keys exist only in memory. The phone assurance and principal trust are synthetic fixtures; the demo proves no real human identity. Outputs vary in signatures/digests; verdicts and the one-effect invariant are reproducible.

The demo connects the existing `lib/poha-v1.mjs` signed delegation/action verifier to `inferVerifiedPoha` in `lib/sovereignty-inference.mjs`, then rechecks current authority before a synthetic memory write. Missing proof, forged signature, resource/payload substitution, agent impersonation, expiry, replay, a fresh action after revocation and unavailable authority storage all deny without another effect. Inspection ALLOW creates no effect and consumes no nonce.

The replay/write boundary is a synchronous local example. It is not crash-safe or durable, and does not test the deployed PostgreSQL commit endpoint. Use the [existing full due-diligence reproduction](../technical-due-diligence/REPRODUCIBLE_VERIFICATION.md) for database, container, full-suite and operational evidence.

## Follow the evidence

[claims.json](claims.json) maps each scoped claim to executable test files. `Human Signal Core Review Evidence` runs the same command on each PR/main commit and uploads:

| Artifact | Purpose |
| --- | --- |
| `manifest.json` | Commit/tree, worktree cleanliness, environment, selected tests, counts, explicit scope and open gates |
| `source-files.json` | SHA-256 of tracked source files; local dirty source must not be attributed solely to the recorded commit |
| `tests.tap` / `tests.stderr.txt` | Raw test results, including failures and skips |
| `demo.json` | Observed ALLOW/DENY cases and effect count |

Artifacts live in `operations/evidence/human-signal-review/`. A pass requires all selected tests to pass with no skips, cancellations or TODOs. The PGlite test exercises local SQL replay persistence and rollback; it does not substitute for native PostgreSQL evidence. This focused run is never labeled the complete repository suite. A CI run must finish successfully before its result is cited. Obtain the actual run URL and commit from [Actions](https://github.com/Roberhood314/COHIBA/actions/workflows/human-signal-review.yml), and download its artifact; no successful run or audit is fabricated in this document.

Read the [protocol boundaries](PROTOCOL_SPEC.md), then the [existing architecture, guarantees, threat model and attack matrix](../technical-due-diligence/README.md). The independent verifier tests include 320 deterministic byte mutations across five signatures; this is finite test evidence, not a cryptographic security proof.

## External surfaces and open gates

MCP and BNB Agent reference paths are bounded interoperability tests. ERC-4337 has local-EVM evidence and a Sepolia harness; public-network execution still requires a successful credentialed workflow and transaction artifacts. None demonstrates third-party adoption or endorsement. Their own workflows and scope documents remain the evidence authority.

Independent audit, an operational issuer with managed keys/revocation, an independently operated external verifier/service and broader public adversarial evidence remain acceptance gates. This pack closes none of them by itself. Mainnet readiness, global identity uniqueness, quantum resistance, distributed consensus and arbitrary external-effect atomicity are not established.
