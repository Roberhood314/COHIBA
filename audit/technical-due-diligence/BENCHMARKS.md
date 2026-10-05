# Reproducible benchmarks

`npm run si:benchmark` measures three in-process paths: valid session-envelope decision, revoked denial, and Ed25519 pinned 3-of-4 quorum certificate validation. The harness generates synthetic keys once, uses fixed valid intent/time, warms each path 200 iterations and collects 2,000 measured samples. Every result is asserted; p50/p95/p99 microseconds, elapsed time, aggregate iterations/second and CPU/Node/platform metadata are emitted as JSON.

The measurements include harness assertions, timer calls and JavaScript runtime effects. They exclude key generation, HTTP, authentication, SQL locks/durability, network coordination, native container startup, independent operators and external destinations. Denial early-exit and valid signature validation are intentionally separate cases. Quorum timing is **certificate validation latency**, not consensus latency. No production TPS, latency SLO or capacity conclusion follows.

The unified verifier saves actual results as `benchmark.json` in its evidence directory; no machine-independent performance numbers are hard-coded. Run it on the target host with quiet load and compare repeated runs using the same Node version and source digest. CI artifacts provide observed runner measurements, not deployment capacity certification.

## Required production campaign before capacity claims

Use an isolated native PostgreSQL environment with production-like durability and storage. Measure signed commit end-to-end at increasing concurrency, p50/p95/p99, lock wait, successful unique effects, exact retries, denied requests, CPU and disk. Inject write failures and revoke during contention; count business effects in the database, not just HTTP successes. For external sinks, measure destination deduplication and crash recovery separately. Do not run a load campaign against real user data from this harness.
