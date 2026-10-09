import {inspectAuthority,commitAuthority,signingBytes,statusBytes} from '../authority-verifier/index.mjs';
import {HS2_VERSION,HS2_SUITE,exact,verifyDualSignature} from './wire.mjs';
export {HS2_VERSION,HS2_SUITE} from './wire.mjs';

// Classical bytes come from the independent HS/1 schema implementation.
// Every issuer, owner and agent signature has its own mandatory PQ attestation.
export function signatureContexts(bundle){
 const a=bundle.proof.payload,s=bundle.status.payload;
 const out=[{id:'action',kind:'ACTION',classicalBytes:signingBytes('ACTION',a),edPublicKey:a.signerKey,edSignature:bundle.proof.signature}];
 if(a.performer==='AGENT'){
  const b=bundle.binding,d=bundle.delegation;
  out.push({id:'bindingOwner',kind:'BINDING_OWNER',classicalBytes:signingBytes('AGENT_BINDING',b.payload),edPublicKey:b.payload.principalKey,edSignature:b.principalSignature},
   {id:'bindingAgent',kind:'BINDING_AGENT',classicalBytes:signingBytes('AGENT_BINDING',b.payload),edPublicKey:b.payload.agentKey,edSignature:b.agentSignature},
   {id:'delegation',kind:'DELEGATION',classicalBytes:signingBytes('DELEGATION',d.payload),edPublicKey:d.payload.principalKey,edSignature:d.signature});
 }
 if(bundle.proof.approval){const q=bundle.proof.approval;out.push({id:'approval',kind:'APPROVAL',classicalBytes:signingBytes('APPROVAL',q.payload),edPublicKey:q.payload.principalKey,edSignature:q.signature});}
 // Registry/issuer policy is service owned; a client cannot pin its own issuer key.
 out.push({id:'status',kind:'STATUS',classicalBytes:statusBytes(s),edPublicKey:null,edSignature:bundle.status.signature});
 return out;
}
function issuerKey(bundle,trust){
 const pinned=trust[bundle.status.payload.issuer];
 return pinned.keys?pinned.keys.find(k=>k.id===bundle.status.keyId)?.publicKey:pinned.publicKey;
}
export function inspectHybridAuthority(input,{trust,expected,keyRegistry,now=Date.now()}={}){
 const deny=reason=>({mode:'HS2_INSPECT',decision:'DENY',actorClass:'UNVERIFIED',executionAuthorized:false,pqVerified:false,reasonCodes:[reason]});
 try{
  exact(input,['version','suite','bundle','attestations']);
  if(new TextEncoder().encode(JSON.stringify(input)).length>192*1024)throw Error('HS2_INPUT_TOO_LARGE');
  if(input.version!==HS2_VERSION||input.suite!==HS2_SUITE)throw Error('HS2_DOWNGRADE_OR_SUITE_REJECTED');
  exact(input.bundle,['proof','binding','delegation','status']);
  // Clone once so asynchronous consumers cannot swap a signed context later.
  const bundle=structuredClone(input.bundle);
  const classical=inspectAuthority({...bundle,trust,expected,now});
  if(!['ALLOW','REQUIRE_APPROVAL'].includes(classical.decision))return {...classical,mode:'HS2_INSPECT',pqVerified:false};
  const contexts=signatureContexts(bundle);exact(input.attestations,contexts.map(c=>c.id));
  let deadline=Date.parse(classical.validUntil);
  for(const c of contexts){
   const key=c.edPublicKey||issuerKey(bundle,trust);
   const result=verifyDualSignature({...c,edPublicKey:key,version:input.version,suite:input.suite,attestation:input.attestations[c.id],registry:keyRegistry,now});
   deadline=Math.min(deadline,Date.parse(result.validUntil));
  }
  return {...classical,mode:'HS2_INSPECT',version:HS2_VERSION,suite:HS2_SUITE,pqVerified:true,executionAuthorized:false,validUntil:new Date(deadline).toISOString(),reasonCodes:['HS2_DUAL_SIGNATURE_INSPECTION_ONLY']};
 }catch(e){return deny(String(e.message));}
}
export async function commitHybridAuthority(input,{trust,expected,keyRegistry,commit}={}){
 const denied=reason=>({mode:'HS2_COMMIT',decision:'DENY',actorClass:'UNVERIFIED',executionAuthorized:false,operationCommitted:false,pqVerified:false,reasonCodes:[reason]});
 if(typeof commit!=='function')return denied('HS2_ATOMIC_COMMIT_REQUIRED');
 let snapshot,policy;try{if(new TextEncoder().encode(JSON.stringify(input)).length>192*1024)return denied('HS2_INPUT_TOO_LARGE');snapshot=structuredClone(input);policy=structuredClone({trust,expected,keyRegistry});}catch{return denied('HS2_INVALID_INPUT');}
 const inspected=inspectHybridAuthority(snapshot,policy);
 if(inspected.decision!=='ALLOW')return {...inspected,mode:'HS2_COMMIT',operationCommitted:false};
 const result=await commitAuthority(snapshot.bundle,{trust:policy.trust,expected:policy.expected,commit:x=>commit({...x,validUntil:new Date(Math.min(Date.parse(x.validUntil),Date.parse(inspected.validUntil))).toISOString(),cryptoVersion:HS2_VERSION,cryptoSuite:HS2_SUITE})});
 return {...result,mode:'HS2_COMMIT',pqVerified:true,version:HS2_VERSION,suite:HS2_SUITE};
}
