// PUBLIC synthetic keys, never usable for production or real accounts.
import crypto from 'node:crypto';
import {bindAgent,createSignedDelegation,inspectAction,proofDigest} from '../../lib/poha-v1.mjs';
import {signProof,publicKeyBase64} from '../../sdk/human-signal-node.mjs';
import {STATUS_VERSION,statusBytes} from '../../packages/authority-verifier/index.mjs';
const key=label=>crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),crypto.createHash('sha256').update('PUBLIC HUMAN SIGNAL TEST KEY '+label).digest()]),format:'der',type:'pkcs8'});
export function fixture({now=Date.now(),performer='AGENT',approvalRequired=false,approve=false}={}){
 const human=key('owner'),agent=key('agent'),issuer=key('issuer');
 const principalKey=publicKeyBase64(human),agentKey=publicKeyBase64(agent);
 let sequence=0;const common=()=>({version:'1',principalId:'HUMAN-AAAAAAAAAAAA',audience:'https://independent.example',nonce:Buffer.alloc(24,++sequence).toString('base64url'),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()});
 const context={principalId:'HUMAN-AAAAAAAAAAAA',principalKey,audience:'https://independent.example',identityAssurance:'PHONE_VERIFIED'};
 const store={};const b={...common(),principalKey,agentKey,name:'PUBLIC SYNTHETIC AGENT'};
 const binding=bindAgent(store,context,{payload:b,principalSignature:signProof('AGENT_BINDING',b,human),agentSignature:signProof('AGENT_BINDING',b,agent)},new Date(now));
 const d={...common(),principalKey,agentKey,bindingId:binding.id,scopes:['DRAFT_APP_ACTION'],resource:'draft:independent',approvalRequired};
 const delegation=createSignedDelegation(store,context,{payload:d,signature:signProof('DELEGATION',d,human)},new Date(now));
 const a={...common(),performer,signerKey:performer==='HUMAN'?principalKey:agentKey,delegationId:performer==='HUMAN'?'':delegation.id,action:'DRAFT_APP_ACTION',resource:'draft:independent',payloadHash:crypto.createHash('sha256').update('SYNTHETIC PAYLOAD').digest('hex')};
 const proof={payload:a,signature:signProof('ACTION',a,performer==='HUMAN'?human:agent)};
 if(approve){const q={...common(),principalKey,actionDigest:proofDigest('ACTION',a)};proof.approval={payload:q,signature:signProof('APPROVAL',q,human)};}
 const expected={audience:a.audience,action:a.action,resource:a.resource,payloadHash:a.payloadHash,requireApproval:false,challenge:Buffer.alloc(24,9).toString('base64url')};
 const snapshot={version:STATUS_VERSION,issuer:'synthetic-issuer',audience:a.audience,challenge:expected.challenge,actionDigest:proofDigest('ACTION',a),principalId:context.principalId,principalKey,identityAssurance:'PHONE_VERIFIED',assuranceExpiresAt:new Date(now+60000).toISOString(),credentialEpoch:1,principalRevoked:false,records:performer==='HUMAN'?[]:[{id:binding.id,revoked:false},{id:delegation.id,revoked:false}].sort((x,y)=>x.id.localeCompare(y.id)),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+20000).toISOString()};
 const status={payload:snapshot,signature:crypto.sign(null,statusBytes(snapshot),issuer).toString('base64')};
 const {revokedAt:unusedB,...portableBinding}=binding,{revokedAt:unusedD,...portableDelegation}=delegation;
 const bundle={proof,binding:portableBinding,delegation:portableDelegation,status,expected,trust:{'synthetic-issuer':{publicKey:publicKeyBase64(issuer),acceptedAssurances:['PHONE_VERIFIED']}},now};
 return {bundle,keys:{human,agent,issuer},store,context,resignStatus(){snapshot.actionDigest=proofDigest('ACTION',proof.payload);status.signature=crypto.sign(null,statusBytes(snapshot),issuer).toString('base64');},core(){return inspectAction(store,context,proof,expected,new Date(now));}};
}
