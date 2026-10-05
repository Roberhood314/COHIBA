import {hashObject} from './human-signal-core.mjs';

export const SI_VERSION='HS_SI_V1_ALPHA';
const deny=reason=>({version:SI_VERSION,verdict:'DENY',reason,executionAuthorized:false});
const text=x=>typeof x==='string'&&x.length>0&&x.length<=256;

// Deterministic authority evaluation. No model output can manufacture authority.
export function inferSovereignty({envelope,action,subject,contract,now=new Date(),spent=0,revoked=false,epoch=0,storageRecovered=false}){
 if(storageRecovered)return deny('RECOVERY_FENCED');
 if(!contract)return deny('UNKNOWN_ACTION');
 if(revoked)return deny('REVOKED');
 if(!envelope||envelope.version!=="1.0-alpha"||!text(envelope.rootId)||!text(envelope.subject)||!text(envelope.nonce)||!Array.isArray(envelope.actions)||!Array.isArray(envelope.effects)||envelope.actions.some(x=>!text(x))||envelope.effects.some(x=>!text(x))||!Number.isSafeInteger(envelope.budget)||envelope.budget<1||!Number.isSafeInteger(spent)||spent<0||!Number.isSafeInteger(epoch)||epoch<0)return deny('INVALID_AUTHORITY');
 if((envelope.epoch??0)!==epoch)return deny('AUTHORITY_EPOCH');
 if(envelope.subject!==subject)return deny('SUBJECT');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!Number.isFinite(Date.parse(envelope.expiresAt)))return deny('INVALID_AUTHORITY_EXPIRY');
 if(Date.parse(envelope.expiresAt)<=now.getTime())return deny('EXPIRED');
 if(!envelope.actions.includes(action))return deny('SCOPE');
 if(!contract.effects.every(e=>envelope.effects.includes(e)))return deny('EFFECT_ESCAPE');
 if(spent>=envelope.budget)return deny('BUDGET');
 const binding={version:SI_VERSION,authorityHash:hashObject(envelope),action,subject,effects:contract.effects,epoch};
 return {version:SI_VERSION,verdict:'ALLOW',executionAuthorized:false,contract,decisionDigest:hashObject(binding),authorityClass:'SESSION_ENVELOPE',epoch};
}

// Takes only the trusted in-process verifier result, never a client decision.
export function inferVerifiedPoha(inspection,{proof,expected,credentialEpoch,now=new Date()}){
 if(inspection?.decision!=='ALLOW'||inspection.signatureValid!==true||inspection.authorityValid!==true)return deny('POHA_NOT_VERIFIED');
 const p=proof?.payload;
 if(!p||p.audience!==expected.audience||p.action!==expected.action||p.resource!==expected.resource||p.payloadHash!==expected.payloadHash||!Number.isSafeInteger(credentialEpoch)||credentialEpoch<1||!(now instanceof Date)||!Number.isFinite(now.getTime())||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=now.getTime())return deny('POHA_CONTEXT_INVALID');
 const binding={version:SI_VERSION,actionDigest:inspection.actionDigest,principalId:p.principalId,audience:p.audience,action:p.action,resource:p.resource,payloadHash:p.payloadHash,credentialEpoch,policyVersion:inspection.policyVersion};
 return {version:SI_VERSION,verdict:'ALLOW',executionAuthorized:false,decisionDigest:hashObject(binding),authorityClass:'ED25519_POHA',credentialEpoch};
}

export function sovereigntyStatus(){return {version:SI_VERSION,status:'EXPERIMENTAL_PRE_AUDIT',meaning:'Sovereignty Inference',deterministic:true,createsAuthority:false,distributedNetworkLive:false,byzantineConsensus:false,externalEffectAtomicity:false};}
