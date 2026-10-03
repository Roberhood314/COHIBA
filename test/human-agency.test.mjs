import test from 'node:test';
import assert from 'node:assert/strict';
import {registerAgent, grantDelegation, revokeDelegation, delegationStatus, agencyForOwner} from '../lib/human-agency.mjs';
import {coreStateRoot, appendCoreEvent, verifyEventChain} from '../lib/human-signal-core.mjs';
const alice='HUMAN-AAAAAAAAAAAA', bob='COH-BBBBBBBBBBBB';
const now=new Date('2026-10-03T10:00:00Z');
const expiry='2026-10-04T10:00:00Z';

test('agency ownership isolates listing, grants and revocations',()=>{
  const store={};
  const agent=registerAgent(store,alice,{name:'Research Assistant'},now);
  assert.throws(()=>grantDelegation(store,bob,{agentId:agent.id,scopes:['READ_PUBLIC_SIGNALS'],expiresAt:expiry},now),/AGENT_NOT_FOUND/);
  const d=grantDelegation(store,alice,{agentId:agent.id,scopes:['READ_PUBLIC_SIGNALS'],expiresAt:expiry},now);
  assert.deepEqual(agencyForOwner(store,bob,now).agents,[]);
  assert.deepEqual(agencyForOwner(store,bob,now).delegations,[]);
  assert.throws(()=>revokeDelegation(store,bob,d.id,now),/DELEGATION_NOT_FOUND/);
  assert.equal(agencyForOwner(store,alice,now).executionEnabled,false);
});

test('delegations reject financial scopes and invalid expiry; expire at boundary',()=>{
  const store={};const agent=registerAgent(store,alice,{name:'Draft Assistant'},now);
  for(const scopes of [[],['TOKEN_TRANSFER'],['READ_PUBLIC_SIGNALS','MAINNET_LAUNCH'],null]){
    assert.throws(()=>grantDelegation(store,alice,{agentId:agent.id,scopes,expiresAt:expiry},now),/INVALID_DELEGATION_SCOPE/);
  }
  for(const expiresAt of [null,'invalid',now.toISOString(),'2026-10-11T10:00:00Z']){
    assert.throws(()=>grantDelegation(store,alice,{agentId:agent.id,scopes:['DRAFT_CONTRIBUTION'],expiresAt},now),/INVALID_DELEGATION_EXPIRY/);
  }
  const d=grantDelegation(store,alice,{agentId:agent.id,scopes:['DRAFT_CONTRIBUTION'],expiresAt:expiry},now);
  assert.equal(delegationStatus(d,now),'ACTIVE');
  assert.equal(delegationStatus(d,new Date(expiry)),'EXPIRED');
  assert.equal(revokeDelegation(store,alice,d.id,now).changed,true);
  assert.equal(revokeDelegation(store,alice,d.id,now).changed,false);
  assert.equal(delegationStatus(d,now),'REVOKED');
});

test('agency records and revocation are bound to the state root',()=>{
  const store={};const before=coreStateRoot(store).stateRoot;
  const agent=registerAgent(store,alice,{name:'Safe Assistant'},now);
  appendCoreEvent(store,{type:'AGENT_REGISTERED',actor:alice,subject:agent.id,data:{...agent}},now);
  assert.notEqual(coreStateRoot(store).stateRoot,before);
  const d=grantDelegation(store,alice,{agentId:agent.id,scopes:['READ_PUBLIC_SIGNALS'],expiresAt:expiry},now);
  appendCoreEvent(store,{type:'DELEGATION_GRANTED',actor:alice,subject:d.id,data:{...d}},now);
  const granted=coreStateRoot(store).stateRoot;
  revokeDelegation(store,alice,d.id,now);
  assert.notEqual(coreStateRoot(store).stateRoot,granted);
  assert.equal(verifyEventChain(store.events).valid,true);
});

test('wallet-linked phone profiles can own agents',()=>{
  const store={};const agent=registerAgent(store,bob,{name:'Phone Profile Assistant'},now);
  assert.equal(agent.ownerProfileId,bob);
  assert.equal(grantDelegation(store,bob,{agentId:agent.id,scopes:['READ_PUBLIC_SIGNALS'],expiresAt:expiry},now).ownerProfileId,bob);
});
