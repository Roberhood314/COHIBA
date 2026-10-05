# Human Signal Complete-Mediation Evidence v0.1

Status: **bounded complete-mediation evidence / experimental / pre-audit**

## Invariant

For every protected effect declared by a tested deployment profile:

```
Commit(effect) => HumanSignalPEP(effect) && ValidAuthorityAtCommit(effect)
```

This milestone introduces a small framework-neutral policy-enforcement boundary plus adversarial tests for the deployment-profile property that every declared route to a protected effect is mediated.

## Evidence

The suite verifies:

1. an alternate route explicitly marked unmediated makes the profile invalid;
2. a protected effect with no mediated route makes the profile invalid;
3. an exact bound authority can commit one synthetic protected effect;
4. payload mutation, resource substitution and subject substitution fail before the handler;
5. revocation between initial evaluation and commit-time revalidation fails closed;
6. authority-state outage at commit-time revalidation fails closed;
7. replay cannot produce a second effect;
8. stale authority epoch fails before effect;
9. a profile is accepted only when all declared protected routes are mediated.

The protected handler is held inside the boundary closure and is not exposed by the returned interface.

## Claims boundary

This evidence is intentionally **bounded**. It does not prove that every real deployment has discovered every external route to an effect. A host that separately exposes a database credential, wallet signer, shell, direct SDK handler or other capability can still bypass Human Signal.

Therefore the deployment obligation remains:

```
forall e in ProtectedEffects(profile):
  every route capable of Commit(e) must appear in the mediation manifest
```

The verifier can reject a declared unmediated route; it cannot discover undeclared infrastructure by magic.

This milestone does not establish Byzantine consensus, distributed authority consumption, crash-safe external-effect atomicity, independent audit or production readiness. Those remain separate evidence gates.
