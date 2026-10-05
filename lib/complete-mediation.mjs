import crypto from 'node:crypto';

export const COMPLETE_MEDIATION_VERSION = 'HS_COMPLETE_MEDIATION_V0_1';

const text = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function bindingOf({ profileId, effectId, subject, resource, payload }) {
  return digest(JSON.stringify(stable({
    version: COMPLETE_MEDIATION_VERSION,
    profileId,
    effectId,
    subject,
    resource,
    payload
  })));
}

export function validateMediationManifest({ profileId, effects, routes } = {}) {
  if (!text(profileId, 128) || !Array.isArray(effects) || effects.length === 0 || !Array.isArray(routes)) {
    throw new Error('INVALID_MEDIATION_MANIFEST');
  }
  const protectedIds = new Set();
  for (const effect of effects) {
    if (!effect || !text(effect.effectId, 128) || effect.protected !== true) throw new Error('INVALID_PROTECTED_EFFECT');
    if (protectedIds.has(effect.effectId)) throw new Error('DUPLICATE_PROTECTED_EFFECT');
    protectedIds.add(effect.effectId);
  }
  const seen = new Map();
  for (const route of routes) {
    if (!route || !text(route.routeId, 128) || !text(route.effectId, 128)) throw new Error('INVALID_EFFECT_ROUTE');
    if (!protectedIds.has(route.effectId)) throw new Error('UNKNOWN_PROTECTED_EFFECT');
    if (route.mediated !== true) throw new Error('UNMEDIATED_PROTECTED_ROUTE');
    if (!text(route.pepId, 128)) throw new Error('MISSING_PEP_BINDING');
    const key = route.effectId;
    const peps = seen.get(key) ?? new Set();
    peps.add(route.pepId);
    seen.set(key, peps);
  }
  for (const effectId of protectedIds) {
    if (!seen.has(effectId)) throw new Error('PROTECTED_EFFECT_WITHOUT_ROUTE');
  }
  return Object.freeze({
    version: COMPLETE_MEDIATION_VERSION,
    profileId,
    protectedEffects: [...protectedIds],
    routeCount: routes.length
  });
}

/**
 * Bounded policy-enforcement boundary. Protected handlers remain private to the
 * returned closure: callers receive only execute(). This does not prove that a
 * host has no separately-created external capability; deployment evidence must
 * establish that the declared profile contains every route to the effect.
 */
export function createProtectedEffectBoundary({
  profileId,
  effectId,
  pepId,
  handler,
  evaluateAuthority,
  commitAuthority,
  now = () => new Date()
} = {}) {
  if (![profileId, effectId, pepId].every(v => text(v, 128))) throw new Error('INVALID_BOUNDARY_ID');
  if (typeof handler !== 'function' || typeof evaluateAuthority !== 'function' || typeof commitAuthority !== 'function') {
    throw new Error('INVALID_BOUNDARY_CALLBACK');
  }

  const consumedBindings = new Set();

  return Object.freeze({
    version: COMPLETE_MEDIATION_VERSION,
    profileId,
    effectId,
    pepId,
    async execute({ subject, resource, payload, authority } = {}) {
      if (!text(subject, 256) || !text(resource, 512) || !authority) {
        return { verdict: 'DENY', reason: 'INVALID_EFFECT_REQUEST' };
      }
      const binding = bindingOf({ profileId, effectId, subject, resource, payload });
      if (authority.effectBinding !== binding) {
        return { verdict: 'DENY', reason: 'EXACT_EFFECT_AUTHORITY_MISMATCH' };
      }

      let first;
      try {
        first = await evaluateAuthority({ authority, subject, resource, payload, binding, at: now() });
      } catch {
        return { verdict: 'DENY', reason: 'AUTHORITY_STATE_UNAVAILABLE' };
      }
      if (!first || first.verdict !== 'ALLOW') {
        return { verdict: 'DENY', reason: first?.reason ?? 'AUTHORITY_DENIED' };
      }

      // Re-evaluate immediately at commit so stale ALLOW receipts are never executable.
      let commitDecision;
      try {
        commitDecision = await evaluateAuthority({ authority, subject, resource, payload, binding, at: now() });
      } catch {
        return { verdict: 'DENY', reason: 'AUTHORITY_STATE_UNAVAILABLE' };
      }
      if (!commitDecision || commitDecision.verdict !== 'ALLOW') {
        return { verdict: 'DENY', reason: commitDecision?.reason ?? 'AUTHORITY_DENIED_AT_COMMIT' };
      }
      if (consumedBindings.has(binding)) return { verdict: 'DENY', reason: 'EFFECT_BINDING_REPLAY' };

      let committed = false;
      try {
        committed = await commitAuthority({ authority, binding, decision: commitDecision });
      } catch {
        committed = false;
      }
      if (committed !== true) return { verdict: 'DENY', reason: 'AUTHORITY_COMMIT_REJECTED' };

      // Local replay fence is defense-in-depth; durable/distributed consumption
      // remains the responsibility of commitAuthority.
      consumedBindings.add(binding);
      const result = await handler({ subject, resource, payload, binding });
      return { verdict: 'COMMITTED', binding, result };
    }
  });
}

export function bindProtectedEffectAuthority({ profileId, effectId, subject, resource, payload, authority } = {}) {
  if (!authority || typeof authority !== 'object') throw new Error('AUTHORITY_REQUIRED');
  return Object.freeze({
    ...authority,
    effectBinding: bindingOf({ profileId, effectId, subject, resource, payload })
  });
}
