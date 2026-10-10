# COHIBA SI paid engineering pilot

Offer version: 2026-10-10. Status: proposed introductory service prices; no paid customers, revenue, independent audit or delivery capacity is asserted by this document.

## Offer

Sell scoped integration engineering for **one human-authorized agent action**, initially a staging draft/database write. The product is the delivered patch and acceptance evidence. SI remains experimental and pre-audit. Open-source code availability and the service fee are separate; no token purchase is required.

| Service | Proposed price | Deliverable |
| --- | --- | --- |
| Scope review | VND 2,900,000 | One workflow's authority map, feasibility/gaps and written acceptance criteria; no production deployment |
| Integration pilot | From VND 9,900,000 | One agent, one protected staging operation, agreed adapter/gate patch, tests, source-bound evidence, rollback guide and handover |
| Optional maintenance | From VND 1,900,000/month | Up to two scheduled support hours, one agreed integration change review and affected acceptance-case rerun; no emergency/24-hour SLA |

These are an introductory quote basis, not market-validated prices or an automatic subscription. Hosting, third-party fees and applicable invoicing/tax treatment must be stated in the written quote. No recurring fee starts automatically. A scope review is a standalone deliverable, with no obligation to buy a pilot. Schedule is agreed after technical fit and capacity review; no fixed turnaround is promised by the page.

## Eligibility and acceptance

Before quoting, identify the principal, agent, audience, action, resource prefix, exact payload, expiry, revocation operation, backing store and **every** route to the protected effect. Confirm the customer can integrate the gate at the actual destination and run synthetic staging tests. Authorization-only inspection is not permission to execute a second external effect.

The agreed integration must demonstrate:

1. A valid, exact authorized action commits once and yields a durable receipt.
2. Wrong audience, resource, action or payload fails without effect.
3. Expired authority fails at the relevant commit boundary.
4. Revocation before commit prevents the protected write; document the concurrency/linearization model and trusted components.
5. Replay cannot create a second effect; receipt retries are explicitly distinguished from new execution authority.
6. Effect failure rolls back the agreed local effect and nonce where the transaction model supports it.
7. Unavailable authority storage fails closed, and the rollback procedure preserves nonce/revocation history.

Deliver redacted test commands/results, the exact commit and dependency versions, configuration inventory without secret values, known limitations, operating/disable instructions and a signed-off acceptance report. Native PostgreSQL concurrency must be tested when claiming PostgreSQL race behavior; a serialized embedded database alone is insufficient.

## Limits

The existing reference effect is the [signed local draft commit](../docs/SI_PRODUCTION_DRAFT_COMMIT.md). A pilot does not certify the whole application, distributed SI, arbitrary external-effect atomicity, blockchain wallets, financial transfers or quantum/AI-proof protection. Every bypass route matters. Payments, external service actions and chain settlement need separate destination-specific enforcement and evidence. No partnership, Pi app approval or live Open Standard integration is implied.

Independent security audit and production capacity evidence remain separate gates. Do not call this service an independent audit of COHIBA itself. Production launch requires the customer's review and explicit rollout decision after pilot acceptance.

## Intake and commercial process

Entry point: `/si-pilot.html`. The browser prepares a brief locally; it does not capture leads in a backend or send messages. The visitor reviews and submits a public GitHub issue. A matching issue form is available under the repository's New issue menu. Public fields should contain only public project information. Private requirements and customer contact details must move to a confirmed private channel.

Maintainer flow: triage fit → arrange private scoping → approve a written quote/SOW → confirm payment terms → staging delivery → customer acceptance → separately agree rollout/support. No charge, auto-enrollment or bank/crypto transfer is triggered by the page. Verify payments against an actual bank/provider record, never screenshots or a customer's statement. Do not publish the owner's personal bank details or place them in repository source.

Before accepting an order, agree parties, exact deliverables, dependencies/access, schedule, acceptance procedure, fee/taxes, payment milestones, change requests, cancellation/refund terms, IP/license and data handling. Do not invoice or take deposits on behalf of an unidentified business or for unconfirmed delivery capacity.

## Revenue evidence

Track public inquiries separately from private quotes, accepted SOWs, actual payments and accepted deliveries. No simulated record counts as a customer or sale. Net result = received service fees − attributable labor, infrastructure, third-party costs, refunds and applicable taxes. A signed quote or a successful deployment is not profit.
