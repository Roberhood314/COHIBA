# Sovereignty Inference Framework API v0.1

Status: **experimental / pre-audit / framework boundary draft**

This API is the first framework-neutral boundary for COHIBA Sovereignty Inference (SI). SI means **Sovereignty Inference**, not superintelligence.

## Goal

Allow an external agent framework to ask one narrow question before a protected tool or effect:

> Does the currently verified human authority cover this exact agent, action and effect proposal under trusted policy and current authority state?

The API is deliberately not an execution capability.

```text
External Agent Framework
        |
        | proposed protected action
        v
Trusted Framework Adapter
        |
        | trusted policy + current authority state
        v
Human Signal SI Framework API
        |
        +--> DENY
        |
        +--> ALLOW (decision only)
                  |
                  | commit-time revalidation still required
                  v
             HSSK / PEP
                  |
                  v
           Protected Effect
```

## Public boundary

`lib/si-framework-api.mjs` exports:

- `evaluateFrameworkAction(...)` — deterministic low-level evaluation.
- `createFrameworkAdapter(...)` — fail-closed adapter with a trusted policy catalog.
- `SI_FRAMEWORK_API_VERSION` — `HS_SI_FRAMEWORK_V0_1`.

A proposal binds:

- adapter identity;
- policy identity;
- agent subject;
- action;
- exact normalized effect set;
- resource;
- payload hash;
- authority epoch.

An ALLOW result contains `executionAuthorized: false` and `requiresCommitRevalidation: true`. It is evidence of a bounded SI decision, not permission to skip the real enforcement boundary.

## Security contract

The framework/model may propose an action. It MUST NOT supply the trusted policy, authority state, revocation state, budget consumption or epoch used for the decision.

The host adapter MUST:

1. load policy from operator-controlled configuration;
2. load authority state from trusted storage;
3. hash the exact payload that would be executed;
4. evaluate before the protected side effect;
5. revalidate authority at the actual commit boundary;
6. prevent alternate execution paths that bypass mediation;
7. consume nonce/budget atomically with the protected effect or use an effect-specific atomic/idempotent protocol.

The v0.1 API does not itself provide durable nonce consumption, distributed consensus, wallet signing, external-effect atomicity or framework-specific lifecycle interception.

## Reference integration pattern

A framework adapter should intercept immediately before a protected tool call:

```js
const decision = adapter.evaluate({
  envelope: trustedAuthorityEnvelope,
  proposal: {
    adapterId: 'my-framework',
    action: 'TOOL_WRITE',
    subject: agentId,
    resource: canonicalResource,
    payloadHash: sha256(exactToolArguments),
    effects: ['EXTERNAL_WRITE']
  }
});

if (decision.verdict !== 'ALLOW') {
  throw new Error('HUMAN_SIGNAL_DENY');
}

// Do not execute from this decision alone.
// Revalidate at the effect commit boundary, then execute through the PEP.
```

## Framework targets

This boundary is intentionally independent of LangChain, AutoGen, BNB Agent SDK, MCP and other runtimes. A concrete integration should translate the framework's pre-tool/action lifecycle into the proposal above without allowing model output to replace trusted policy.

The existing ERC-4337 reference integration remains a separate execution-specific adapter. This API does not weaken or replace its on-chain validation.

## Evidence in this change

`test/si-framework-api.test.mjs` covers:

- valid bounded authority/effect binding;
- effect mismatch;
- revocation;
- expiry;
- exhausted budget;
- subject substitution;
- authority epoch substitution;
- unknown action / policy replacement attempt;
- authority-state outage fail-closed behavior;
- payload tamper binding.

Run:

```bash
npm test
npm run verify:all
```

## Claims boundary

This release does **not** claim:

- production readiness;
- independent audit;
- generic control of arbitrary AI;
- complete mediation in third-party frameworks;
- external-effect atomicity;
- live adoption by any named framework or company.

A framework integration becomes meaningful only when the external execution path cannot bypass the Human Signal enforcement point.
