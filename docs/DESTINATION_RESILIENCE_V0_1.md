# Destination enforcement and resilience v0.1

Status: experimental, pre-audit reference. No live customer, independent operator,
blockchain settlement or universal distributed-consensus claim.

## Delivered boundary

`packages/authority-verifier/destination-store.mjs` verifies portable signed HS/1
authority locally against a host-pinned issuer registry. The host fixes audience,
resource, action and approval policy. Signed action nonces and exact bytes are
committed with one private draft and durable receipt in a destination-owned
PostgreSQL transaction. The existing commit gate serializes revocation and
admission on a principal row, with a deferred database-time expiry check at COMMIT.

Multiple source apps can use separate databases; all protected effects must reach
this same destination ordering store. Two independent replay ledgers alone can
both admit the same authority. The regression suite includes that negative control
before demonstrating a single effect at the shared HTTP destination with 24
concurrent calls. This is coordination through one durable store, not Byzantine
consensus or global replay protection across disconnected destinations.

## Response loss and retries

A COMMIT acknowledgement can be lost after the database has committed. A retry
looks up the durable receipt, checking signatures, exact context, deadline,
epoch floor and local revocation again under the principal lock. The response
always has `executionAuthorized:false`: it reports a completed destination effect
and never permits a caller to run another one. Receiver recreation preserves the
receipt. Expired or revoked authority cannot recover permission through retries.

Failure to connect to the destination denies execution. No offline authority cache
is used. A write error rolls back effect, receipt and nonce together. If receipt
lookup fails after a successful COMMIT, the response is conservative and the client
must reconcile; a denial response is not proof that nothing previously committed.

## Revocation semantics

Revocation must be authenticated by the integrating host and committed at the
common destination. It survives restart. Revocation that commits before admission
prevents the effect; an effect already ordered before revocation is not undone.
Issuer snapshots remain bounded-freshness statements. Revocation at a remote
issuer does not magically reach a partitioned destination instantly. To require
issuer-wide immediate revocation, the issuer and destination need shared admission
ordering or a specified online protocol; unavailable coordination must deny.

## HTTP receiver

`examples/destination-service/server.mjs` accepts bounded POST `/drafts` requests
with `{bundle,payloadBase64,challenge}`. It does not accept caller-supplied policy
or expose administrative revocation. Deploy behind TLS and host authentication,
rate limits and network controls. The example is not automatically deployed or
advertised as a production integration. The signing/status issuer must validate
human authority independently; receiving a bundle is not proof of a unique human.

## External effect limits

The durable draft is the effect. Calling a second HTTP API or sending a blockchain
transaction after receiving the receipt introduces a new transactional boundary.
Each such destination needs its own durable idempotency/admission protocol and
fault evidence. A generic HTTP idempotency header is insufficient unless the
recipient actually guarantees its semantics. Chain adapters must separately
handle nonce ownership, replacement, confirmation, reorgs and finality. No generic
SQL-to-chain atomicity is claimed.

## Verification and independent review

Run `node --test test/destination-resilience.test.mjs`, optionally with
`TEST_DATABASE_URL` pointing only to an isolated test database. Tests create
synthetic records and must never run against a live customer database.

Evidence covers independent-source negative control, concurrent shared admission,
lost COMMIT acknowledgement, receiver recreation, durable revocation, payload
substitution, partition denial and write rollback. Failure injection is bounded;
it is not a power-loss, multi-region recovery or indefinite network-partition proof.
The dedicated CI workflow uploads a source-bound test transcript and benchmark.
CI is maintainer-produced evidence. An independent review must identify the
reviewer, exact commit, environment, findings and retest results before the external
review log is updated.
