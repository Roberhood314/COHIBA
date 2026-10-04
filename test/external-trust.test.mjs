import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
import {signProof,publicKeyBase64} from '../sdk/human-signal-node.mjs';
import {inspectAuthority,proofDigest,sha256,publicDecision} from '../packages/authority-verifier/index.mjs';
import {createAuthorityIssuer} from '../packages/authority-verifier/issuer.mjs';
import {createExternalService} from '../examples/external-trust-service/service.mjs';
import {createIssuerService} from '../examples/external-trust-service/issuer-service.mjs';
import {createPohaAuthorityIssuer} from '../lib/external-authority-issuer.mjs';
import {PohaDatabase} from '../lib/poha-postgres.mjs';
function trustFor(f,issuer,keyId='current'){return {[issuer]:{enabled:true,acceptedAssurances:['PHONE_VERIFIED'],allowedAudiences:[f.bundle.expected.audience],minimumEpoch:1,keys:[{id:keyId,publicKey:publicKeyBase64(f.keys.issuer),notBefore:new Date(Date.now()-60000).toISOString(),notAfter:new Date(Date.now()+600000).toISOString(),revoked:false}]}};}
function snapshot(f){return {principalId:f.bundle.proof.payload.principalId,principalKey:f.context.principalKey,identityAssurance:'PHONE_VERIFIED',assuranceExpiresAt:new Date(Date.now()+60000).toISOString(),credentialEpoch:1,principalRevoked:false,binding:f.bundle.binding,delegation:f.bundle.delegation,bindingRevoked:false,delegationRevoked:false,phone:'PRIVATE_PHONE',health:'PRIVATE_HEALTH'};}
async function pool(){
 if(process.env.TEST_DATABASE_URL)return new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:8,connectionTimeoutMillis:5000,statement_timeout:10000});
 const db=new PGlite();let tail=Promise.resolve();
 return {async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):!args&&sql.includes('CREATE TABLE')?db.exec(sql).then(()=>({rows:[]})):db.query(sql,args),release};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}},end:()=>db.close()};
}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function stop(server){server.closeAllConnections();await new Promise(r=>server.close(r));}

test('issuer trust key lifetime, revocation, rotation and missing snapshots fail closed',async()=>{
 const f=fixture(),issuer='external-issuer',state=snapshot(f);
 const service=createAuthorityIssuer({issuer,keyId:'current',privateKey:f.keys.issuer,allowedAudiences:[f.bundle.expected.audience],resolveSnapshot:async()=>state});
 const bundle=await service.issue({proof:f.bundle.proof,challenge:f.bundle.expected.challenge,audience:f.bundle.expected.audience});
 const trust=trustFor(f,issuer);const inspect=t=>inspectAuthority({...bundle,trust:t,expected:f.bundle.expected});
 assert.equal(inspect(trust).actorClass,'AUTHORIZED_AGENT');
 assert.ok(!JSON.stringify(bundle).includes(state.phone)&&!JSON.stringify(bundle).includes(state.health));
 for(const change of [t=>t[issuer].enabled=false,t=>t[issuer].keys[0].revoked=true,t=>t[issuer].keys[0].notAfter=new Date(Date.now()-1).toISOString(),t=>t[issuer].keys[0].notBefore=new Date(Date.now()+60000).toISOString(),t=>t[issuer].allowedAudiences=['https://other.example'],t=>t[issuer].minimumEpoch=2,t=>t[issuer].keys[0].publicKey=publicKeyBase64(crypto.generateKeyPairSync('ed25519').privateKey)]){const t=structuredClone(trust);change(t);assert.equal(inspect(t).decision,'DENY');}
 const nextKey=crypto.generateKeyPairSync('ed25519').privateKey;
 const rotated=createAuthorityIssuer({issuer,keyId:'next',privateKey:nextKey,allowedAudiences:[f.bundle.expected.audience],resolveSnapshot:async()=>state});
 const next=await rotated.issue({proof:f.bundle.proof,challenge:f.bundle.expected.challenge,audience:f.bundle.expected.audience});
 assert.equal(inspectAuthority({...next,trust,expected:f.bundle.expected}).decision,'DENY');
 trust[issuer].keys.push({...trust[issuer].keys[0],id:'next',publicKey:publicKeyBase64(nextKey)});trust[issuer].keys[0].revoked=true;
 assert.equal(inspectAuthority({...next,trust,expected:f.bundle.expected}).decision,'ALLOW');assert.equal(inspect(trust).decision,'DENY');
 state.delegationRevoked=true;await assert.rejects(service.issue({proof:f.bundle.proof,challenge:f.bundle.expected.challenge,audience:f.bundle.expected.audience}),/ISSUER_AUTHORITY_DENIED/);
 delete state.delegationRevoked;await assert.rejects(service.issue({proof:f.bundle.proof,challenge:f.bundle.expected.challenge,audience:f.bundle.expected.audience}),/INCOMPLETE_AUTHORITY_SNAPSHOT/);
});

test('optional PoHA issuer reads authoritative storage and refuses committed revocation',{timeout:60000},async()=>{
 const connection=await pool(),db=new PohaDatabase({pool:connection});try{
  await db.initialize();const f=fixture();
  // Unique subject and nonce isolate this test from shared native CI fixtures.
  const id='HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase(),context={...f.context,principalId:id,assuranceExpiresAt:new Date(Date.now()+60000).toISOString()};
  const b={...f.bundle.binding.payload,principalId:id,nonce:crypto.randomBytes(24).toString('base64url')};
  const binding=await db.mutate(context,'AGENT',{payload:b,principalSignature:signProof('AGENT_BINDING',b,f.keys.human),agentSignature:signProof('AGENT_BINDING',b,f.keys.agent)});
  const d={...f.bundle.delegation.payload,principalId:id,bindingId:binding.id,nonce:crypto.randomBytes(24).toString('base64url')};
  const delegation=await db.mutate(context,'DELEGATION',{payload:d,signature:signProof('DELEGATION',d,f.keys.human)});
  const a={...f.bundle.proof.payload,principalId:id,delegationId:delegation.id,nonce:crypto.randomBytes(24).toString('base64url')},proof={payload:a,signature:signProof('ACTION',a,f.keys.agent)};
  const issuer=createPohaAuthorityIssuer({database:db,resolveContext:()=>context,issuer:'storage-issuer',keyId:'current',privateKey:f.keys.issuer,allowedAudiences:[context.audience]});
  const bundle=await issuer.issue({proof,audience:context.audience,challenge:f.bundle.expected.challenge});
  assert.equal(inspectAuthority({...bundle,trust:trustFor(f,'storage-issuer'),expected:f.bundle.expected}).decision,'ALLOW');
  await db.mutate(context,'REVOKE',{type:'DELEGATION',id:delegation.id});
  await assert.rejects(issuer.issue({proof,audience:context.audience,challenge:f.bundle.expected.challenge}),/ISSUER_AUTHORITY_DENIED/);
 }finally{await db.close();}
});

test('separate HTTP issuer and service verify locally and queue one action atomically',{timeout:60000},async()=>{
 const connection=await pool();let external,issuerServer;
 try{
  const f=fixture(),issuer='issuer-'+crypto.randomBytes(5).toString('hex'),text='SYNTHETIC APPLICATION ACTION';
  const d=f.bundle.delegation.payload;d.resource='draft:external-note';f.bundle.delegation.signature=signProof('DELEGATION',d,f.keys.human);f.bundle.delegation.id='DELEGATION-'+proofDigest('DELEGATION',d);
  const a=f.bundle.proof.payload;a.delegationId=f.bundle.delegation.id;a.resource=d.resource;a.payloadHash=sha256(Buffer.from(text));a.nonce=crypto.randomBytes(24).toString('base64url');f.bundle.proof.signature=signProof('ACTION',a,f.keys.agent);
  const state=snapshot(f),authority=createAuthorityIssuer({issuer,keyId:'current',privateKey:f.keys.issuer,allowedAudiences:[a.audience],resolveSnapshot:async()=>state});
  issuerServer=createIssuerService(authority);const issuerUrl=await listen(issuerServer);
  external=await createExternalService({pool:connection,audience:a.audience,trust:trustFor(f,issuer)});const externalUrl=await listen(external);
  const challenge=await (await fetch(externalUrl+'/challenge')).json();
  const issued=await fetch(issuerUrl+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({proof:f.bundle.proof,challenge:challenge.challenge,audience:a.audience})});assert.equal(issued.status,200);
  const bundle=(await issued.json()).bundle;assert.ok(!JSON.stringify(bundle).includes('PRIVATE_PHONE'));
  const input={bundle,payloadBase64:Buffer.from(text).toString('base64'),challenge:challenge.challenge};
  const submit=body=>fetch(externalUrl+'/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const tampered=await submit({...input,payloadBase64:Buffer.from('TAMPERED').toString('base64')});assert.equal(tampered.status,403);
  const replies=await Promise.all(Array.from({length:6},()=>submit(input)));assert.equal(replies.filter(r=>r.status===201).length,1);
  const successful=await replies.find(r=>r.status===201).json();
  for(const key of [f.context.principalKey,f.bundle.proof.payload.principalId,issuer,'PRIVATE_PHONE','PRIVATE_HEALTH'])assert.ok(!JSON.stringify(successful).includes(key));
  const rows=await connection.query('SELECT payload FROM hs_external_outbox WHERE action_digest=$1',[proofDigest('ACTION',a)]);assert.equal(rows.rows.length,1);assert.equal(Buffer.from(rows.rows[0].payload).toString(),text);
  // Failed business persistence must not consume any replay state.
  const {createPostgresReplayStore}=await import('../packages/authority-verifier/postgres-adapter.mjs');const consume=await createPostgresReplayStore(connection);
  const x={issuer,principalId:a.principalId,credentialEpoch:1,signerKey:a.signerKey,actionNonce:crypto.randomBytes(24).toString('base64url'),actionDigest:'a'.repeat(64),challenge:crypto.randomBytes(24).toString('base64url'),audience:a.audience,approval:null,validUntil:new Date(Date.now()+10000).toISOString()};
  await assert.rejects(consume(x,{onAdmit:()=>{throw Error('OUTBOX_FAILURE');}}),/OUTBOX_FAILURE/);
  assert.equal((await connection.query('SELECT 1 FROM hs_verifier_actions WHERE signer_key=$1 AND nonce=$2',[x.signerKey,x.actionNonce])).rows.length,0);
  assert.deepEqual(Object.keys(publicDecision({actorClass:'AUTHORIZED_AGENT',decision:'ALLOW',executionAuthorized:true,reasonCodes:[],principalId:'PRIVATE_ID'})).sort(),['actorClass','decision','executionAuthorized','reasonCodes'].sort());
 }finally{if(external)await stop(external);if(issuerServer)await stop(issuerServer);await connection.end();}
});
