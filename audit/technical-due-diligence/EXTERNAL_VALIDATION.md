# Independent audit, external integration and real adoption

These are distinct evidence gates. Repository tests, a first-party demonstration and generated benchmarks cannot substitute for third-party review or actual use.

| Gate | Acceptance evidence | Current pack contribution | Not yet established |
| --- | --- | --- | --- |
| Independent audit | Identified independent reviewer; pinned source SHA and scope; signed/published findings; severity and remediation/retest record | Architecture, assumptions, six scoped properties, attack matrix and reproducible evidence | Completed independent audit or certification |
| External integration | Another operator owns keys, service policy, replay storage and effect adapter; runs verifier without core source; tests revoke/replay/tamper/crash; records deployment/configuration and results without secrets | Standalone verifier and repository external-service examples; source tests | Independently operated production integration merely from first-party examples |
| Real adoption | Real consenting users and independently identifiable use cases; successful authorized effects, repeat use, retention, denial/error/support evidence over a declared observation period | Integration and safety criteria for a pilot | Active users, retention or partner adoption inferred from tests, website traffic, token holders or synthetic accounts |

## Audit handoff

Give the reviewer this pack, exact source/evidence hashes, test commands and disposable environment setup. Agree on exclusions, TCB and threat assumptions before review. Include privileged backup restore, database writers, online/cached revocation differences and unsupported external atomicity in the scope. Resolve findings at pinned commits and have the reviewer retest. Link a completed report only after the reviewer actually issues it.

## External pilot

The partner should pin issuer trust explicitly, keep service private keys outside this repository, choose a fixed low-impact effect, and own the intent-to-effect binding. Use its own durable replay store; two independent stores do not create global uniqueness. Decide whether an issuer status can be cached and what happens during outages. For remote destinations, require durable operation IDs/deduplication and crash recovery; an outbox alone is not an exactly-once destination guarantee.

## Adoption measurement

Agree on an observation window and what counts as a human/organization, active participant and successfully authorized effect. Separate first-party staff, synthetic fixtures, retries and denied attempts from real activity. Publish aggregate measurements with collection definitions and privacy-preserving consent; do not expose phone hashes, principals, signatures or private drafts. Track returning participants and operational friction as well as the number of initial integrations. There is no invented universal user-count threshold in this pack.

No audit invitation, partner contact or user outreach is sent by these scripts. Completing this document does not complete these three gates.
