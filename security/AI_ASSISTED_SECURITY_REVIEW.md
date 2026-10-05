# AI-Assisted Security Review Verification — Gemini Findings

**Status:** Evidence-backed verification draft / pre-audit  
**Reviewed repository:** `Roberhood314/COHIBA`  
**Reviewed commit:** `e0eb5b372b2a540ee9f2853eeea05e0d8807b8b1`  
**Review date:** 2026-10-05  
**Origin:** Twelve security findings proposed by a Gemini AI agent at the maintainer's request.

## Assurance boundary

This document is **not an independent security audit**, audit certificate, production-readiness approval, or Mainnet authorization. It verifies whether the twelve proposed findings map to the actual COHIBA source tree at the reviewed commit.

A proposed finding is classified as one of:

- `CONFIRMED`: reproducible against the reviewed implementation.
- `ALREADY_MITIGATED`: the described weakness is blocked by existing code/tests.
- `NOT_APPLICABLE`: the claimed attack surface is not implemented in the reviewed scope.
- `FALSE_POSITIVE`: the report asserts a weakness contradicted by the reviewed implementation.
- `NEEDS_EVIDENCE`: a meaningful concern exists, but the claimed remediation or production property cannot be established from repository code alone.

No finding is marked fixed merely because a remediation was suggested in the AI-generated report.

## Verification matrix

| ID | Proposed finding | Verdict | Repository evidence / reasoning |
| --- | --- | --- | --- |
| VULN-SI-01 | Stateless nonce replay | **ALREADY_MITIGATED** | Production PoHA persists service nonces, action nonces and approval nonces in PostgreSQL with uniqueness constraints. Replay paths fail with `SERVICE_REQUEST_REPLAY`, `ACTION_REPLAY` or `APPROVAL_REPLAY`. No Redis/Bloom remediation exists or is required by the reviewed design. |
| VULN-SI-02 | Malleable scope / unbounded dynamic budget | **ALREADY_MITIGATED / NOT APPLICABLE TO FINANCIAL SPEND** | PoHA scopes use a fixed allowlist and exact resource binding. The ERC-4337 reference signs `maxCalls` and `gasBudget`, rejects widened grants, and cumulatively reserves gas. The reviewed SI path does not expose an unrestricted financial withdrawal budget. |
| VULN-SI-03 | Non-deterministic JSON canonicalization | **ALREADY_MITIGATED** | `lib/poha-v1.mjs` canonicalizes signed payloads by recursively sorting object keys. The BNB adapter likewise stable-sorts SDK arguments before hashing. The claimed Fast Stable Stringify remediation is not the implementation used. |
| VULN-AD-01 | Cross-chain replay from missing chain isolation | **ALREADY_MITIGATED IN IMPLEMENTED CHAIN SURFACES** | ERC-4337 EIP-712 signatures are domain-bound to chain/account and tests reject wrong-chain signatures. The BNB adapter includes `chainId` in the ERC-8004 subject, resource and payload hash. There is no generic multi-chain `sessionEnvelope` execution path matching the report's description. |
| VULN-AD-02 | Wildcard EVM calldata / unlimited approval | **ALREADY_MITIGATED** | `HumanSignalAccount.sol` pins target and `IDraftSink.commit.selector`, canonicalizes calldata, forbids arbitrary target/value/batch/delegatecall behavior, and the interoperability test explicitly rejects selector `0x095ea7b3` (ERC-20 approve). |
| VULN-AD-03 | MVC UTXO input reordering | **NOT APPLICABLE** | No MVC UTXO adapter corresponding to this finding exists in the reviewed COHIBA implementation. |
| VULN-SC-01 | Custom `ecrecover` malleability / zero-address recovery | **ALREADY MITIGATED BY CURRENT IMPLEMENTATION** | The ERC-4337 account uses OpenZeppelin `ECDSA.tryRecover`, checks `RecoverError.NoError`, exact signer equality and non-zero signer. The report's claimed custom `ecrecover` implementation is not the reviewed contract. A dedicated high-s regression remains useful defense-in-depth evidence. |
| VULN-SC-02 | Solana Anchor PDA constraint bypass | **NOT APPLICABLE** | The reviewed Human Signal/SI codebase does not contain the claimed Anchor verifier/program with PDA `seeds`/`bump` validation surface. Solana usage elsewhere in COHIBA must not be represented as this nonexistent verifier. |
| VULN-SC-03 | Per-nonce on-chain storage bloat | **FALSE POSITIVE FOR THE DESCRIBED CONTRACT** | The actual ERC-4337 account does not use the report's `mapping(bytes32 => bool) consumedNonces`. Canonical UserOperation nonce handling is provided by EntryPoint; the account additionally tracks bounded delegation state, revocation, admission and gas reservations for its reference profile. |
| VULN-INF-01 | AI-agent MEV / sandwich exposure | **NOT APPLICABLE TO THE CURRENT PROTECTED SI EFFECT** | The bounded ERC-4337 effect is a fixed zero-value synthetic `DraftSink.commit`, not a DEX swap. No Jito/Flashbots production router matching the report is present. Future value-bearing trading/payment adapters would require a separate MEV threat model. |
| VULN-INF-02 | Public RPC rate limiting / transaction drop | **NEEDS DEPLOYMENT EVIDENCE** | COHIBA supports `SOLANA_RPC_URL` but also contains public RPC fallbacks and a hard-coded Devnet RPC in a funding check. Repository code cannot prove a dedicated private RPC cluster is deployed. This is an operational resilience gate, not a completed remediation. |
| VULN-INF-03 | Missing strict CSP | **FALSE POSITIVE** | `web-server.mjs` already emits CSP plus HSTS, `nosniff`, frame denial, referrer and permissions policies. CSP includes `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and `form-action 'self'`. |

## Result

At the reviewed commit:

- **0 / 12** findings are accepted as newly confirmed vulnerabilities solely from the Gemini report.
- Several hypotheses identify useful security themes, but the report frequently describes attack surfaces or remediations that do not match the repository.
- `VULN-INF-02` remains a legitimate **deployment-evidence / operational-resilience question**.
- `VULN-SC-01` is mitigated by the current OpenZeppelin implementation, but a dedicated malleability regression is recommended as additional evidence.
- MVC, Solana Anchor verifier, Jito routing, Flashbots routing, Redis/Bloom nonce remediation and the report's `SovereigntyVerifier.sol` must not be presented as audited COHIBA components at this commit.

## Public-claim rule

Safe:

> An AI-assisted adversarial review proposed twelve hypotheses. COHIBA mapped them to the reviewed source commit and published the applicability/evidence matrix for independent verification.

Not safe:

> COHIBA passed an independent full security audit, fixed twelve confirmed vulnerabilities, or is production/Mainnet ready.

## Next evidence gates

1. Add a targeted ECDSA high-s / malformed-signature regression to the ERC-4337 reference.
2. Treat RPC resilience as a deployment gate and record the actual provider/redundancy/failover evidence without publishing credentials.
3. Continue complete-mediation, distributed authority/revocation and crash/partition testing.
4. Complete bounded Sepolia public-testnet evidence separately.
5. Submit a frozen commit SHA and evidence package to an identifiable independent reviewer. Independent review remains the gate for an audit claim.
