# Independent destination resilience review

The receiver and tests are maintainer-produced experimental evidence. Reviewers
must check out the exact commit they intend to assess and use an isolated database.
Do not run synthetic fault tests against a production or customer database.

1. Record `git rev-parse HEAD`, Node version and PostgreSQL version.
2. Install with `npm ci --ignore-scripts --no-audit --no-fund`.
3. Set `TEST_DATABASE_URL` to an isolated PostgreSQL database.
4. Run `node --test test/destination-resilience.test.mjs` and retain the transcript.
5. Run `node scripts/benchmark-destination.mjs` and retain the JSON. Source hashes
   identify the actual files; an uncommitted change is not evidence for the SHA.
6. Inspect every alternate route to the protected effect, receipt visibility,
   trusted issuer policy and the operator revocation API. Attempt concurrent replay,
   response loss, expiry, receiver recreation and database partition failures.
7. Identify the reviewer and relationship to the project. Report exact scope,
   backend, source hashes, failures, limitations and reproducible commands through
   the repository's open-review issue process. Redact credentials and private data.

Reviewer questions:

- Can a source app bypass the common destination or change audience/resource/bytes?
- Can an old authority snapshot pass after destination revocation commits?
- Does a receipt ever create fresh permission to execute another effect?
- Do failure replies distinguish conservative reconciliation from guaranteed no-effect?
- Can simultaneous native pool clients write the effect more than once?
- What remains untested: real process termination, physical power loss, multi-region
  recovery, indefinite partition, issuer-to-destination revocation and chain finality?

An uploaded CI artifact is not an external review. Only an attributable external
report and its defined commit/scope can be added to the external evidence log.
