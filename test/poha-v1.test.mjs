import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {bindAgent,createSignedDelegation,revokeSignedRecord,inspectAction,proofDigest,signingBytes,payloadDigest} from '../lib/poha-v1.mjs';
import {signProof,publicKeyBase64} from '../sdk/human-signal-node.mjs';
import {coreStateRoot} from '../lib/human-signal-core.mjs';
const now=new Date('2026-10-03T12:00:00.000Z');
const expiry=new Date(now.getTime()+60000).toISOString();
const nonce=()=>crypto.randomBytes(24).toString('base64url');
function fixture({approvalRequired=false}={}){
  const human=crypto.generateKeyPairSync('ed25519'),agent=crypto.generateKeyPairSync('ed25519');
  const principalKey=publicKeyBase64(human.privateKey),agentKey=publicKeyBase64(agent.privateKey);
  const context={principalId:'HUMAN-AAAAAAAAAAAA',principalKey,audience:'https://pilot.example',identityAssurance:'PHONE_VERIFIED'};
  const store={};const common={version:'1',principalId:context.principalId,audience:context.audience,nonce:nonce(),issuedAt:now.toISOString(),expiresAt:expiry};
  const b={...common,principalKey,agentKey,name:'Pilot Assistant'};
  const binding=bindAgent(store,context,{payload:b,principalSignature:signProof('AGENT_BINDING',b,human.privateKey),agentSignature:signProof('AGENT_BINDING',b,agent.privateKey)},now);
  const d={...common,nonce:nonce(),principalKey,bindingId:binding.id,agentKey,scopes:['DRAFT_CONTRIBUTION'],resource:'draft:one',approvalRequired};
  const delegation=createSignedDelegation(store,context,{payload:d,signature:signProof('DELEGATION',d,human.privateKey)},now);
  const a={...common,nonce:nonce(),performer:'AGENT',signerKey:agentKey,delegationId:delegation.id,action:'DRAFT_CONTRIBUTION',resource:'draft:one',payloadHash:payloadDigest(Buffer.from('Actual draft'))};
  const proof={payload:a,signature:signProof('ACTION',a,agent.privateKey)};
  const expected={audience:context.audience,action:a.action,resource:a.resource,payloadHash:a.payloadHash,requireApproval:false};
  return {store,context,human,agent,binding,delegation,proof,expected,common};
}
const inspect=f=>inspectAction(f.store,f.context,f.proof,f.expected,now);
test('signed agent chain verifies and remains inspection-only; token holdings have no effect',()=>{
  const f=fixture();const result=inspect(f);
  assert.equal(result.actorClass,'AUTHORIZED_AGENT');assert.equal(result.decision,'ALLOW');assert.equal(result.executionAuthorized,false);
  assert.deepEqual(inspect(f),result); // repeated diagnostics never imply nonce consumption
  f.context.cohBalance=999999;f.context.signalPoints=999999;assert.deepEqual(inspect(f),result);
  assert.equal(result.actionDigest,proofDigest('ACTION',f.proof.payload));
});
test('tampered signatures, expected context, scope and substituted agent fail closed',()=>{
  for(const mutate of [
    f=>f.proof.payload.payloadHash='0'.repeat(64),
    f=>f.expected.audience='https://other.example',
    f=>f.expected.payloadHash='1'.repeat(64),
    f=>f.proof.signature=crypto.randomBytes(64).toString('base64'),
    f=>{f.proof.payload.action='READ_PUBLIC_SIGNALS';f.expected.action='READ_PUBLIC_SIGNALS';f.proof.signature=signProof('ACTION',f.proof.payload,f.agent.privateKey);},
    f=>{f.proof.payload.signerKey=f.context.principalKey;f.proof.signature=signProof('ACTION',f.proof.payload,f.human.privateKey);},
    f=>f.context.principalKey=publicKeyBase64(crypto.generateKeyPairSync('ed25519').privateKey),
    f=>f.context.identityAssurance='NONE',
    f=>f.store.storageRecovered=true,
    f=>f.store.pohaDelegations[0].payload.resource='draft:changed'
  ]){const f=fixture();mutate(f);assert.equal(inspect(f).decision,'DENY');assert.equal(inspect(f).actorClass,'UNVERIFIED');}
});
test('expiry boundary and future issue time reject proofs',()=>{
  const f=fixture();assert.equal(inspectAction(f.store,f.context,f.proof,f.expected,new Date(expiry)).decision,'DENY');
  f.proof.payload.issuedAt=new Date(now.getTime()+1).toISOString();f.proof.signature=signProof('ACTION',f.proof.payload,f.agent.privateKey);assert.equal(inspect(f).decision,'DENY');
});
test('grant and agent revocation are authoritative and committed to roots',()=>{
  for(const type of ['AGENT','DELEGATION']){
    const f=fixture();const before=coreStateRoot(f.store).stateRoot;
    const id=type==='AGENT'?f.binding.id:f.delegation.id;
    assert.throws(()=>revokeSignedRecord(f.store,{...f.context,principalId:'HUMAN-BBBBBBBBBBBB'},{type,id},now),/RECORD_NOT_FOUND/);
    assert.equal(revokeSignedRecord(f.store,f.context,{type,id},now).changed,true);
    assert.equal(revokeSignedRecord(f.store,f.context,{type,id},now).changed,false);
    assert.notEqual(coreStateRoot(f.store).stateRoot,before);assert.equal(inspect(f).decision,'DENY');
  }
});
test('fresh human approval must bind exact action digest and cannot bypass scope',()=>{
  const f=fixture({approvalRequired:true});assert.equal(inspect(f).actorClass,'HUMAN_APPROVAL_REQUIRED');
  const p={...f.common,nonce:nonce(),principalKey:f.context.principalKey,actionDigest:proofDigest('ACTION',f.proof.payload)};
  f.proof.approval={payload:p,signature:signProof('APPROVAL',p,f.human.privateKey)};assert.equal(inspect(f).actorClass,'AUTHORIZED_AGENT');
  p.actionDigest='0'.repeat(64);f.proof.approval.signature=signProof('APPROVAL',p,f.human.privateKey);assert.equal(inspect(f).decision,'DENY');
});
test('direct human proof requires current principal key and configured phone assurance',()=>{
  const f=fixture();Object.assign(f.proof.payload,{performer:'HUMAN',signerKey:f.context.principalKey,delegationId:''});
  f.proof.signature=signProof('ACTION',f.proof.payload,f.human.privateKey);assert.equal(inspect(f).actorClass,'VERIFIED_HUMAN');
  f.context.identityAssurance='NONE';assert.equal(inspect(f).decision,'DENY');
});
test('binding requires both keys and grants cannot replay or outlive binding',()=>{
  const f=fixture(),b=f.binding;
  assert.throws(()=>bindAgent({},f.context,{payload:b.payload,principalSignature:b.principalSignature,agentSignature:b.principalSignature},now),/SIGNATURE_INVALID/);
  assert.throws(()=>bindAgent(f.store,f.context,b,now),/BINDING_REPLAY/);
  assert.throws(()=>createSignedDelegation(f.store,f.context,f.delegation,now),/DELEGATION_REPLAY/);
  const p={...f.delegation.payload,nonce:nonce(),expiresAt:new Date(now.getTime()+120000).toISOString()};
  assert.throws(()=>createSignedDelegation(f.store,f.context,{payload:p,signature:signProof('DELEGATION',p,f.human.privateKey)},now),/DELEGATION_BINDING_MISMATCH/);
});
test('strict schema, canonical key order and signature domain separation',()=>{
  const f=fixture(),p=f.proof.payload;
  const reverse=Object.fromEntries(Object.entries(p).reverse());assert.deepEqual(signingBytes('ACTION',p),signingBytes('ACTION',reverse));
  assert.throws(()=>signingBytes('ACTION',{...p,algorithm:'none'}),/INVALID_SCHEMA/);
  assert.throws(()=>signingBytes('ACTION',{...p,version:'2'}),/UNSUPPORTED_VERSION/);
  assert.throws(()=>signingBytes('ACTION',{...p,nonce:'x'}),/INVALID_NONCE/);
  assert.throws(()=>signingBytes('ACTION',{...p,signerKey:'bad'}),/INVALID_ENCODING/);
  assert.throws(()=>signingBytes('APPROVAL',p),/INVALID_SCHEMA/);
});
