import crypto from 'node:crypto';
import { signingBytes, proofDigest } from './poha-v1.mjs';

// Stateless signature validation; revocation must be supplied by a trusted,
// fresh, authoritative snapshot. A stale or missing snapshot fails closed.
const prefix=Buffer.from('302a300506032b6570032100','hex');
function fail(reason){return {decision:'DENY',reason,executionAuthorized:false};}
function verify(kind,payload,key,signature){
  try {
    const k=Buffer.from(key,'base64'),s=Buffer.from(signature,'base64');
    if(k.length!==32||s.length!==64||k.toString('base64')!==key||s.toString('base64')!==signature)return false;
    return crypto.verify(null,signingBytes(kind,payload),crypto.createPublicKey({key:Buffer.concat([prefix,k]),format:'der',type:'spki'}),s);
  }catch{return false;}
}
function live(p,t){const a=Date.parse(p.issuedAt),b=Date.parse(p.expiresAt);return Number.isFinite(a)&&Number.isFinite(b)&&a<=t&&t<b&&a<b;}
export function verifyIndependentAuthorization({binding,delegation,action,approval,principalKey,audience,expected,revocation,now=new Date()}){
  try{
    const t=now.getTime();
    if(!Number.isFinite(t))return fail('INVALID_TIME');
    if(!revocation||revocation.trusted!==true||!Number.isSafeInteger(revocation.epoch)||!Number.isFinite(Date.parse(revocation.checkedAt))||Date.parse(revocation.checkedAt)>t||t-Date.parse(revocation.checkedAt)>1000)return fail('REVOCATION_NOT_FRESH');
    const b=binding?.payload,d=delegation?.payload,a=action?.payload;
    if(!b||!d||!a||!expected)return fail('MISSING_PROOF');
    if([b,d,a].some(p=>!live(p,t)||p.audience!==audience||p.principalKey && p.principalKey!==principalKey))return fail('CONTEXT_OR_TIME_INVALID');
    if(!verify('AGENT_BINDING',b,principalKey,binding.principalSignature)||!verify('AGENT_BINDING',b,b.agentKey,binding.agentSignature))return fail('BINDING_SIGNATURE_INVALID');
    const bindingId='AGENT-'+proofDigest('AGENT_BINDING',b);
    if(d.bindingId!==bindingId||d.agentKey!==b.agentKey||Date.parse(d.expiresAt)>Date.parse(b.expiresAt)||!verify('DELEGATION',d,principalKey,delegation.signature))return fail('DELEGATION_INVALID');
    const delegationId='DELEGATION-'+proofDigest('DELEGATION',d);
    if(a.performer!=='AGENT'||a.delegationId!==delegationId||a.signerKey!==d.agentKey||a.principalId!==d.principalId||!verify('ACTION',a,d.agentKey,action.signature))return fail('ACTION_INVALID');
    if(a.action!==expected.action||a.resource!==expected.resource||a.payloadHash!==expected.payloadHash||!d.scopes.includes(a.action)||d.resource!==a.resource)return fail('SCOPE_OR_EFFECT_MISMATCH');
    if(revocation.epoch!==expected.epoch||revocation.revokedIds?.includes(bindingId)||revocation.revokedIds?.includes(delegationId))return fail('REVOKED_OR_EPOCH_CHANGED');
    if(d.approvalRequired||expected.requireApproval){
      if(!approval||approval.payload.actionDigest!==proofDigest('ACTION',a)||approval.payload.principalKey!==principalKey||approval.payload.audience!==audience||!live(approval.payload,t)||!verify('APPROVAL',approval.payload,principalKey,approval.signature))return fail('APPROVAL_INVALID');
    }
    return {decision:'ALLOW',reason:'ELIGIBLE_FOR_COMMIT_GATE',executionAuthorized:false,delegationId,actionDigest:proofDigest('ACTION',a)};
  }catch{return fail('PROOF_INVALID');}
}

// This callback MUST run under the same transaction/lock as effect persistence.
// The host must ensure revocation cannot commit between the check and effect.
export async function commitWithAuthorityGate(input,{atomicCommit}={}){
  if(typeof atomicCommit!=='function')return fail('ATOMIC_COMMIT_REQUIRED');
  return atomicCommit(async ({revocation,consumeNonce,applyEffect})=>{
    if(typeof consumeNonce!=='function'||typeof applyEffect!=='function')return fail('INVALID_COMMIT_ADAPTER');
    const decision=verifyIndependentAuthorization({...input,revocation});
    if(decision.decision!=='ALLOW')return decision;
    const nonce=input.action?.payload?.nonce;
    if(!nonce||!await consumeNonce(nonce))return fail('REPLAY');
    await applyEffect(input.expected);
    return {...decision,executionAuthorized:true,reason:'COMMITTED'};
  });
}
