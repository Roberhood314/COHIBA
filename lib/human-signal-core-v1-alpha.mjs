import crypto from "node:crypto";
import { hashObject } from "./human-signal-core.mjs";
import { inferSovereignty, SI_VERSION } from "./sovereignty-inference.mjs";
import { validateAuthorityState } from "./sovereign-continuity.mjs";
import { QUORUM_VERSION, verifySovereignQuorum } from "./sovereign-quorum.mjs";

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

export function createAuthorityEnvelope({rootId,subject,actions,effects,budget=1,expiresAt,nonce=crypto.randomUUID(),epoch=0}){
  if(!rootId || !subject) throw new Error("INVALID_AUTHORITY_ROOT");
  const allowedActions=[...new Set(actions||[])].sort();
  if(!allowedActions.length || allowedActions.some(a=>!Object.hasOwn(PROTECTED_ACTIONS,a))) throw new Error("INVALID_AUTHORITY_ACTION");
  const allowedEffects=[...new Set(effects||[])].sort();
  if(!Number.isSafeInteger(budget) || budget<1) throw new Error("INVALID_AUTHORITY_BUDGET");
  if(!Number.isFinite(Date.parse(expiresAt))) throw new Error("INVALID_AUTHORITY_EXPIRY");
  if(!Number.isSafeInteger(epoch)||epoch<0||typeof nonce!=="string"||!nonce.length||nonce.length>256)throw new Error("INVALID_AUTHORITY_EPOCH_OR_NONCE");
  return {version:HS_CORE_ALPHA_VERSION,epoch,rootId:String(rootId),subject:String(subject),actions:allowedActions,effects:allowedEffects,
    budget:Number(budget),expiresAt:new Date(expiresAt).toISOString(),nonce:String(nonce)};
}

export function authorityId(envelope){
  return "AUTH-"+hashObject(envelope).slice(0,24).toUpperCase();
}

export function verifyProtectedAction(input){
  return inferSovereignty({...input,contract:Object.hasOwn(PROTECTED_ACTIONS,input.action)?PROTECTED_ACTIONS[input.action]:null});
}

export function commitProtectedAction(store,{envelope,action,subject,receiptData={},now=new Date()}){
  if(store.storageRecovered)return {verdict:"DENY",reason:"RECOVERY_FENCED"};
  store.hsAuthorityState ||= {spent:{},revoked:[],usedNonces:[],receipts:[],epoch:0};
  const s=store.hsAuthorityState;
  try{validateAuthorityState(s);}catch{return {verdict:"DENY",reason:"AUTHORITY_STATE_INVALID"};}
  if(!envelope)return {verdict:"DENY",reason:"INVALID_AUTHORITY"};
  const authId=authorityId(envelope);
  const verdict=verifyProtectedAction({envelope,action,subject,now,
    spent:s.spent[authId]||0,epoch:s.epoch??0,revoked:s.revoked.includes(envelope.rootId)});
  if(verdict.verdict!=="ALLOW") return verdict;
  if(s.usedNonces.includes(envelope.nonce)) return {verdict:"DENY",reason:"REPLAY"};
  let receipt;
  try{receipt={version:HS_CORE_ALPHA_VERSION,sovereigntyVersion:SI_VERSION,decisionDigest:verdict.decisionDigest,epoch:s.epoch??0,authorityId:authId,rootId:envelope.rootId,subject,action,
    effects:verdict.contract.effects,projectStateBefore:projectStateProjection(store).projectRoot,
    dataHash:hashObject(receiptData),createdAt:now.toISOString()};
  receipt.receiptHash=hashObject(receipt);
  }catch{return {verdict:"DENY",reason:"INVALID_COMMIT_DATA"};}
  s.usedNonces.push(envelope.nonce);
  s.spent[authId]=(s.spent[authId]||0)+1;
  s.receipts.push(receipt);
  return {verdict:"ALLOW",receipt};
}

export function directHumanEnvelope(profileId,action,{budget=1,ttlMs=5*60*1000,nonce=crypto.randomUUID(),epoch=0}={}){
  const contract=Object.hasOwn(PROTECTED_ACTIONS,action)?PROTECTED_ACTIONS[action]:null;
  if(!contract) throw new Error("UNKNOWN_ACTION");
  if(!/^(?:HUMAN|COH)-[A-F0-9]{12}$/.test(String(profileId||""))) throw new Error("INVALID_HUMAN_ROOT");
  return createAuthorityEnvelope({
    rootId:String(profileId),subject:String(profileId),actions:[action],effects:contract.effects,
    budget,expiresAt:new Date(Date.now()+ttlMs).toISOString(),nonce,epoch
  });
}

// Opt-in research gate; committee and head come from the operator, never Agent input.
export function commitQuorumProtectedAction(store,input,{committee,network,policyHash,sequence,statement,votes}){
  const now=input.now||new Date();
  if(!input.envelope)return {verdict:"DENY",reason:"INVALID_AUTHORITY"};
  const state=store.hsAuthorityState||{spent:{},revoked:[],usedNonces:[],receipts:[],epoch:0};
  try{validateAuthorityState(state);}catch{return {verdict:"DENY",reason:"AUTHORITY_STATE_INVALID"};}
  const decision=verifyProtectedAction({...input,now,spent:state.spent[authorityId(input.envelope)]||0,revoked:state.revoked.includes(input.envelope?.rootId),epoch:state.epoch??0,storageRecovered:Boolean(store.storageRecovered)});
  if(decision.verdict!=="ALLOW")return decision;
  const expected={version:QUORUM_VERSION,kind:"AUTHORITY_DECISION",network,epoch:state.epoch??0,sequence,stateRoot:hashObject(state),policyHash,intentHash:hashObject({decisionDigest:decision.decisionDigest,dataHash:hashObject(input.receiptData||{})}),issuedAt:statement?.issuedAt,expiresAt:statement?.expiresAt};
  const quorum=verifySovereignQuorum(votes,{committee,expected,now});
  if(!quorum.accepted)return {verdict:"DENY",reason:quorum.reason};
  const result=commitProtectedAction(store,{...input,now});
  return {...result,quorum};
}

export function guardDirectHumanMutation(store,{profileId,action,receiptData={},nonce}){
  const envelope=directHumanEnvelope(profileId,action,{nonce,epoch:store.hsAuthorityState?.epoch??0});
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
    sovereigntyVersion:SI_VERSION,
    epoch:state.epoch??0,
    recoveryFenced:Boolean(store.storageRecovered),
    atomicExternalEffects:false
  };
}

export function revokeAuthorityRoot(store,rootId){
  store.hsAuthorityState ||= {spent:{},revoked:[],usedNonces:[],receipts:[]};
  if(!store.hsAuthorityState.revoked.includes(rootId)) store.hsAuthorityState.revoked.push(rootId);
  return {rootId,revoked:true};
}
