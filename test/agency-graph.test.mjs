import test from 'node:test';
import assert from 'node:assert/strict';
import {agencyGraph} from '../lib/agency-graph.mjs';
import {CheckpointWorker} from '../lib/checkpoint-worker.mjs';
test('agency graph records signed provenance and excludes economic reputation inputs',()=>{
 const profile={id:'HUMAN-1',trustConnections:['HUMAN-2'],humanProofs:{phone:{verified:true,verifiedAt:new Date().toISOString()}}};
 const agents=[{id:'AGENT-1',payload:{agentKey:'key',expiresAt:new Date(Date.now()+60000).toISOString()}}],delegations=[{id:'GRANT-1',payload:{bindingId:'AGENT-1',scopes:['DRAFT_APP_ACTION'],resource:'draft:1',audience:'https://draft.example',expiresAt:agents[0].payload.expiresAt}}];
 const input={profile,agents,delegations,contributions:[{profileId:profile.id,status:'VERIFIED',type:'CODE'},{profileId:profile.id,status:'PENDING',type:'SECURITY'}],receipts:[{actionDigest:'a',serviceId:'draft-board',actorClass:'AUTHORIZED_AGENT',performerKey:'key',checkedAt:new Date().toISOString()}]};
 const result=agencyGraph(input);assert.equal(result.signals.contributionScore,25);assert.ok(result.edges.some(e=>e.relation==='delegates'&&e.status==='ACTIVE'));
 profile.signalPoints=999999;profile.pendingCoh=999999;assert.deepEqual(agencyGraph(input),result);
 agents[0].revokedAt=new Date().toISOString();assert.ok(agencyGraph(input).edges.some(e=>e.relation==='delegates'&&e.status==='INACTIVE'));
 assert.equal(result.signals.determinesHumanity,false);
});
test('checkpoint worker records trust-only roots and refuses recovered state',async()=>{
 let composite={profiles:[],contributions:[]};const saved=[];
 const worker=new CheckpointWorker({database:{snapshot:async()=>({}),saveCheckpoint:async s=>saved.push(s)},readComposite:()=>composite});
 await worker.run();assert.equal(saved.length,1);assert.equal(saved[0].economicStateIncluded,false);assert.equal(saved[0].anchoredOnSolana,false);
 composite={storageRecovered:true};await worker.run();assert.equal(saved.length,1);assert.equal(worker.status.lastError,'CHECKPOINT_FAILED');
});
