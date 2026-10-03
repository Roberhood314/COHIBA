import crypto from "node:crypto";

export const AGENCY_SCOPES = Object.freeze(["READ_PUBLIC_SIGNALS", "DRAFT_CONTRIBUTION", "DRAFT_APP_ACTION"]);
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function owner(profileId) {
  if (!/^(?:HUMAN|COH)-[A-F0-9]{12}$/.test(profileId)) throw new Error("INVALID_AGENCY_OWNER");
}

export function registerAgent(store, profileId, input, now = new Date()) {
  owner(profileId);
  const name = String(input.name || "").trim();
  if (name.length < 3 || name.length > 80) throw new Error("INVALID_AGENT_NAME");
  const agents = store.agents || [];
  if (agents.filter(a => a.ownerProfileId === profileId).length >= 20) throw new Error("AGENT_LIMIT_REACHED");
  const agent = { id: "AGENT-" + crypto.randomUUID(), ownerProfileId: profileId, name, createdAt: now.toISOString() };
  store.agents = [...agents, agent];
  return agent;
}

export function grantDelegation(store, profileId, input, now = new Date()) {
  owner(profileId);
  const agent = (store.agents || []).find(a => a.id === input.agentId);
  if (!agent || agent.ownerProfileId !== profileId) throw new Error("AGENT_NOT_FOUND");
  if (!Array.isArray(input.scopes) || !input.scopes.length || input.scopes.some(s => !AGENCY_SCOPES.includes(s))) throw new Error("INVALID_DELEGATION_SCOPE");
  const expires = typeof input.expiresAt === "string" ? Date.parse(input.expiresAt) : NaN;
  if (!Number.isFinite(expires) || expires <= now.getTime() || expires > now.getTime() + MAX_DURATION_MS) throw new Error("INVALID_DELEGATION_EXPIRY");
  const delegations = store.delegations || [];
  if (delegations.filter(d => d.ownerProfileId === profileId).length >= 500 || delegations.filter(d => d.ownerProfileId === profileId && delegationStatus(d, now) === "ACTIVE").length >= 50) throw new Error("DELEGATION_LIMIT_REACHED");
  const delegation = { id: "DELEGATION-" + crypto.randomUUID(), ownerProfileId: profileId, agentId: agent.id, scopes: [...new Set(input.scopes)].sort(), createdAt: now.toISOString(), expiresAt: new Date(expires).toISOString(), revokedAt: null };
  store.delegations = [...delegations, delegation];
  return delegation;
}

export function revokeDelegation(store, profileId, id, now = new Date()) {
  owner(profileId);
  const delegation = (store.delegations || []).find(d => d.id === id && d.ownerProfileId === profileId);
  if (!delegation) throw new Error("DELEGATION_NOT_FOUND");
  const changed = !delegation.revokedAt;
  if (changed) delegation.revokedAt = now.toISOString();
  return { delegation, changed };
}

export function delegationStatus(delegation, now = new Date()) {
  if (delegation.revokedAt) return "REVOKED";
  if (!Number.isFinite(Date.parse(delegation.expiresAt)) || Date.parse(delegation.expiresAt) <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

// Metadata registry only: this does not authenticate an agent or execute an action.
export function agencyForOwner(store, profileId, now = new Date()) {
  return {
    agents: (store.agents || []).filter(a => a.ownerProfileId === profileId),
    delegations: (store.delegations || []).filter(d => d.ownerProfileId === profileId).map(d => ({ ...d, status: delegationStatus(d, now) })),
    allowedScopes: AGENCY_SCOPES,
    executionEnabled: false,
    proofClass: "AUTHENTICATED_HUMAN_SESSION_OFFCHAIN_V1"
  };
}
