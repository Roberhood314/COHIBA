# Reference adapter security boundary

This source has not received independent audit. It demonstrates a bounded Ethereum authority profile, not a production financial account.

## Trusted components

Configured owner EOA and its signing UI; the exact immutable EntryPoint implementation; Solidity/compiler/dependency integrity; the chosen immutable DraftSink behavior; Ethereum execution/ordering/timestamp rules. A signature proves key control, not personhood, freedom from coercion or correct UI presentation. A compromised owner can issue harmful grants. A compromised agent is bounded by the owner's signed grant, including conservative gas reservations, but can intentionally waste that allowed budget.

The account checks its own authority state at validation and again at execution. Caller must be the pinned EntryPoint for these methods. Neither simulation results nor client-supplied ALLOW are accepted as fresh authority. An owner-signed revocation that executes before a delegated effect takes precedence; a revocation ordered after a committed effect cannot undo it. Revocation is chain-local. Off-chain PoHA revocation does not automatically revoke an Ethereum grant.

## Safety claims and finite evidence

| Claim | Preconditions / limitation |
| --- | --- |
| Owner authority → agent delegation | EIP-712 signature from configured owner; exact chain/account/EntryPoint scope; secp256k1 EOA profile only |
| Non-amplifying delegation | Signed scope, target, resource, lifetime, call ceiling and gas budget cannot be modified by agent; no re-delegation API |
| Contained effect | Canonical operation bytes; fixed zero-value DraftSink selector; rederived resource; payload at most 6000 bytes; target code hash pinned |
| Execution-time mediation | Current revoke/epoch/expiry/call budget and admitted operation hash checked immediately before effect |
| Business-effect rollback | A reverting CALL rolls back draft/call count; EntryPoint nonce, gas and maximum-cost reservation are not rolled back by a failed execution |
| Replay prevention | Canonical EntryPoint nonce and exact hash admission, under correct EntryPoint and chain state assumptions |

Validation reserves the maximum cost `(verificationGasLimit + callGasLimit + preVerificationGas) * maxFeePerGas`, with no paymaster. This upper bound is conservative and is not released after successful or failed execution. It bounds gas spending through the delegated profile rather than tracking actual fee refunds. The owner administrative channel is separately owner-signed and is not subject to an agent grant's gas budget.

Local tests verify concrete signatures and signed transactions on EthereumJS with official packaged EntryPoint bytecode, not a mocked validator. Their attack variants and same-bundle schedules are finite. No unbounded refinement proof, complete bundler opcode/storage tracing or independent audit is supplied. Validation uses account-owned storage and returned time ranges; these design choices alone do not establish ERC-7562 mempool acceptance.

## Explicit exclusions

No factory, counterfactual deployment, paymaster, signature aggregation, ERC-1271 owner, ERC-7579 module installation, EIP-7702 profile, upgradeability, fund withdrawal/recovery, generic wallet calls, ETH/token spending by agent, cross-chain uniqueness, public bundler service, public Ethereum deployment, real-user adoption or live AI-agent evaluation is covered. No private identity information should be placed in the public draft sink.

Failure reporting must inspect the `UserOperationEvent.success` flag. An outer `handleOps` transaction can succeed while a delegated effect fails. Public deployment must additionally handle confirmation depth, reorgs, receipts and destination semantics. A local EVM receipt is not evidence of public-network finality or adoption.

## Dependency posture

Dependencies are isolated from production web dependencies in this nested package. `npm ci --ignore-scripts` installs the lock; CI runs dependency audit and Solidity/EVM tests. The `tmp` override pins 0.2.7, the patched version for [GHSA-7c78-jf6q-g5cm](https://github.com/advisories/GHSA-7c78-jf6q-g5cm). Dependency audit is a separate advisory check, not an audit of these contracts.
