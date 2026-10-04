# Private agency and minimum-disclosure inference — research proposal

Date: 2026-10-04. Status: PROPOSED / NOT IMPLEMENTED. This extends the agreed Human Signal architecture; no production schema, v1 signing format, trust score, financial policy or launch flag is changed.

## Product claim to investigate

A Human authorizes a local Agent to consult a remote model for a defined task, disclosing a constrained projection of data. A service verifies the authority without automatically obtaining the Human's global identity or the underlying private records.

This is a proposed addition to Proof of Human Agency, not a claim that PoHA v1 is anonymous. v1's stable principalId, Human/Agent public keys and delegation identifiers are correlatable. Tor or anonymous billing does not remove those application identifiers. Pairwise identifiers reduce cross-service correlation but still permit correlation within that service; per-request unlinkability needs audited anonymous credentials or equivalent cryptography, not just rotating keys.

## Sources inspected

- https://vitalik.eth.link/general/2026/04/02/secure_llms.html — local orchestration and minimizing queries to stronger remote models; exploratory security setup.
- https://github.com/ethereum/zkapi — unlinking API usage from funding deposits; experimental protocol. The README identifies single-party setup and notes the inference provider receives prompts. This is not prompt confidentiality.
- https://spec.torproject.org/path-spec/stream-isolation.html — applications must supply isolation information; circuit isolation is not a general unlinkability guarantee.
- https://support.torproject.org/about-tor/security/attacks-on-onion-routing/ — traffic correlation, timing and reuse limitations.
- https://www.w3.org/TR/vc-data-model/ — data minimization, selective disclosure and correlation risks even with unlinkable proofs.
- https://github.com/OpenAnonymity/oa-sdk — external dependency under active development; compatibility/security cannot be assumed.

The specific new experiment text supplied by the user has not been authenticated against its original post. The exact model name `Qwen 3.8 Flash Next`, TPS and 10–100x latency figures are user-supplied observations, not verified Human Signal benchmarks. Keep model selection pluggable and benchmark the user's actual device.

## Architecture fit

Human Proof establishes bounded assurance; Human Identity holds credentials locally where practical. Agent Identity and Delegation govern permitted actions. Add a disclosure-policy module to the local Agent/gateway; the existing Policy Engine decides authority. A later private credential verifier presents only necessary assurance and scoped authority. Reputation remains independent of COH balances.

Data custody:

| Boundary | Permitted data | Must not cross by default |
|---|---|---|
| Local vault | Raw sensitive records, exact itinerary, owner keys | Raw vault is not synchronized into Human Signal |
| Local orchestrator | Task-relevant local view | No unrestricted outbound tools or shell |
| Local egress gateway | Approved request bytes, destination/model, local consent | No uncontrolled additional headers/history/attachments |
| Remote provider | Explicitly approved reduced query | Global principal ID, owner wallet, Human bearer session, raw medical/travel records |
| Human Signal verifier | Minimum authority/assurance claims and replay controls | Medical prompt or raw personal data |
| State anchoring | Aggregate opaque batch commitment | Individual medical content, deterministic low-entropy content hashes or public request timeline |

Remote providers can still infer identity from rare conditions, combinations of attributes or repeated context. Local rewriting may reduce stylometric signal but cannot promise anonymization.

## Disclosure-policy draft

Separate policy from the v1 delegation schema. A future version needs a new signature domain and explicit version; do not append unsigned fields to an existing grant.

Candidate policy fields: purpose; allowedDataCategories; permitted transformations/projection; exact permitted destination and model; sensitiveDataApproval requirement; maxBytes; request/token budget; expiry; revocation handle; request commitment; user-reviewed policy digest. Provider retention requirements are contractual/provider properties, not enforceable merely by a Human signature.

Example with synthetic data only: a fitness-planning Agent may disclose an age range, coarse activity category and approved dietary constraints. Exact date of birth, phone, wallet, GPS itinerary, full medical history and personal writing remain local. Exact sensitive facts are released only with explicit review of the complete outbound bytes where policy permits it. Generalization must not invent or distort facts needed for safe recommendations.

A skill guides task decomposition and proposes a minimized request. The enforcing gateway independently validates a typed allowlisted schema, strips unsupported attachments/history, binds endpoint/model/parameters and actual bytes to consent, applies quotas, checks live authority and refuses unauthorized egress. LLM filters and regex scanners supply risk signals; neither proves semantic absence of PII. Anything unclassified defaults to deny or Human approval.

Output from a remote model is untrusted data. Prompt injection cannot modify permissions, access local files, invoke a hidden network path or authorize another Agent. Tool output cannot elevate scope. Keep network execution outside the model's arbitrary shell access.

## Three privacy layers plus the authority layer

1. Content minimization: structured local projection + explicit disclosure permission.
2. Billing separation: optional zkAPI adapter, independently reviewed. It is a separate economic connector, not a Human credential and not a reason to require COH.
3. Network separation: optional Tor adapter with application-supplied per-request isolation, remote DNS routing, no reusable account cookies and no direct fallback. Validate transport; do not claim protection against global traffic correlation.
4. Human authority: PoHA verifies that this request was within Human-granted permissions. Future privacy mode avoids exposing stable identifiers to the model provider; normal v1 mode remains explicitly linkable.

Gateways/proxies are additional observers. An operator may link issuance and redemption through timing. Anonymous credentials need a precise issuer/verifier/network threat model, independent cryptographic review and revocation design that avoids a stable cross-service identifier. Short-lived credentials alone do not prove revocation freshness. One-use nullifiers must prevent replay without becoming a universal tracking ID.

## Minimal pilot, before any new production permission

A standalone local demo with synthetic records; no real medical advice pipeline, no payment/deposit and no live external disclosure by default.

- Mock remote model captures request bytes and headers for inspection.
- Compile an approved structured query from a local synthetic vault.
- Enforce projection, destination, byte/request budget, expiry and revocation.
- Require fresh Human approval for any proposed additional sensitive field.
- Reject prompt-injection output, unauthorized attachment/history, redirect, network bypass and replay.
- Show local original versus exact outbound request to the Human.
- Report authority using the existing four actor classes; do not equate authorization with privacy safety.

Only after this works: sandbox provider adapter; optional Tor; separately validated anonymous billing. Anonymous PoHA proof is a later audited protocol milestone, not a property retrofitted into v1 by removing principalId.

## Evaluation

Measure separately: direct-identifier leakage; quasi-identifier and repeated-context linkability; unapproved-field bypass; authority/replay/revocation failures; transport/DNS fallback; remote utility under minimization; p50/p95 time-to-first-token and total latency; cost and local resource use. Avoid claiming TPS improvement from PoHA, which does not accelerate inference.

Compare full synthetic context, deterministic coarse projection, and model-proposed projection with enforced consent. Include rare-combination counterexamples and adversarial prompt injection. Report privacy/utility tradeoffs; no single score proves anonymity. Health-output quality needs separate appropriate evaluation; authorization signatures do not establish medical correctness.

Private logs default to content-free counters; retained evidence should be local/encrypted. Even hashes of sensitive low-entropy inputs can be dictionary attacked. Use reviewed hiding commitments for future proofs; never put raw prompts or public per-request identifiers on Solana. Batching reduces timeline leakage but does not eliminate it.

## Acceptance and non-goals

MVP succeeds when an unauthorized extra field cannot cross the actual gateway boundary, expiry/revocation/replay are enforced, and the Human can review the exact outbound request. It does not establish complete anonymity, unique biological humanity, a medical safety guarantee or production-ready zero knowledge.

Human Signal's resulting utility: verifiable control over an Agent's actions AND disclosures, while revealing only the identity/authority information necessary to each verifier. This is a research direction that fits Human Trust & Agency Layer; it is not a replacement for the current deployment/recovery/audit work.
