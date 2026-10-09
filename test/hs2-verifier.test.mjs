import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hybridFixture} from '../examples/hs2/fixture.mjs';
import {inspectHybridAuthority,commitHybridAuthority,signatureContexts} from '../packages/hs2-verifier/index.mjs';
import {verifyDualSignature,decode64,encode64,signAttestation,HS2_LENGTHS} from '../packages/hs2-verifier/wire.mjs';
import {signProof} from '../sdk/human-signal-node.mjs';
import {createPostgresCommitGate} from '../packages/authority-verifier/postgres-adapter.mjs';
import {proofDigest,statusBytes} from '../packages/authority-verifier/index.mjs';
const epoch=Date.parse('2026-10-09T00:00:00.000Z');
const shared=hybridFixture({now:epoch});
const inspect=(input=shared.input,options=shared.options)=>inspectHybridAuthority(input,{...options,now:epoch});
function resignChangedAction(input){
 const a=input.bundle.proof.payload,digest=proofDigest('ACTION',a);
 input.bundle.proof.signature=signProof('ACTION',a,shared.f.keys.agent);
 const q=input.bundle.proof.approval;q.payload.actionDigest=digest;q.signature=signProof('APPROVAL',q.payload,shared.f.keys.human);
 input.bundle.status.payload.actionDigest=digest;input.bundle.status.signature=crypto.sign(null,statusBytes(input.bundle.status.payload),shared.f.keys.issuer).toString('base64');
 for(const c of signatureContexts(input.bundle)){
  const edPublicKey=c.edPublicKey||shared.options.trust['synthetic-issuer'].publicKey;
  const keyId=Object.keys(shared.options.keyRegistry).find(id=>shared.options.keyRegistry[id].ed25519Key===edPublicKey);
  input.attestations[c.id]=signAttestation({...c,edPublicKey,keyId},shared.keys[keyId].secretKey,{extraEntropy:false});
  assert.equal(verifyDualSignature({...c,edPublicKey,attestation:input.attestations[c.id],registry:shared.options.keyRegistry,version:input.version,suite:input.suite,now:epoch}).valid,true);
 }
}

test('HS/2 requires both algorithms for every owner, agent and issuer proof',()=>{
 const result=inspect();assert.equal(result.decision,'ALLOW');assert.equal(result.pqVerified,true);assert.equal(result.executionAuthorized,false);
 assert.equal(HS2_LENGTHS.signature,17088);assert.equal(Object.keys(shared.input.attestations).length,6);
 for(const id of Object.keys(shared.input.attestations)){
  const absent=structuredClone(shared.input);delete absent.attestations[id];assert.equal(inspect(absent).decision,'DENY',id);
  const damaged=structuredClone(shared.input),bytes=decode64(damaged.attestations[id].signature,17088);bytes[0]^=1;damaged.attestations[id].signature=encode64(bytes);assert.equal(inspect(damaged).decision,'DENY',id);
 }
});
test('downgrades, unpinned keys, substituted registries and alternate suites deny',()=>{
 for(const mutate of [x=>x.version='1',x=>x.suite='Ed25519-OR-SLH-DSA',x=>x.suite='ML-DSA',x=>x.attestations.action.keyId='untrusted',x=>x.extra='caller-policy']){
  const input=structuredClone(shared.input);mutate(input);assert.equal(inspect(input).decision,'DENY');
 }
 for(const mutate of [x=>x.keyRegistry.agent.revoked=true,x=>x.keyRegistry.agent.notAfter=new Date(epoch).toISOString(),x=>x.keyRegistry.agent.notBefore=new Date(epoch+1).toISOString(),x=>x.keyRegistry.agent.slhDsaKey=x.keyRegistry.owner.slhDsaKey,x=>x.trust={}]){
  const options=structuredClone(shared.options);mutate(options);assert.equal(inspect(shared.input,options).decision,'DENY');
 }
});
test('PQ signatures bind classical signatures, exact bytes, roles and key IDs',()=>{
 const c=shared.contexts[0],base={...c,version:shared.input.version,suite:shared.input.suite,attestation:shared.input.attestations.action,registry:shared.options.keyRegistry,now:epoch};
 assert.equal(verifyDualSignature(base).valid,true);
 for(const change of [{kind:'DELEGATION'},{edSignature:encode64(crypto.randomBytes(64))},{classicalBytes:new Uint8Array([1,2,3])}])assert.throws(()=>verifyDualSignature({...base,...change}));
 const alias=structuredClone(shared.options.keyRegistry);alias.alias=alias.agent;
 assert.throws(()=>verifyDualSignature({...base,registry:alias,attestation:{...base.attestation,keyId:'alias'}}),/SLH_DSA_INVALID/);
});
test('even valid dual signatures cannot expand a Human delegation or substitute payload',()=>{
 for(const field of ['resource','action']){
  const input=structuredClone(shared.input),a=input.bundle.proof.payload;a[field]=field==='resource'?'draft:elsewhere':'READ_PUBLIC_SIGNALS';
  resignChangedAction(input);
  const options=structuredClone(shared.options);options.expected[field]=a[field];assert.equal(inspect(input,options).decision,'DENY');assert.deepEqual(inspect(input,options).reasonCodes,['SCOPE_MISMATCH']);
 }
 const substituted=structuredClone(shared.input);substituted.bundle.proof.payload.payloadHash='0'.repeat(64);resignChangedAction(substituted);assert.equal(inspect(substituted).decision,'DENY');
 const options=structuredClone(shared.options);options.expected.payloadHash='0'.repeat(64);assert.equal(inspect(shared.input,options).decision,'DENY');
});
test('Human-only path, owner approval and the lowest PQ key deadline remain explicit',()=>{
 const human=hybridFixture({now:epoch,performer:'HUMAN',approvalRequired:false,approve:false});assert.equal(Object.keys(human.input.attestations).length,2);assert.equal(inspect(human.input,human.options).actorClass,'VERIFIED_HUMAN');
 const waiting=hybridFixture({now:epoch,approve:false});assert.equal(inspect(waiting.input,waiting.options).decision,'REQUIRE_APPROVAL');
 const options=structuredClone(shared.options);options.keyRegistry.agent.notAfter=new Date(epoch+2000).toISOString();assert.equal(inspect(shared.input,options).validUntil,options.keyRegistry.agent.notAfter);
});
test('public historical vectors verify locally but cannot authorize live effects',async()=>{
 const vector=JSON.parse(fs.readFileSync(new URL('../web/public/hs2-vectors.json',import.meta.url),'utf8'));
 assert.equal(vector.historicalFixture,true);assert.equal(inspect(vector.input,vector.options).pqVerified,true);
 assert.equal(inspectHybridAuthority(vector.input,vector.options).decision,'DENY');
 let calls=0;assert.equal((await commitHybridAuthority(vector.input,{...vector.options,commit:()=>{calls++;return true;}})).operationCommitted,false);assert.equal(calls,0);
});
test('both verifier directories run outside the COHIBA source tree with only installed crypto dependencies',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hs2-standalone-'));
 try{
  fs.cpSync(new URL('../packages/hs2-verifier',import.meta.url),path.join(dir,'hs2-verifier'),{recursive:true});
  fs.cpSync(new URL('../packages/authority-verifier',import.meta.url),path.join(dir,'authority-verifier'),{recursive:true});
  // Reuse already installed pinned dependencies, not application source imports.
  fs.symlinkSync(new URL('../node_modules',import.meta.url).pathname,path.join(dir,'node_modules'),'dir');
  fs.copyFileSync(new URL('../web/public/hs2-vectors.json',import.meta.url),path.join(dir,'vectors.json'));
  const result=spawnSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';import {inspectHybridAuthority} from './hs2-verifier/index.mjs';const v=JSON.parse(fs.readFileSync('vectors.json'));const r=inspectHybridAuthority(v.input,{...v.options,now:Date.parse(v.evaluationTime)});if(r.decision!=='ALLOW'||!r.pqVerified||r.executionAuthorized)throw Error('STANDALONE_FAILED');"],{cwd:dir,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('HS/2 commits exact SQL once; local revocation blocks a still-live hybrid chain',{timeout:60000},async()=>{
 let pool;
 if(process.env.TEST_DATABASE_URL){const {default:pg}=await import('pg');pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});}
 else{const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let tail=Promise.resolve();pool={async connect(){let release;const previous=tail;tail=new Promise(r=>release=r);await previous;return {query:(q,a)=>!a&&q.includes('CREATE TABLE')?db.exec(q).then(()=>({rows:[]})):db.query(q,a),release};},async query(q,a){const c=await this.connect();try{return await c.query(q,a);}finally{c.release();}},end:()=>db.close()};}
 try{
  await pool.query('CREATE TABLE IF NOT EXISTS hs2_test_effects(digest text PRIMARY KEY,payload_hash text NOT NULL)');
  const gate=await createPostgresCommitGate(pool,{onCommit:async(c,x)=>{assert.equal(x.cryptoVersion,shared.input.version);await c.query('INSERT INTO hs2_test_effects VALUES($1,$2)',[x.actionDigest,x.payloadHash]);}});
  const f=hybridFixture({unique:true});const outcomes=await Promise.all(Array.from({length:4},()=>commitHybridAuthority(f.input,{...f.options,commit:gate.commit})));
  assert.equal(outcomes.filter(x=>x.operationCommitted).length,1);
  const denied=hybridFixture({unique:true});await gate.revoke({issuer:denied.input.bundle.status.payload.issuer,principalId:denied.input.bundle.proof.payload.principalId,authorityId:denied.input.bundle.delegation.id});
  assert.equal(inspectHybridAuthority(denied.input,denied.options).decision,'ALLOW');assert.equal((await commitHybridAuthority(denied.input,{...denied.options,commit:gate.commit})).operationCommitted,false);
  const missing=structuredClone(denied.input);delete missing.attestations.status;
  let calls=0;assert.equal((await commitHybridAuthority(missing,{...denied.options,commit:()=>{calls++;return true;}})).operationCommitted,false);assert.equal(calls,0);
 }finally{await pool.end();}
});
