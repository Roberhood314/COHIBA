# Gemini Finding Verification / Remediation Log

This log accompanies `security/AI_ASSISTED_SECURITY_REVIEW.md`.

It is **not** an independent-audit remediation certificate. A commit is listed only when this verification branch adds evidence or a real remediation.

| Finding | Verification status | New remediation required? | Evidence / remediation commit |
| --- | --- | --- | --- |
| VULN-SI-01 | ALREADY_MITIGATED | No | Existing PostgreSQL nonce/action/approval uniqueness at reviewed SHA |
| VULN-SI-02 | ALREADY_MITIGATED / financial claim N/A | No | Existing PoHA scope/resource controls and ERC-4337 signed budgets |
| VULN-SI-03 | ALREADY_MITIGATED | No | Existing deterministic canonicalization |
| VULN-AD-01 | ALREADY_MITIGATED in implemented surfaces | No | Existing EIP-712 domain and BNB chain-bound proposal semantics |
| VULN-AD-02 | ALREADY_MITIGATED | No | Existing fixed selector/target/canonical effect tests |
| VULN-AD-03 | NOT_APPLICABLE | No | MVC adapter absent |
| VULN-SC-01 | ALREADY_MITIGATED; regression strengthened | Evidence only | `62e5e3c6779605f4e857243eae683508d813ade6` adds explicit high-s rejection regression |
| VULN-SC-02 | NOT_APPLICABLE | No | Claimed Anchor verifier absent |
| VULN-SC-03 | FALSE_POSITIVE | No | Claimed `consumedNonces` contract is not the actual ERC-4337 account |
| VULN-INF-01 | NOT_APPLICABLE to current protected SI effect | No | Current bounded effect is not a DEX/value-bearing trade |
| VULN-INF-02 | NEEDS_EVIDENCE | Not yet a code-only remediation | Dedicated/private RPC, redundancy and failover require deployment evidence |
| VULN-INF-03 | FALSE_POSITIVE | No | Existing CSP/HSTS/nosniff/frame/referrer/permissions headers |

## Verification commits

- `1f0e1727a8cd01bea5c1d4706fb27ca3315277ed` — source-mapped verification report.
- `62e5e3c6779605f4e857243eae683508d813ade6` — explicit secp256k1 high-s signature rejection regression.

## Closure rule

A future independent audit must identify the reviewer/entity, exact reviewed commit SHA, scope, methodology and exclusions; severity-rate actual findings; map material remediations to commits; retest those remediations; and state residual risk. This internal AI-assisted verification cannot close the independent-audit gate.
