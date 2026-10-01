# COHIBA Security Control Matrix v1.0

| Control | Threat | Implementation | Automated evidence | Status |
|---|---|---|---|---|
| Mainnet default deny | accidental/unauthorized launch | ALLOW_MAINNET gate | verify-security-posture | IMPLEMENTED |
| Separate launch secret | unauthorized launch | COHIBA_MAINNET_LAUNCH_KEY | verify-security-posture | IMPLEMENTED |
| Exact origin | cross-site launch | requireMainnetOrigin | verify-security-posture | IMPLEMENTED |
| Launch rate limit | brute force | enforceLaunchRateLimit | static security check | IMPLEMENTED |
| API rate limit | resource abuse | rateLimitApi | static security check | IMPLEMENTED |
| Request body cap | memory abuse | 4096-byte launch body limit | static security check | IMPLEMENTED |
| Persistent launch record | duplicate launch | /data launch record | Devnet/Mainnet evidence | IMPLEMENTED |
| Active launch lock | concurrent launch | activeLaunches set | source review | IMPLEMENTED |
| Exact supply invariant | inflation/error | BigInt supply checks | node:test + on-chain API | IMPLEMENTED |
| Destination balance invariant | wrong recipient/accounting | token-account checks | node:test + on-chain API | IMPLEMENTED |
| Immutable metadata | identity substitution | Metaplex isMutable:false | static check + chain | IMPLEMENTED |
| Revoke freeze authority | custody control | setAuthority null | chain verification | IMPLEMENTED |
| Revoke mint authority | future inflation | setAuthority null | chain verification | IMPLEMENTED |
| Corrupt Mainnet state fail closed | unsafe recovery | MAINNET_LAUNCH_RECORD_CORRUPT | static check | IMPLEMENTED |
| Security HTTP headers | browser/web attacks | CSP/HSTS/frame policy | production header test | IMPLEMENTED |
| Cryptographic build manifest | evidence tampering | SHA-256 evidence generator | security-evidence.json | IMPLEMENTED |
| Invariant mutation tests | logic regression | deterministic mutation corpus | node:test | IMPLEMENTED |
| CI verification gate | regression | GitHub Actions | workflow result | IMPLEMENTED |
| Independent audit | unknown vulnerabilities | external reviewer | published report | REQUIRED PRE-MAINNET |
| Dependency risk review | supply-chain | npm audit + review | CI/report | REQUIRED PRE-MAINNET |
| Restore drill | state loss | Railway volume recovery exercise | signed drill record | REQUIRED PRE-MAINNET |

Status words are deliberately specific. IMPLEMENTED does not mean independently audited.
