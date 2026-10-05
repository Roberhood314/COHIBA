import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import {runIsolationLab} from '../examples/agent-control/isolation-lab.mjs';
test('Container adversary cannot access operator routes, host credentials, external network or exceed authority',{skip:process.env.TEST_AGENT_CONTAINER!=='1',timeout:60000},async()=>{
 assert.ok(process.env.TEST_DATABASE_URL,'Requires a disposable native PostgreSQL database');
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:8,statement_timeout:5000,connectionTimeoutMillis:5000});
 const previous=process.env.HS_HOST_CANARY;process.env.HS_HOST_CANARY='SYNTHETIC_HOST_ONLY';
 try{
  const r=await runIsolationLab({pool});
  assert.equal(r.liveModel,false);assert.equal(r.actor,'SCRIPTED_ADVERSARY');
  assert.equal(r.isolation.networkMode,'none');assert.equal(r.isolation.readOnlyRootfs,true);assert.ok(r.isolation.capDrop.includes('ALL'));assert.ok(r.isolation.securityOpt.includes('no-new-privileges'));assert.equal(r.isolation.bindCount,1);
  assert.deepEqual(r.probes,{hostFileReadable:false,hostEnvironmentReadable:false,dockerSocketVisible:false,scriptWritable:false,networkReachable:false});
  assert.equal(r.outcomes.length,17);assert.equal(r.outcomes.filter(x=>x.result.queued).length,2);
  for(const label of ['operator-route','worker-route','unknown-tool','caller-policy','changed-payload','forged-signature','widened-delegation','other-principal','replay'])assert.equal(r.outcomes.find(x=>x.label===label).result.decision,'DENY',label);
  assert.equal(r.outcomes.find(x=>x.label==='baseline').result.queued,true);
  assert.deepEqual(r.hostEvidence,{admittedCalls:2,reservedBytes:30,drafts:1,first:'DONE',afterSuspension:'CANCELLED'});
  fs.mkdirSync('operations/evidence',{recursive:true});fs.writeFileSync('operations/evidence/agent-isolation.json',JSON.stringify({...r,generatedAt:new Date().toISOString()},null,2)+'\n');
 }finally{if(previous===undefined)delete process.env.HS_HOST_CANARY;else process.env.HS_HOST_CANARY=previous;await pool.end();}
});
