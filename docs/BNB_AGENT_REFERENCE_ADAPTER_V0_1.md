# Human Signal × BNB Agent SDK Reference Adapter v0.1

Status: **experimental / pre-audit / synthetic integration evidence**

This is a community-built compatibility adapter. It is **not** an official BNB Chain integration, endorsement or partnership.

## Why this integration exists

BNB Agent SDK exposes agent-oriented primitives including ERC-8004 identity and ERC-8183 job/commerce flows. Human Signal addresses a different question:

> Which human authority permits this identified agent to create this exact protected effect, right now?

The intended composition is:

```text
ERC-8004 Agent Identity
        |
        v
Human Signal Authority Envelope
        |
        v
Sovereignty Inference
        |
        v
Exact Effect Binding
        |
        v
Commit-time PEP / revalidation
        |
        v
BNB Agent SDK protected action
```

Identity is not authority. Authority is not effect permission.

## v0.1 supported surface

The reference adapter intentionally limits itself to bounded, non-payment actions:

- `ERC8004_SET_METADATA`
- `ERC8004_SET_AGENT_URI`
- `ERC8183_SUBMIT_DELIVERABLE`

Payment/funding/settlement actions are deliberately excluded from this reference version.

ERC-8004 registration is also excluded from v0.1 because the on-chain `agentId` is created by registration. This adapter's authority subject is an already-known `erc8004:<chainId>:<agentId>`; pretending that identifier exists before registration would be an invalid binding model.

## Exact-effect authority

The BNB adapter extends the alpha authority envelope with:

- `resource`
- `payloadHash`

The adapter requires both to match the proposal exactly before the generic SI framework boundary is called.

For example:

```text
Authority:
  subject     = erc8004:97:42
  action      = ERC8004_SET_AGENT_URI
  resource    = bnb-agent://97/registry/agent/42
  payloadHash = H(exact canonical SDK arguments)

Proposal:
  subject     = erc8004:97:42
  action      = ERC8004_SET_AGENT_URI
  resource    = bnb-agent://97/registry/agent/42
  payloadHash = H(exact canonical SDK arguments)
```

Any post-authorization mutation of the SDK arguments changes `payloadHash` and is denied as `EXACT_EFFECT_AUTHORITY_MISMATCH`.

## Security properties exercised

`test/si-bnb-agent-adapter.test.mjs` checks:

1. valid ERC-8004 metadata authority is allowed as a decision only;
2. post-authorization SDK argument mutation is denied;
3. ERC-8004 agent substitution is denied;
4. ERC-8183 job substitution is denied;
5. revoked authority is denied;
6. authority-state outage fails closed;
7. unsupported funding action is absent from the v0.1 policy catalog.

An ALLOW result still contains `executionAuthorized: false` and requires commit-time revalidation. The adapter never holds a private key, signs a transaction or broadcasts to BNB Chain.

## What this proves

If CI passes, this change provides repository evidence that the existing SI Framework API can be specialized for a real external agent SDK's identity/job semantics while preserving fail-closed authority checks and exact-effect binding in the adapter.

## What this does not prove

It does not prove:

- official BNB Chain adoption or review;
- live BSC Testnet/Mainnet execution;
- complete mediation inside BNBAgent SDK;
- wallet/signer isolation;
- external-effect atomicity;
- independent security audit;
- production readiness.

A later live testnet integration must place Human Signal immediately before the protected SDK write and must ensure there is no alternate path around the enforcement point.

## Evidence command

The adapter is included by the root Node test glob:

```bash
npm test
npm run verify:all
```

No BNB private key, funded wallet or live financial transaction is required by this reference adapter.
