import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
import {inspectAuthority,commitAuthority,proofDigest} from '../packages/authority-verifier/index.mjs';
import {createPostgresCommitGate} from '../packages/authority-verifier/postgres-adapter.mjs';
import {signProof} from '../sdk/human-signal-node.mjs';

async function database(){
 if(process.env.TEST_DATABASE_URL){const {default:pg}=await import('pg');return new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});}
 const {PGlite}=await import('@electric-sql/pglite');const engine=new PGlite();let tail=Promise.resolve();
 return {async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(sql,args)=>!args&&sql.includes('CREATE TABLE')?engine.exec(sql).then(()=>({rows:[]})):engine.query(sql,args),release};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}},end:()=>engine.close()};
}
function request(config){
 const f=fixture(config),issuer='commit-'+crypto.randomBytes(12).toString('hex');
 f.bundle.proof.payload.nonce=crypto.randomBytes(24).toString('base64url');f.bundle.proof.signature=signProof('ACTION',f.bundle.proof.payload,f.keys.agent);
 if(f.bundle.proof.approval){const q=f.bundle.proof.approval.payload;q.nonce=crypto.randomBytes(24).toString('base64url');q.actionDigest=proofDigest('ACTION',f.bundle.proof.payload);f.bundle.proof.approval.signature=signProof('APPROVAL',q,f.keys.human);}
 f.bundle.expected.challenge=crypto.randomBytes(24).toString('base64url');f.bundle.status.payload.challenge=f.bundle.expected.challenge;
 f.bundle.trust[issuer]=f.bundle.trust['synthetic-issuer'];delete f.bundle.trust['synthetic-issuer'];f.bundle.status.payload.issuer=issuer;f.resignStatus();
 const {proof,binding,delegation,status}=f.bundle;
 return {f,input:{proof,binding,delegation,status},options:{trust:f.bundle.trust,expected:f.bundle.expected},revocation:{issuer,principalId:proof.payload.principalId}};
}
async function setup(run){const pool=await database();try{
 await pool.query('CREATE TABLE IF NOT EXISTS hs_commit_gate_test_effects(digest text PRIMARY KEY,resource text NOT NULL,payload_hash text NOT NULL)');
 const write=async(c,x)=>c.query('INSERT INTO hs_commit_gate_test_effects VALUES($1,$2,$3)',[x.actionDigest,x.resource,x.payloadHash]);
 await run(pool,write);
 }finally{await pool.end();}}

test('local revocations deny still-live issuer snapshots for binding, delegation and principal',{timeout:60000},()=>setup(async(pool,write)=>{
 const gate=await createPostgresCommitGate(pool,{onCommit:write});
 for(const kind of ['binding','delegation','principal']){
  const r=request();assert.equal(inspectAuthority(r.f.bundle).decision,'ALLOW');
  await gate.revoke({...r.revocation,authorityId:kind==='principal'?'*':r.input[kind].id});
  const result=await commitAuthority(r.input,{...r.options,commit:gate.commit});
  assert.equal(result.operationCommitted,false);assert.equal(result.decision,'DENY');
  assert.equal((await pool.query('SELECT 1 FROM hs_commit_gate_test_effects WHERE digest=$1',[inspectAuthority(r.f.bundle).actionDigest])).rows.length,0);
 }
}));

test('exact verified effect commits once and revocation persists after adapter restart',{timeout:60000},()=>setup(async(pool,write)=>{
 let gate=await createPostgresCommitGate(pool,{onCommit:write});const r=request({approvalRequired:true,approve:true});
 const results=await Promise.all(Array.from({length:8},()=>commitAuthority(r.input,{...r.options,commit:gate.commit})));
 assert.equal(results.filter(x=>x.operationCommitted).length,1);
 const rows=(await pool.query('SELECT * FROM hs_commit_gate_test_effects WHERE digest=$1',[inspectAuthority(r.f.bundle).actionDigest])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].resource,r.options.expected.resource);assert.equal(rows[0].payload_hash,r.options.expected.payloadHash);
 const revoked=request();await gate.revoke(revoked.revocation);gate=await createPostgresCommitGate(pool,{onCommit:write});
 assert.equal((await commitAuthority(revoked.input,{...revoked.options,commit:gate.commit})).operationCommitted,false);
}));

test('failed business writes roll back effect and replay consumption; no hook fails closed',{timeout:60000},()=>setup(async(pool,write)=>{
 await assert.rejects(createPostgresCommitGate(pool),/ATOMIC_COMMIT_HOOK_REQUIRED/);
 const r=request();let gate=await createPostgresCommitGate(pool,{onCommit:async(c,x)=>{await write(c,x);throw Error('private failure');}});
 const failed=await commitAuthority(r.input,{...r.options,commit:gate.commit});assert.equal(failed.operationCommitted,false);assert.deepEqual(failed.reasonCodes,['REPLAY_STORE_UNAVAILABLE']);
 assert.equal((await pool.query('SELECT 1 FROM hs_verifier_actions WHERE signer_key=$1 AND nonce=$2',[r.input.proof.payload.signerKey,r.input.proof.payload.nonce])).rows.length,0);
 assert.equal((await pool.query('SELECT 1 FROM hs_commit_gate_test_effects WHERE digest=$1',[inspectAuthority(r.f.bundle).actionDigest])).rows.length,0);
 gate=await createPostgresCommitGate(pool,{onCommit:write});assert.equal((await commitAuthority(r.input,{...r.options,commit:gate.commit})).operationCommitted,true);
 assert.equal((await commitAuthority(request().input)).operationCommitted,false);
}));

test('valid agent signature cannot enlarge resource, scope or payload at the commit gate',{timeout:60000},()=>setup(async(pool)=>{
 let writes=0;const gate=await createPostgresCommitGate(pool,{onCommit:async()=>{writes++;}});
 for(const field of ['resource','action','payloadHash']){
  const r=request(),a=r.input.proof.payload;a[field]=field==='resource'?'draft:other':field==='action'?'READ_PUBLIC_SIGNALS':'0'.repeat(64);
  r.input.proof.signature=signProof('ACTION',a,r.f.keys.agent);r.f.resignStatus();
  // Service derives context from the real requested effect, not the signed proof.
  assert.equal((await commitAuthority(r.input,{...r.options,commit:gate.commit})).operationCommitted,false);
 }
 assert.equal(writes,0);
}));

test('revocation and commit serialize on a shared principal lock',{timeout:60000},()=>setup(async(pool,write)=>{
 const r=request();let entered,finish;const ready=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>finish=resolve);
 const gate=await createPostgresCommitGate(pool,{onCommit:async(c,x)=>{entered();await hold;await write(c,x);}});
 const committing=commitAuthority(r.input,{...r.options,commit:gate.commit});await ready;
 let revocationCompleted=false;const revoking=gate.revoke(r.revocation).then(()=>{revocationCompleted=true;});
 assert.equal(revocationCompleted,false);
 finish();assert.equal((await committing).operationCommitted,true);await revoking;
 r.input.proof.payload.nonce=crypto.randomBytes(24).toString('base64url');r.input.proof.signature=signProof('ACTION',r.input.proof.payload,r.f.keys.agent);r.f.bundle.expected.challenge=crypto.randomBytes(24).toString('base64url');r.input.status.payload.challenge=r.f.bundle.expected.challenge;r.f.resignStatus();
 const restarted=await createPostgresCommitGate(pool,{onCommit:write});
 assert.equal((await commitAuthority(r.input,{...r.options,commit:restarted.commit})).operationCommitted,false);
}));


test('database deferred deadline rejects expiry at COMMIT and rolls back the effect',{timeout:60000},()=>setup(async(pool,write)=>{
 const r=request();const gate=await createPostgresCommitGate(pool,{onCommit:async(c,x)=>{
  await write(c,x);
  // Force the durable deadline to expire without sleeping or changing verifier clocks.
  await c.query('UPDATE hs_verifier_commits SET valid_until=clock_timestamp() WHERE action_digest=$1',[x.actionDigest]);
 }});
 assert.equal((await commitAuthority(r.input,{...r.options,commit:gate.commit})).operationCommitted,false);
 const digest=inspectAuthority(r.f.bundle).actionDigest;
 for(const table of ['hs_commit_gate_test_effects','hs_verifier_commits']){
  const column=table==='hs_verifier_commits'?'action_digest':'digest';
  assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE ${column}=$1`,[digest])).rows.length,0);
 }
 const working=await createPostgresCommitGate(pool,{onCommit:write});
 assert.equal((await commitAuthority(r.input,{...r.options,commit:working.commit})).operationCommitted,true);
}));
