# Handling independent review

## Response targets

These are maintainer response targets, not guaranteed SLAs:

- Acknowledge a report within **2 business days**.
- Give an initial reproduction/severity decision within **7 business days** of receiving sufficient technical evidence through a suitable channel.
- For an open confirmed finding, give a progress update at least **weekly**; explain delays and a revised estimate.

Acknowledge the minimal sensitive intake without requesting exploit details publicly. Establish a private channel first. GitHub Private Vulnerability Reporting or a dedicated inbox must be confirmed active before advertising it; neither is assumed active by this kit. Missing private intake is a readiness gap, not permission to publish an exploit.

## Finding lifecycle

SUBMITTED → TRIAGED → CONFIRMED → FIXED → RETESTED. Record DUPLICATE, NOT_REPRODUCIBLE or OUT_OF_SCOPE with an explanation and evidence, rather than deleting an uncomfortable finding. A merge alone is not RETESTED. Record reporter retests and maintainer retests separately. Critical/high findings block promotion of the affected boundary until resolved or explicitly recorded as unresolved release blockers.

No sensitive reproduction, keys, identities or infrastructure details belong in public logs. Coordinate safe disclosure after remediation. The existing [evidence log](../EVIDENCE_LOG.md) receives only real, attributable evidence; CI runs are not external audit entries.

## Recognition and independence

Offer optional name/handle/link credit and a technical write-up, with explicit reporter consent. Anonymous reports are welcome. Recognition is not conditional on a positive conclusion. Preserve negative findings and limitations. Do not call someone an auditor, partner or endorser without their agreement.

No funded cash/token bounty is currently promised. Any paid engagement needs separately agreed scope, budget and terms. Disclose compensation in a published review record. One scoped review is not a whole-project audit.
