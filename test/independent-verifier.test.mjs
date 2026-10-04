import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
import {inspectAuthority,authorizeAuthority,signingBytes,proofDigest,statusBytes} from '../packages/authority-verifier/index.mjs';
import {signingBytes as coreBytes} from '../lib/poha-v1.mjs';
import {signProof} from '../sdk/human-signal-node.mjs';
const inspect=f=>inspectAuthority(f.bundle);
const admission=f=>{const {proof,binding,delegation,status}=f.bundle;return {proof,binding,delegation,status};};
const options=f=>({trust:f.bundle.trust,expected:f.bundle.expected});

test('independent signing bytes and classification match core and public vectors',()=>{
 for(const config of [{},{performer:'HUMAN'},{approvalRequired:true},{approvalRequired:true,approve:true}]){
  const f=fixture(config);for(const [kind,p] of [['AGENT_BINDING',f.bundle.binding.payload],['DELEGATION',f.bundle.delegation.payload],['ACTION',f.bundle.proof.payload]])assert.deepEqual(signingBytes(kind,p),coreBytes(kind,p));
  assert.equal(inspect(f).actorClass,f.core().actorClass);assert.equal(inspect(f).decision,f.core().decision);assert.equal(inspect(f).executionAuthorized,false);
 }
 const vectors=JSON.parse(fs.readFileSync(new URL('../examples/independent-verifier/vectors.json',import.meta.url),'utf8'));
 for(const v of vectors.cases){const r=inspectAuthority(v.input);assert.equal(r.actorClass,v.expected.actorClass);assert.equal(r.decision,v.expected.decision);assert.equal(r.executionAuthorized,false);}
});

test('forgery, substituted keys, audience, issuer, stale status and absent coverage fail closed',()=>{
 const mutations=[
  f=>f.bundle.proof.signature=crypto.randomBytes(64).toString('base64'),
  f=>f.bundle.binding.agentSignature=f.bundle.binding.principalSignature,
  f=>f.bundle.delegation.signature=f.bundle.binding.principalSignature,
  f=>f.bundle.expected.payloadHash='0'.repeat(64),
  f=>f.bundle.expected.audience='https://wrong.example',
  f=>f.bundle.expected.challenge='a'.repeat(32),
  f=>f.bundle.trust={},
  f=>f.bundle.trust['synthetic-issuer'].acceptedAssurances=[],
  f=>f.bundle.status.signature=crypto.randomBytes(64).toString('base64'),
  f=>f.bundle.status.payload.principalKey=f.bundle.binding.payload.agentKey,
  f=>f.bundle.now=Date.parse(f.bundle.status.payload.expiresAt),
  f=>{f.bundle.status.payload.records=[];f.resignStatus();},
  f=>{f.bundle.status.payload.records[0].revoked=true;f.resignStatus();},
  f=>{f.bundle.status.payload.principalRevoked=true;f.resignStatus();},
  f=>{f.bundle.status.payload.assuranceExpiresAt=new Date(f.bundle.now-1).toISOString();f.resignStatus();},
  f=>{f.bundle.status.payload.expiresAt=new Date(f.bundle.now+31000).toISOString();f.resignStatus();},
  f=>{f.bundle.status.payload.credentialEpoch=0;},
  f=>f.bundle.binding.id='AGENT-'+'0'.repeat(64),
  f=>f.bundle.proof.payload.extra='unapproved',
  f=>f.bundle.binding.payload.scopes=['DRAFT_APP_ACTION']
 ];
 for(const mutate of mutations){const f=fixture();mutate(f);const r=inspect(f);assert.equal(r.decision,'DENY',r.reasonCodes.join());assert.equal(r.executionAuthorized,false);}
});

test('validly signed agent requests cannot widen exact resource, scope or delegate onward',()=>{
 for(const change of [a=>a.resource='draft:other',a=>a.action='READ_PUBLIC_SIGNALS',a=>a.delegationId='DELEGATION-'+'0'.repeat(64)]){
  const f=fixture(),a=f.bundle.proof.payload;change(a);f.bundle.expected.action=a.action;f.bundle.expected.resource=a.resource;f.bundle.proof.signature=signProof('ACTION',a,f.keys.agent);f.resignStatus();assert.equal(inspect(f).decision,'DENY');
 }
 const f=fixture();f.bundle.delegation.payload.principalKey=f.bundle.binding.payload.agentKey;f.bundle.delegation.signature=signProof('DELEGATION',f.bundle.delegation.payload,f.keys.agent);f.bundle.delegation.id='DELEGATION-'+proofDigest('DELEGATION',f.bundle.delegation.payload);f.bundle.proof.payload.delegationId=f.bundle.delegation.id;f.bundle.proof.signature=signProof('ACTION',f.bundle.proof.payload,f.keys.agent);f.resignStatus();assert.equal(inspect(f).decision,'DENY');
});

test('approval binds exact action; unsigned assurances or caller clocks cannot authorize',async()=>{
 const f=fixture({approvalRequired:true,approve:true});f.bundle.proof.approval.payload.actionDigest='0'.repeat(64);f.bundle.proof.approval.signature=signProof('APPROVAL',f.bundle.proof.approval.payload,f.keys.human);assert.equal(inspect(f).decision,'DENY');
 assert.equal((await authorizeAuthority(admission(f),options(f))).reasonCodes[0],'ATOMIC_REPLAY_STORE_REQUIRED');
 const historical=fixture({now:Date.parse('2026-01-01T00:00:00.000Z')});
 const result=await authorizeAuthority(admission(historical),{...options(historical),consume:()=>{throw Error('must not consume stale proof');}});assert.equal(result.executionAuthorized,false);
 assert.equal((await authorizeAuthority({...admission(f),trust:f.bundle.trust},{...options(f),consume:()=>true})).reasonCodes[0],'INVALID_ADMISSION_INPUT');
});

test('atomic adapter rejects concurrent action replay, approval replay and epoch rollback',async()=>{
 const f=fixture({approvalRequired:true,approve:true});const actions=new Set(),approvals=new Set(),challenges=new Set(),epochs=new Map();
 // Test-only atomic in-memory transaction. Production requires shared durable storage.
 const consume=x=>{const a=x.signerKey+':'+x.actionNonce,q=x.approval?x.approval.principalKey+':'+x.approval.nonce:null,c=x.audience+':'+x.challenge,e=x.issuer+':'+x.principalId;
  if(actions.has(a)||q&&approvals.has(q)||challenges.has(c)||x.credentialEpoch<(epochs.get(e)||0))return false;
  actions.add(a);if(q)approvals.add(q);challenges.add(c);epochs.set(e,x.credentialEpoch);return true;
 };
 const results=await Promise.all(Array.from({length:12},()=>authorizeAuthority(admission(f),{...options(f),consume})));
 assert.equal(results.filter(r=>r.executionAuthorized).length,1);
 assert.equal((await authorizeAuthority(admission(f),{...options(f),consume})).executionAuthorized,false);
 const saved=JSON.stringify({actions:[...actions],approvals:[...approvals],challenges:[...challenges],epochs:[...epochs]});const restored=JSON.parse(saved);assert.ok(restored.actions.includes(f.bundle.proof.payload.signerKey+':'+f.bundle.proof.payload.nonce));
 const g=fixture({approvalRequired:true,approve:true});g.bundle.proof.payload.nonce='b'.repeat(32);g.bundle.proof.signature=signProof('ACTION',g.bundle.proof.payload,g.keys.agent);g.bundle.proof.approval.payload.actionDigest=proofDigest('ACTION',g.bundle.proof.payload);g.bundle.proof.approval.signature=signProof('APPROVAL',g.bundle.proof.approval.payload,g.keys.human);g.bundle.status.payload.challenge='c'.repeat(32);g.bundle.expected.challenge='c'.repeat(32);g.resignStatus();
 assert.equal((await authorizeAuthority(admission(g),{...options(g),consume})).executionAuthorized,false);
 const h=fixture();h.bundle.proof.payload.nonce='d'.repeat(32);h.bundle.proof.signature=signProof('ACTION',h.bundle.proof.payload,h.keys.agent);h.bundle.status.payload.challenge='e'.repeat(32);h.bundle.expected.challenge='e'.repeat(32);h.resignStatus();epochs.set('synthetic-issuer:'+h.bundle.status.payload.principalId,2);
 assert.equal((await authorizeAuthority(admission(h),{...options(h),consume})).executionAuthorized,false);
 const unavailable=await authorizeAuthority(admission(h),{...options(h),consume:()=>{throw Error('secret database URL');}});assert.deepEqual(unavailable.reasonCodes,['REPLAY_STORE_UNAVAILABLE']);
});

test('package runs alone without COHIBA source tree or installed dependencies',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'standalone-poha-'));try{
  fs.copyFileSync(new URL('../packages/authority-verifier/index.mjs',import.meta.url),path.join(dir,'verifier.mjs'));
  fs.copyFileSync(new URL('../examples/independent-verifier/vectors.json',import.meta.url),path.join(dir,'vectors.json'));
  const script="import fs from 'node:fs';import {inspectAuthority} from './verifier.mjs';for(const v of JSON.parse(fs.readFileSync('vectors.json')).cases){const r=inspectAuthority(v.input);if(r.actorClass!==v.expected.actorClass||r.decision!==v.expected.decision)throw Error(v.name)}";
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('external PostgreSQL adapter persists replay across adapter re-instantiation and rolls back partial admissions',{timeout:60000},async()=>{
 const {createPostgresReplayStore}=await import('../packages/authority-verifier/postgres-adapter.mjs');
 const {PGlite}=await import('@electric-sql/pglite');const {default:pg}=await import('pg');
 let pool,engine;
 if(process.env.TEST_DATABASE_URL)pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 else{
  engine=new PGlite();let tail=Promise.resolve();
  pool={async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(sql,args)=>!args&&sql.includes('CREATE TABLE')?engine.exec(sql).then(()=>({rows:[]})):engine.query(sql,args),release};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}},end:()=>engine.close()};
 }
 try{
  let consume=await createPostgresReplayStore(pool);const f=fixture({approvalRequired:true,approve:true});
  // Unique fixture nonces allow shared native CI database without test pollution collisions.
  const a=f.bundle.proof.payload;a.nonce=crypto.randomBytes(24).toString('base64url');f.bundle.proof.signature=signProof('ACTION',a,f.keys.agent);
  const q=f.bundle.proof.approval.payload;q.nonce=crypto.randomBytes(24).toString('base64url');q.actionDigest=proofDigest('ACTION',a);f.bundle.proof.approval.signature=signProof('APPROVAL',q,f.keys.human);
  f.bundle.expected.challenge=crypto.randomBytes(24).toString('base64url');f.bundle.status.payload.challenge=f.bundle.expected.challenge;f.resignStatus();
  const results=await Promise.all(Array.from({length:10},()=>authorizeAuthority(admission(f),{...options(f),consume})));
  assert.equal(results.filter(r=>r.executionAuthorized).length,1);
  consume=await createPostgresReplayStore(pool);assert.equal((await authorizeAuthority(admission(f),{...options(f),consume})).executionAuthorized,false);
  const changed=structuredClone(admission(f));changed.proof.payload.nonce=crypto.randomBytes(24).toString('base64url');changed.proof.signature=signProof('ACTION',changed.proof.payload,f.keys.agent);
  changed.proof.approval.payload.actionDigest=proofDigest('ACTION',changed.proof.payload);changed.proof.approval.signature=signProof('APPROVAL',changed.proof.approval.payload,f.keys.human);
  changed.status.payload.actionDigest=proofDigest('ACTION',changed.proof.payload);changed.status.signature=crypto.sign(null,statusBytes(changed.status.payload),f.keys.issuer).toString('base64');
  assert.equal((await authorizeAuthority(changed,{...options(f),consume})).executionAuthorized,false);
  const row=await pool.query('SELECT 1 FROM hs_verifier_actions WHERE signer_key=$1 AND nonce=$2',[changed.proof.payload.signerKey,changed.proof.payload.nonce]);assert.equal(row.rows.length,0);
  await pool.query('UPDATE hs_verifier_epochs SET credential_epoch=2 WHERE issuer=$1 AND principal_id=$2',['synthetic-issuer','HUMAN-AAAAAAAAAAAA']);
  assert.equal((await authorizeAuthority(changed,{...options(f),consume})).executionAuthorized,false);
  await pool.query('DELETE FROM hs_verifier_epochs WHERE issuer=$1 AND principal_id=$2',['synthetic-issuer','HUMAN-AAAAAAAAAAAA']);
 }finally{await pool.end();}
});
