import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {bindAgent} from '../lib/poha-v1.mjs';
import {PohaDatabase,serviceSigningBytes} from '../lib/poha-postgres.mjs';
import {signProof,publicKeyBase64,payloadDigest} from '../sdk/human-signal-node.mjs';

async function database(){
 if(process.env.TEST_DATABASE_URL)return new PohaDatabase({connectionString:process.env.TEST_DATABASE_URL});
 const database=new PGlite();let tail=Promise.resolve();
 // Embedded PostgreSQL has one connection. Serialize leases; real CI uses pg Pool.
 const pool={async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:async(sql,args)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:(!args&&sql.includes('CREATE TABLE')?database.exec(sql).then(()=>({rows:[]})):database.query(sql,args)),release};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}},end:()=>database.close()};
 return new PohaDatabase({pool});
}
function fixture(){
 const human=crypto.generateKeyPairSync('ed25519'),agent=crypto.generateKeyPairSync('ed25519'),service=crypto.generateKeyPairSync('ed25519');
 const principalId='HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase(),principalKey=publicKeyBase64(human.privateKey),agentKey=publicKeyBase64(agent.privateKey);
 const serviceId='svc-'+crypto.randomBytes(6).toString('hex'),audience='https://draft.example';
 const context={principalId,principalKey,audience,identityAssurance:'PHONE_VERIFIED',assuranceExpiresAt:new Date(Date.now()+60000).toISOString()};
 const common=()=>({version:'1',principalId,audience,nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
 const binding={...common(),principalKey,agentKey,name:'Outside App Agent'};
 const auth=raw=>{const time=new Date().toISOString(),nonce=crypto.randomBytes(24).toString('base64url');return {id:serviceId,time,nonce,signature:crypto.sign(null,serviceSigningBytes(serviceId,time,nonce,raw),service.privateKey).toString('base64')};};
 return {human,agent,service,serviceId,context,common,binding,auth,agentKey,principalKey};
}
test('PostgreSQL authorizes exact external actions once and serializes concurrent replay',{timeout:60000},async()=>{
 const db=await database();
 try{
  await db.initialize();const f=fixture();
  await db.enrollService({id:f.serviceId,publicKey:publicKeyBase64(f.service.privateKey),audience:f.context.audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:',requireApproval:false});
  const binding=await db.mutate(f.context,'AGENT',{payload:f.binding,principalSignature:signProof('AGENT_BINDING',f.binding,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',f.binding,f.agent.privateKey)});
  const grant={...f.common(),principalKey:f.principalKey,agentKey:f.agentKey,bindingId:binding.id,scopes:['DRAFT_APP_ACTION'],resource:'draft:one',approvalRequired:false,expiresAt:f.binding.expiresAt};
  const delegation=await db.mutate(f.context,'DELEGATION',{payload:grant,signature:signProof('DELEGATION',grant,f.human.privateKey)});
  const action={...f.common(),performer:'AGENT',signerKey:f.agentKey,delegationId:delegation.id,action:'DRAFT_APP_ACTION',resource:'draft:one',payloadHash:payloadDigest(Buffer.from('Draft'))};
  const request={action:action.action,resource:action.resource,payloadBase64:Buffer.from('Draft').toString('base64'),proof:{payload:action,signature:signProof('ACTION',action,f.agent.privateKey)}};
  const raw=Buffer.from(JSON.stringify(request));const resolve=()=>f.context;
  const wrong=Buffer.from(JSON.stringify({...request,payloadBase64:Buffer.from('Tampered').toString('base64')}));assert.equal((await db.authorize(f.auth(wrong),wrong,JSON.parse(wrong),resolve)).decision,'DENY');
  const results=await Promise.all(Array.from({length:8},()=>db.authorize(f.auth(raw),raw,request,resolve)));
  assert.equal(results.filter(r=>r.executionAuthorized).length,1);assert.equal(results.filter(r=>r.reasonCodes.includes('ACTION_REPLAY')).length,7);
  const repeatedAuth=f.auth(raw);await db.authorize(repeatedAuth,raw,request,resolve);await assert.rejects(db.authorize(repeatedAuth,raw,request,resolve),/SERVICE_REQUEST_REPLAY/);
  // Independent pg connections can acquire locks out of invocation order.
  // Wait for the blocker to HOLD the lock before enqueueing authorization.
  let entered,unlock;const locked=new Promise(r=>entered=r),release=new Promise(r=>unlock=r);
  const blocked=db.transaction(f.context.principalId,async()=>{entered();await release;});await locked;
  let afterWait;
  try{
   const short={...action,nonce:crypto.randomBytes(24).toString('base64url'),expiresAt:new Date(Date.now()+30).toISOString()};
   const shortRequest={...request,proof:{payload:short,signature:signProof('ACTION',short,f.agent.privateKey)}};const shortRaw=Buffer.from(JSON.stringify(shortRequest));
   afterWait=db.authorize(f.auth(shortRaw),shortRaw,shortRequest,resolve);
   while(Date.now()<=Date.parse(short.expiresAt))await new Promise(r=>setTimeout(r,10));
  }finally{unlock();await blocked;}
  assert.equal((await afterWait).decision,'DENY');
  // A new nonce remains valid only until authoritative revocation commits.
  await db.mutate(f.context,'REVOKE',{type:'DELEGATION',id:delegation.id});
  action.nonce=crypto.randomBytes(24).toString('base64url');request.proof.signature=signProof('ACTION',action,f.agent.privateKey);const revokedRaw=Buffer.from(JSON.stringify(request));
  const revoked=await db.authorize(f.auth(revokedRaw),revokedRaw,request,resolve);assert.equal(revoked.reasonCodes[0],'DELEGATION_UNAVAILABLE');
  const stored=await db.snapshot();assert.ok(stored.pohaDelegations.some(d=>d.id===delegation.id&&d.revokedAt));
  await db.revokePrincipal(f.context.principalId);await assert.rejects(db.authorize(f.auth(revokedRaw),revokedRaw,request,resolve),/PRINCIPAL_REVOKED/);
 }finally{await db.close();}
});

test('PostgreSQL backup restores authorization and replay ledger into an empty database',{timeout:60000},async()=>{
 const original=await database();let clone,cleanup=async()=>{};
 if(process.env.TEST_DATABASE_URL){
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL}),name='hs_restore_'+crypto.randomBytes(6).toString('hex');
  await admin.query('CREATE DATABASE '+name);const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+name;
  clone=new PohaDatabase({connectionString:url.toString()});cleanup=async()=>{await admin.query('DROP DATABASE '+name);await admin.end();};
 }else{
  const cloneEngine=new PGlite();clone=new PohaDatabase({pool:{connect:async()=>({query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):(!args&&sql.includes('CREATE TABLE')?cloneEngine.exec(sql).then(()=>({rows:[]})):cloneEngine.query(sql,args)),release(){}}),end:()=>cloneEngine.close()}});
 }
 try{
  await original.initialize();await clone.initialize();const f=fixture();
  await original.enrollService({id:f.serviceId,publicKey:publicKeyBase64(f.service.privateKey),audience:f.context.audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:',requireApproval:false});
  await original.mutate(f.context,'AGENT',{payload:f.binding,principalSignature:signProof('AGENT_BINDING',f.binding,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',f.binding,f.agent.privateKey)});
  const action={...f.common(),performer:'HUMAN',signerKey:f.principalKey,delegationId:'',action:'DRAFT_APP_ACTION',resource:'draft:backup',payloadHash:payloadDigest(Buffer.from('Backup draft'))};
  const request={action:action.action,resource:action.resource,payloadBase64:Buffer.from('Backup draft').toString('base64'),proof:{payload:action,signature:signProof('ACTION',action,f.human.privateKey)}};
  const raw=Buffer.from(JSON.stringify(request));assert.equal((await original.authorize(f.auth(raw),raw,request,()=>f.context)).executionAuthorized,true);
  const records=await original.listing(f.context.principalId);await original.mutate(f.context,'REVOKE',{type:'AGENT',id:records.pohaAgents[0].id});
  const backup=await original.exportBackup();await clone.restoreBackup(backup);assert.ok((await clone.listing(f.context.principalId)).pohaAgents[0].revokedAt);assert.deepEqual((await clone.exportBackup()).tables,backup.tables);assert.equal((await clone.authorize(f.auth(raw),raw,request,()=>f.context)).reasonCodes[0],'ACTION_REPLAY');await assert.rejects(clone.restoreBackup(backup),/RESTORE_DATABASE_NOT_EMPTY/);}finally{await original.close();await clone.close();await cleanup();}
});

test('resumable JSON import discovers later records and never restores revoked authority',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();await db.importLegacy({});const f=fixture();
  const record=bindAgent({},f.context,{payload:f.binding,principalSignature:signProof('AGENT_BINDING',f.binding,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',f.binding,f.agent.privateKey)});
  await db.importLegacy({pohaAgents:[record]});assert.ok((await db.listing(f.context.principalId)).pohaAgents.some(r=>r.id===record.id));
  await db.mutate(f.context,'REVOKE',{type:'AGENT',id:record.id});await db.importLegacy({pohaAgents:[record]});assert.ok((await db.listing(f.context.principalId)).pohaAgents[0].revokedAt);
 }finally{await db.close();}
});
