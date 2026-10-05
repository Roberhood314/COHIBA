import {hashObject} from './human-signal-core.mjs';
import {QUORUM_VERSION,verifySovereignQuorum} from './sovereign-quorum.mjs';

export const CONTINUITY_VERSION='HS_CONTINUITY_V1_ALPHA';
const fields=['spent','revoked','usedNonces','receipts','epoch'];
export function validateAuthorityState(s){
 if(!s||Object.keys(s).some(k=>!fields.includes(k))||!Number.isSafeInteger(s.epoch??0)||(s.epoch??0)<0||!s.spent||typeof s.spent!=='object'||Array.isArray(s.spent)||Object.values(s.spent).some(x=>!Number.isSafeInteger(x)||x<0)||!Array.isArray(s.revoked)||!Array.isArray(s.usedNonces)||!Array.isArray(s.receipts)||[...s.revoked,...s.usedNonces].some(x=>typeof x!=='string'||!x.length)||new Set(s.revoked).size!==s.revoked.length||new Set(s.usedNonces).size!==s.usedNonces.length)throw Error('INVALID_AUTHORITY_STATE');
 for(const receipt of s.receipts){const {receiptHash,...payload}=receipt||{};if(receiptHash!==hashObject(payload))throw Error('INVALID_AUTHORITY_RECEIPT');}
 return s;
}
// Private authority ledger only. Never put this checkpoint on a public endpoint.
export function prepareContinuityCheckpoint(store,{network,sequence,policyHash,now=new Date()}){
 if(store.storageRecovered)throw Error('RECOVERY_FENCED');
 const state=structuredClone(store.hsAuthorityState||{spent:{},revoked:[],usedNonces:[],receipts:[],epoch:0});state.epoch??=0;validateAuthorityState(state);
 const snapshot={version:CONTINUITY_VERSION,state};
 const statement={version:QUORUM_VERSION,kind:'CHECKPOINT',network,epoch:state.epoch,sequence,stateRoot:hashObject(snapshot),policyHash,intentHash:hashObject({operation:'RESTORE_AUTHORITY_LEDGER'}),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+60000).toISOString()};
 return {snapshot,statement};
}
export function restoreContinuityCheckpoint(store,checkpoint,{committee,expected,minimumSequence,now=new Date()}){
 if(!Number.isSafeInteger(minimumSequence)||minimumSequence<0||!expected||expected.kind!=='CHECKPOINT'||expected.sequence<minimumSequence)throw Error('CHECKPOINT_ROLLBACK');
 const verified=verifySovereignQuorum(checkpoint?.votes,{committee,expected,now});
 if(!verified.accepted)throw Error(verified.reason);
 if(hashObject(checkpoint.statement)!==hashObject(expected)||checkpoint.snapshot?.version!==CONTINUITY_VERSION||hashObject(checkpoint.snapshot)!==expected.stateRoot)throw Error('CHECKPOINT_INTEGRITY');
 const saved=validateAuthorityState(checkpoint.snapshot.state);if(saved.epoch!==expected.epoch)throw Error('CHECKPOINT_EPOCH');
 if(store.hsAuthorityState){
  const current=validateAuthorityState(store.hsAuthorityState);
  if((current.epoch??0)>saved.epoch||current.revoked.some(x=>!saved.revoked.includes(x))||current.usedNonces.some(x=>!saved.usedNonces.includes(x))||Object.entries(current.spent).some(([k,n])=>(saved.spent[k]??0)<n)||current.receipts.some(r=>!saved.receipts.some(x=>x.receiptHash===r.receiptHash)))throw Error('CHECKPOINT_ROLLBACK');
 }
 if(!Number.isSafeInteger(saved.epoch+1))throw Error('CHECKPOINT_EPOCH');
 store.hsAuthorityState={...structuredClone(saved),epoch:saved.epoch+1};
 store.storageRecovered=true; // Remain fenced. Recovery does not authorize execution.
 store.sovereignRecovery={version:CONTINUITY_VERSION,sequence:expected.sequence,stateRoot:expected.stateRoot,epoch:saved.epoch+1,status:'FENCED_REQUIRES_OPERATOR_REVALIDATION'};
 return structuredClone(store.sovereignRecovery);
}
