# Human Signal HS/2 — integration, evidence and future direction

Status: **experimental, pre-audit, opt-in**. HS/2 is not enabled automatically on existing COHIBA authorization routes. Public lab: <https://cohibameme.site/si-lab.html>. No token ownership is required to use the verifier.

## What is delivered

| Layer | Implemented | Explicit boundary |
|---|---|---|
| Authority policy | Independent HS/1 schema/signature/chain verifier; exact scope, resource, audience, payload; owner approval | PHONE_VERIFIED is an issuer assertion, not biological uniqueness or liveness |
| Effect enforcement | PostgreSQL local revocation, monotonic epoch floor, nonce consumption and exact SQL effect in one transaction; deferred COMMIT expiry check | Only SQL effects integrated through the gate; not global revocation or external-chain atomicity |
| HS/2 authentication | Mandatory Ed25519 **AND** SLH-DSA-SHA2-128f for issuer status, binding owner, binding agent, delegation, action and optional approval | Experimental protocol composition; pinned keys and trusted issuer enrollment are required |
| Public evidence | Local browser signature checks, historical full-chain vectors, Node reproduction and native PostgreSQL CI | Synthetic self-tests, not third-party adoption, independent implementation confirmation or security audit |

## Cryptographic format and trust bootstrap

`packages/hs2-verifier` is additive. It imports the sibling independent `authority-verifier` policy package, not COHIBA token logic, application databases or network clients. Its portable `wire.mjs` is shared with the browser Worker. Dependencies are pinned to `@noble/post-quantum` 0.7.1 and `@noble/curves` 2.4.0 in the package and root lockfile. A pinned library version is not a FIPS module validation or a protocol audit.

The envelope accepts exactly `{version,suite,bundle,attestations}`. Version is `HS/2-EXPERIMENT-1`; suite is `Ed25519+SLH-DSA-SHA2-128f-AND`. HS/1 payload schemas and classical signing bytes remain unchanged. Each PQ signature covers the UTF-8 bytes of:

```text
HS/2-EXPERIMENT-1\n
JSON.stringify([fixedSuite, signatureRole, keyId, edPublicKeyBase64,
                classicalSignatureBase64, classicalSigningBytesBase64])
```

The newline is one actual LF byte, not a literal backslash sequence. JSON array order is fixed; no client-selected algorithms or unsigned key references are accepted. This binds the same classical payload and its classical signature, the suite, role, key identifier and classical public key into the PQ proof. Both algorithm checks must succeed. Required roles are derived from the verified chain, never an attacker-supplied list. For Agent actions the owner and Agent signatures on binding are both covered. Optional approval must also have its own PQ proof if present. Unknown/extra/missing attestations deny. Human-only actions require action and issuer status, not unrelated Agent proofs.

The operator pins a registry entry for each PQ key: `{ed25519Key,slhDsaKey,notBefore,notAfter,revoked}`. Registry IDs and key lengths are checked; a PQ key cannot be reused across different classical identities. Key validity contributes to the lowest effective commit deadline. Classical issuer trust is still independently pinned by the service. The PQ registry cannot come from a request or downloaded customer fixture.

**Do not bootstrap a PQ trust root using only an Ed25519 signature once Ed25519 is considered compromised.** Existing identities need an operator-approved/out-of-band enrollment or an already trusted PQ root. The fixture's deterministic secrets and registry are PUBLIC test material and must never be enrolled in a real service. Automated secure enrollment and hardware-backed PQ signing are not delivered here.

## Integrating a real protected SQL action

```js
import {commitHybridAuthority} from './packages/hs2-verifier/index.mjs';
import {createPostgresCommitGate} from './packages/authority-verifier/postgres-adapter.mjs';

const gate = await createPostgresCommitGate(pool, {
  onCommit: async (transaction, verified) => {
    await transaction.query(
      'INSERT INTO protected_drafts(digest, resource, payload_hash) VALUES($1,$2,$3)',
      [verified.actionDigest, verified.resource, verified.payloadHash]
    );
  }
});
const result = await commitHybridAuthority(clientEnvelope, {
  trust: operatorPinnedIssuerRegistry,
  keyRegistry: operatorPinnedPQRegistry,
  expected: contextDerivedFromActualImmutableRequest,
  commit: gate.commit
});
// Confirmed SQL commit only when result.operationCommitted === true.
```

Derive audience, scope, resource, payload hash, challenge and approval policy from the actual service request. The actual data written must be the same immutable data hashed before verification, not a later mutable object or an Agent-provided policy. Authenticate revocation writers; use `gate.revoke` with issuer/principal and optional binding/delegation ID. After an acknowledged local revocation, subsequent commits serialize behind it and deny even if both signatures remain valid. A commit that wins the lock first may finish before revocation returns. PQ key compromise requires distributing registry policy and local authority revocations; changing a process-local registry does not instantly revoke previously admitted work across services.

**Complete mediation is essential:** an HS/2-protected effect must not remain reachable through a legacy HS/1-only or ungated route. This release leaves existing production endpoints unchanged. Use a distinct experimental endpoint/audience/resource namespace, and inventory all write paths before migration. Removing the PQ wrapper must never turn an HS/2-protected action into an accepted legacy request.

`commit` is a trusted integrating-service adapter, not supplied by the client. `onCommit` must use the supplied transaction client only. Do not execute HTTP, blockchain, filesystem or independent database side effects inside it. A lost connection at COMMIT can have an uncertain outcome; reconcile the durable effect by digest. An error/DENY is not proof that no effect happened. All replicas must share the database and revocation state. Back up replay, epoch, revocation, commit-deadline and business-effect tables consistently. Restore historical commit rows into an empty schema before enabling freshness triggers; expired rows must not be replayed as new effects.

## Optimization and operational limits

- Fixed **128f** parameter set prioritizes signing speed for the prototype. Each SLH-DSA signature is 17,088 bytes, plus a 64-byte Ed25519 signature. A six-proof Agent chain has 102,528 raw PQ signature bytes before Base64/JSON. No fabricated throughput claims are made.
- The public browser lab uses a bundled Worker, not an external CDN or a public CPU-intensive signing/verifying endpoint. Signing keys are not requested from visitors. Fixture generation runs at build time; it does not run for each page request.
- Services must enforce body limits before parsing (the HS/2 envelope cap is 192 KiB), rate limits, bounded queues and crypto-worker isolation for untrusted traffic. Measure p50/p95 verification/signing latency, memory, transport size and native database concurrency under representative load before production. Synchronous crypto in the Node prototype is not a high-throughput deployment architecture.
- Do not cache an ALLOW decision across a commit. Static public-key processing may be optimized only after measurement; live local revocation, expiry, scope and replay checks remain mandatory at the protected write.
- SHA2-128s and stronger standardized profiles are future benchmark candidates, not client-selectable fallbacks. Introducing any new suite requires signed version/domain changes, reviewed policy and downgrade tests; do not invent “10× larger” nonstandard keys.

## Reproduction

```sh
npm ci
node examples/hs2/verify.mjs
node --test test/hs2-verifier.test.mjs test/authority-commit-gate.test.mjs
# With an isolated native PostgreSQL test database:
TEST_DATABASE_URL=postgresql://... node --test test/hs2-verifier.test.mjs test/authority-commit-gate.test.mjs
```

The public JSON uses a fixed historical evaluation time. Inspecting at that time reproduces ALLOW classification with `executionAuthorized:false`; using the real current clock denies the expired fixture. Fixture `trust`, `expected`, `keyRegistry` and clock are never suitable for real authorization. For a standalone service copy both sibling verifier directories and install the HS/2 package's pinned dependencies. The production verifier itself requires no COHIBA source outside those directories, token account or network access. `signAttestation` is an offline signing helper, not an exposed API.

## Roadmap — evidence gates, not promises

| Gate | Deliverable | Must be demonstrated before advancing |
|---|---|---|
| A — current prototype | Full-chain dual signatures, strict suite, pinned keys, SQL adapter, public signature lab | Reproducible tests on current CI; no automatic production migration |
| B — independent cryptography | Reference vectors verified by a separate SLH-DSA implementation; independent review of format, composition and trust bootstrap | Signed review/evidence, differential tests, dependency assessment and remediation |
| C — controlled service pilot | Authenticated PQ enrollment/rotation, worker isolation, expiry/revocation distribution, HS/2-only protected namespace | Real external service verifies and commits without COHIBA backend; load and fault tests; no legacy bypass |
| D — broader integration | PQ-capable hardware/signing-provider support, secure-channel migration, multi-service revocation protocol | Tested key lifecycle, rollout/rollback safety, encrypted-channel design review and operational recovery |
| E — chain research | Chain-specific account/validator PQ enforcement and off-chain/on-chain boundary | End-to-end enforcement by the actual destination; signatures in HS/2 do not upgrade Solana/Ethereum wallets automatically |

Public-key encryption is separate from signatures. This release implements neither a PQ KEM nor PQ TLS, FHE, ZK or unlinkability. The supplied post's AI-accelerated lattice-break scenario is a threat hypothesis, not evidence that standardized ML-KEM/ML-DSA are broken. Hash-based signatures diversify mathematical assumptions for suitable authorization uses; they do not solve every cryptographic problem or guarantee immunity to future AI cryptanalysis.

## Primary references

- NIST FIPS 205 (SLH-DSA): <https://csrc.nist.gov/pubs/fips/205/final>
- NIST PQC program and migration: <https://csrc.nist.gov/projects/post-quantum-cryptography>
- ML-KEM, a distinct key-establishment primitive: <https://csrc.nist.gov/pubs/fips/203/final>
- Noble implementation and security notes: <https://github.com/paulmillr/noble-post-quantum>

Standards, implementation validation, protocol review, correct authorization enforcement and real adoption are separate evidence categories. This project currently remains **experimental and pre-audit**.
