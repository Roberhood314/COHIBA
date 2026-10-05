import crypto from "node:crypto";
import { hashObject } from "./human-signal-core.mjs";

export const HS_CORE_ALPHA_VERSION = "1.0-alpha";

export const PROTECTED_ACTIONS = Object.freeze({
  PROFILE_WRITE: { effects:["IDENTITY_WRITE"], risk:"MEDIUM" },
  TRUST_WRITE: { effects:["TRUST_GRAPH_WRITE"], risk:"MEDIUM" },
  CONTRIBUTION_VERIFY: { effects:["REPUTATION_WRITE"], risk:"MEDIUM" },
  APP_REGISTER: { effects:["APP_REGISTRY_WRITE"], risk:"MEDIUM" },
  MINING_START: { effects:["MINING_STATE_WRITE"], risk:"MEDIUM" },
  MINING_CLAIM: { effects:["PENDING_COH_WRITE"], risk:"HIGH" },
  AGENT_GRANT: { effects:["AUTHORITY_WRITE"], risk:"HIGH" },
  AGENT_REVOKE: { effects:["AUTHORITY_REVOKE"], risk:"HIGH" },
  MAINNET_REVIEW: { effects:["ELIGIBILITY_WRITE"], risk:"HIGH" },
  STATE_ANCHOR: { effects:["EXTERNAL_CHAIN_WRITE"], risk:"HIGH" },
  MAINNET_LAUNCH: { effects:["IRREVERSIBLE_TOKEN_ISSUANCE"], risk:"CRITICAL" }
});

export function projectStateProjection(store={}) {
  const domains = {
    profiles: store.profiles || [],
    contributions: store.contributions || [],
    apps: store.apps || [],
    appUtility: store.appUtility || [],
    events: store.events || [],
    agents: store.agents || [],
    delegations: store.delegations || [],
    pohaAgents: store.pohaAgents || [],
    pohaDelegations: store.pohaDelegations || [],
    principals: store.principals || [],
    authorizationHistory: store.authorizationHistory || [],
    miningSessions: store.miningSessions || [],
    resourceJobs: store.resourceJobs || [],
    stateAnchors: store.stateAnchors || [],
    launch: store.launch || null
  };
  return {
    version: HS_CORE_ALPHA_VERSION,
    domainHashes: Object.fromEntries(Object.entries(domains).map(([k,v])=>[k,hashObject(v)])),
    projectRoot: hashObject(domains)
  };
}

export function createAuthorityEnvelope({rootId,subject,actions,effects,budget=1,expiresAt,nonce=crypto.randomUUID()}){
  if(!rootId || !subject) throw new Error("INVALID_AUTHORITY_ROOT");
  const allowedActions=[...new Set(actions||[])].sort();
  if(!allowedActions.length || allowedActions.some(a=>!PROTECTED_ACTIONS[a])) throw new Error("INVALID_AUTHORITY_ACTION");
  const allowedEffects=[...new Set(effects||[])].sort();
  if(!Number.isFinite(Number(budget)) || Number(budget)<1) throw new Error("INVALID_AUTHORITY_BUDGET");
  if(!Number.isFinite(Date.parse(expiresAt))) throw new Error("INVALID_AUTHORITY_EXPIRY");
  return {version:HS_CORE_ALPHA_VERSION,rootId:String(rootId),subject:String(subject),actions:allowedActions,effects:allowedEffects,
    budget:Number(budget),expiresAt:new Date(expiresAt).toISOString(),nonce:String(nonce)};
}

export function authorityId(envelope){
  return "AUTH-"+hashObject(envelope).slice(0,24).toUpperCase();
}

export function verifyProtectedAction({envelope,action,subject,now=new Date(),spent=0,revoked=false}){
  const contract=PROTECTED_ACTIONS[action];
  if(!contract) return {verdict:"DENY",reason:"UNKNOWN_ACTION"};
  if(revoked) return {verdict:"DENY",reason:"REVOKED"};
  if(!envelope || envelope.subject!==subject) return {verdict:"DENY",reason:"SUBJECT"};
  if(Date.parse(envelope.expiresAt)<=now.getTime()) return {verdict:"DENY",reason:"EXPIRED"};
  if(!envelope.actions.includes(action)) return {verdict:"DENY",reason:"SCOPE"};
  if(!contract.effects.every(e=>envelope.effects.includes(e))) return {verdict:"DENY",reason:"EFFECT_ESCAPE"};
  if(Number(spent)+1>Number(envelope.budget)) return {verdict:"DENY",reason:"BUDGET"};
  return {verdict:"ALLOW",contract};
}

export function commitProtectedAction(store,{envelope,action,subject,receiptData={},now=new Date()}){
  store.hsAuthorityState ||= {spent:{},revoked:[],usedNonces:[],receipts:[]};
  const s=store.hsAuthorityState;
  const authId=authorityId(envelope);
  const verdict=verifyProtectedAction({envelope,action,subject,now,
    spent:s.spent[authId]||0,revoked:s.revoked.includes(envelope.rootId)});
  if(verdict.verdict!=="ALLOW") return verdict;
  if(s.usedNonces.includes(envelope.nonce)) return {verdict:"DENY",reason:"REPLAY"};
  s.usedNonces.push(envelope.nonce);
  s.spent[authId]=(s.spent[authId]||0)+1;
  const receipt={version:HS_CORE_ALPHA_VERSION,authorityId:authId,rootId:envelope.rootId,subject,action,
    effects:verdict.contract.effects,projectStateBefore:projectStateProjection(store).projectRoot,
    dataHash:hashObject(receiptData),createdAt:now.toISOString()};
  receipt.receiptHash=hashObject(receipt);
  s.receipts.push(receipt);
  return {verdict:"ALLOW",receipt};
}

export function directHumanEnvelope(profileId,action,{budget=1,ttlMs=5*60*1000,nonce=crypto.randomUUID()}={}){
  const contract=PROTECTED_ACTIONS[action];
  if(!contract) throw new Error("UNKNOWN_ACTION");
  if(!/^(?:HUMAN|COH)-[A-F0-9]{12}$/.test(String(profileId||""))) throw new Error("INVALID_HUMAN_ROOT");
  return createAuthorityEnvelope({
    rootId:String(profileId),subject:String(profileId),actions:[action],effects:contract.effects,
    budget,expiresAt:new Date(Date.now()+ttlMs).toISOString(),nonce
  });
}

export function guardDirectHumanMutation(store,{profileId,action,receiptData={},nonce}){
  const envelope=directHumanEnvelope(profileId,action,{nonce});
  return commitProtectedAction(store,{envelope,action,subject:profileId,receiptData});
}

export function enforcementStatus(store={}){
  const state=store.hsAuthorityState||{};
  return {
    version:HS_CORE_ALPHA_VERSION,
    protectedActions:Object.keys(PROTECTED_ACTIONS),
    receipts:(state.receipts||[]).length,
    revokedRoots:(state.revoked||[]).length,
    mode:"DIRECT_HUMAN_SESSION_GATE_ALPHA",
    atomicExternalEffects:false
  };
}

export function revokeAuthorityRoot(store,rootId){
  store.hsAuthorityState ||= {spent:{},revoked:[],usedNonces:[],receipts:[]};
  if(!store.hsAuthorityState.revoked.includes(rootId)) store.hsAuthorityState.revoked.push(rootId);
  return {rootId,revoked:true};
}
