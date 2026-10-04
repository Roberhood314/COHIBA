// Synthetic cryptographic exercise on TWO temporary databases in the isolated drill server.
// Never use a production connection: the caller supplies HS_RESTORE_DATABASE_URL only.
import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {PohaDatabase} from '../lib/poha-postgres.mjs';
import {signProof,publicKeyBase64,serviceSigningBytes,payloadDigest} from '../sdk/human-signal-node.mjs';
export async function nativeRecoveryExercise(){
 const target=process.env.HS_RESTORE_DATABASE_URL;if(!target)throw Error('ISOLATED_DATABASE_REQUIRED');
 if(process.env.HUMAN_SIGNAL_DATABASE_URL){const a=new URL(target),b=new URL(process.env.HUMAN_SIGNAL_DATABASE_URL);if(a.hostname===b.hostname&&a.port===b.port)throw Error('PRODUCTION_SERVER_NOT_ALLOWED');}
 const admin=new pg.Pool({connectionString:target}),names=['hs_probe_src_','hs_probe_dst_'].map(p=>p+crypto.randomBytes(6).toString('hex'));
 const dbs=[];let created=[];
 try{
  for(const name of names){await admin.query('CREATE DATABASE '+name);created.push(name);const u=new URL(target);u.pathname='/'+name;const db=new PohaDatabase({connectionString:u.toString()});dbs.push(db);await db.initialize();}
  const [source,clone]=dbs,human=crypto.generateKeyPairSync('ed25519'),agent=crypto.generateKeyPairSync('ed25519'),service=crypto.generateKeyPairSync('ed25519');
  const principalId='HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase(),principalKey=publicKeyBase64(human.privateKey),agentKey=publicKeyBase64(agent.privateKey),audience='https://recovery-probe.example',serviceId='restore-probe';
  const context={principalId,principalKey,audience,identityAssurance:'PHONE_VERIFIED',assuranceExpiresAt:new Date(Date.now()+300000).toISOString()};
  const common=()=>({version:'1',principalId,audience,nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+240000).toISOString()});
  await source.enrollService({id:serviceId,publicKey:publicKeyBase64(service.privateKey),audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:'});
  const bindingPayload={...common(),principalKey,agentKey,name:'Recovery test fixture'};
  const binding=await source.mutate(context,'AGENT',{payload:bindingPayload,principalSignature:signProof('AGENT_BINDING',bindingPayload,human.privateKey),agentSignature:signProof('AGENT_BINDING',bindingPayload,agent.privateKey)});
  const grant={...common(),principalKey,agentKey,bindingId:binding.id,scopes:['DRAFT_APP_ACTION'],resource:'draft:restore',approvalRequired:false,expiresAt:bindingPayload.expiresAt};
  const delegation=await source.mutate(context,'DELEGATION',{payload:grant,signature:signProof('DELEGATION',grant,human.privateKey)});
  const action={...common(),performer:'HUMAN',signerKey:principalKey,delegationId:'',action:'DRAFT_APP_ACTION',resource:'draft:restore',payloadHash:payloadDigest(Buffer.from('recovery fixture'))};
  const request={proof:{payload:action,signature:signProof('ACTION',action,human.privateKey)},action:action.action,resource:action.resource,payloadBase64:Buffer.from('recovery fixture').toString('base64')};
  const authorize=async(db,request)=>{const raw=Buffer.from(JSON.stringify(request)),time=new Date().toISOString(),nonce=crypto.randomBytes(24).toString('base64url'),signature=crypto.sign(null,serviceSigningBytes(serviceId,time,nonce,raw),service.privateKey).toString('base64');return db.authorize({id:serviceId,time,nonce,signature},raw,request,()=>context);};
  assert.equal((await authorize(source,request)).executionAuthorized,true);
  await source.mutate(context,'REVOKE',{type:'DELEGATION',id:delegation.id});
  const backup=await source.exportBackup();await clone.restoreBackup(backup);
  assert.deepEqual(JSON.parse(JSON.stringify((await clone.exportBackup()).tables)),JSON.parse(JSON.stringify(backup.tables)));
  assert.equal((await authorize(clone,request)).reasonCodes[0],'ACTION_REPLAY');
  const agentAction={...action,...common(),performer:'AGENT',signerKey:agentKey,delegationId:delegation.id};
  assert.equal((await authorize(clone,{...request,proof:{payload:agentAction,signature:signProof('ACTION',agentAction,agent.privateKey)}})).reasonCodes[0],'DELEGATION_UNAVAILABLE');
  await clone.revokePrincipal(principalId);await assert.rejects(authorize(clone,request),/PRINCIPAL_REVOKED/);
  console.log(JSON.stringify({version:'HS_NATIVE_RECOVERY_EXERCISE_V1',identityEvidence:'SYNTHETIC_FIXTURE_ONLY',separateNativeDatabases:2,tablesMatch:true,actionReplayDenied:true,revokedDelegationDenied:true,revokedPrincipalDenied:true}));
 }finally{for(const db of dbs)await db.close();for(const name of created)await admin.query('DROP DATABASE '+name);await admin.end();}
}
