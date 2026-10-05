import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {bindAgent} from '../lib/poha-v1.mjs';
import {PohaDatabase,serviceSigningBytes} from '../lib/poha-postgres.mjs';
import {signProof,publicKeyBase64,payloadDigest,proofDigest} from '../sdk/human-signal-node.mjs';

async function database({embedded=false}={}){
 if(process.env.TEST_DATABASE_URL&&!embedded)return new PohaDatabase({connectionString:process.env.TEST_DATABASE_URL});
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
async function signedDraft(db){
 const f=fixture();await db.enrollService({id:f.serviceId,publicKey:publicKeyBase64(f.service.privateKey),audience:f.context.audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:',requireApproval:false});
 const text='Production scope: a signed local draft';
 const action={...f.common(),performer:'HUMAN',signerKey:f.principalKey,delegationId:'',action:'DRAFT_APP_ACTION',resource:'draft:production',payloadHash:payloadDigest(Buffer.from(text))};
 const request={action:action.action,resource:action.resource,payloadBase64:Buffer.from(text).toString('base64'),proof:{payload:action,signature:signProof('ACTION',action,f.human.privateKey)}};
 const raw=Buffer.from(JSON.stringify(request));return {...f,text,action,request,raw};
}

test('SI commits exact signed draft and replay ledger once in one durable transaction',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();const f=await signedDraft(db);
  const changed={...f.request,payloadBase64:Buffer.from('substituted').toString('base64')},changedRaw=Buffer.from(JSON.stringify(changed));
  assert.equal((await db.commitDraft(f.auth(changedRaw),changedRaw,changed,()=>f.context)).decision,'DENY');
  const results=await Promise.all(Array.from({length:8},()=>db.commitDraft(f.auth(f.raw),f.raw,f.request,()=>f.context)));
  assert.equal(results.filter(r=>r.executionAuthorized).length,1);assert.equal(results.filter(r=>r.idempotentReplay).length,7);
  assert.ok(results.every(r=>r.effectCommitted===true&&r.effectAtomicity==='POSTGRES_TRANSACTION'));
  const rows=(await db.pool.query("SELECT document FROM hs_effects WHERE document->>'principalId'=$1",[f.context.principalId])).rows;assert.equal(rows.length,1);assert.equal(Buffer.from(rows[0].document.payloadBase64,'base64').toString(),f.text);
  assert.equal((await db.pool.query('SELECT digest FROM hs_actions WHERE principal_id=$1',[f.context.principalId])).rows.length,1);
  const backup=await db.exportBackup(),clone=await database({embedded:true});try{await clone.initialize();await clone.restoreBackup(backup);assert.deepEqual((await clone.exportBackup()).tables,backup.tables);assert.equal((await clone.commitDraft(f.auth(f.raw),f.raw,f.request,()=>f.context)).idempotentReplay,true);}finally{await clone.close();}
 }finally{await db.close();}
});

test('SI effect write failure rolls back nonce, receipt and service authentication together',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();const f=await signedDraft(db),auth=f.auth(f.raw),transaction=db.transaction.bind(db);
  db.transaction=(id,fn)=>transaction(id,c=>fn({query(sql,args){if(sql.startsWith('INSERT INTO hs_effects'))throw Error('INJECTED_EFFECT_FAILURE');return c.query(sql,args);}}));
  await assert.rejects(db.commitDraft(auth,f.raw,f.request,()=>f.context),/INJECTED_EFFECT_FAILURE/);
  db.transaction=transaction;
  assert.equal((await db.pool.query("SELECT 1 FROM hs_effects WHERE document->>'principalId'=$1",[f.context.principalId])).rows.length,0);
  assert.equal((await db.pool.query('SELECT 1 FROM hs_actions WHERE principal_id=$1',[f.context.principalId])).rows.length,0);
  assert.equal((await db.pool.query('SELECT 1 FROM hs_service_nonces WHERE service_id=$1',[f.serviceId])).rows.length,0);
  assert.equal((await db.commitDraft(auth,f.raw,f.request,()=>f.context)).effectCommitted,true);
 }finally{await db.close();}
});

test('database deferred expiry prevents a stale effect at COMMIT',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();const f=await signedDraft(db);
  f.request.proof.payload.expiresAt=new Date(Date.now()+1500).toISOString();
  f.request.proof.signature=signProof('ACTION',f.request.proof.payload,f.human.privateKey);const raw=Buffer.from(JSON.stringify(f.request));
  const transaction=db.transaction.bind(db);
  db.transaction=(id,fn)=>transaction(id,async c=>{const result=await fn(c);await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(f.request.proof.payload.expiresAt)-Date.now()+10)));return result;});
  await assert.rejects(db.commitDraft(f.auth(raw),raw,f.request,()=>f.context),/PROOF_EXPIRED_AT_COMMIT/);
  db.transaction=transaction;
  assert.equal((await db.pool.query('SELECT 1 FROM hs_actions WHERE principal_id=$1',[f.context.principalId])).rows.length,0);
  assert.equal((await db.pool.query("SELECT 1 FROM hs_effects WHERE document->>'principalId'=$1",[f.context.principalId])).rows.length,0);
 }finally{await db.close();}
});

test('commit deadline cannot outlive fresh human approval or identity assurance',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();const transaction=db.transaction.bind(db);
  for(const kind of ['APPROVAL','ASSURANCE']){
   const f=await signedDraft(db),deadline=new Date(Date.now()+1500).toISOString();
   if(kind==='ASSURANCE')f.context.assuranceExpiresAt=deadline;
   else{
    const approval={...f.common(),principalKey:f.principalKey,expiresAt:deadline,actionDigest:proofDigest('ACTION',f.request.proof.payload)};
    f.request.proof.approval={payload:approval,signature:signProof('APPROVAL',approval,f.human.privateKey)};
   }
   const raw=Buffer.from(JSON.stringify(f.request));
   db.transaction=(id,fn)=>transaction(id,async c=>{const result=await fn(c);await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(deadline)-Date.now()+10)));return result;});
   await assert.rejects(db.commitDraft(f.auth(raw),raw,f.request,()=>f.context),/PROOF_EXPIRED_AT_COMMIT/);
   db.transaction=transaction;
   assert.equal((await db.pool.query('SELECT 1 FROM hs_actions WHERE principal_id=$1',[f.context.principalId])).rows.length,0);
  }
 }finally{await db.close();}
});

test('SI draft commit rejects revoked identity and unsupported effect classes',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();const f=await signedDraft(db);
  const unsupported={...f.request,action:'READ_PUBLIC_SIGNALS'},raw=Buffer.from(JSON.stringify(unsupported));
  assert.equal((await db.commitDraft(f.auth(raw),raw,unsupported,()=>f.context)).reasonCodes[0],'UNSUPPORTED_PROTECTED_EFFECT');
  let first=true;
  await assert.rejects(db.commitDraft(f.auth(f.raw),f.raw,f.request,()=>{if(first){first=false;return f.context;}return {...f.context,identityAssurance:'NONE'};}),/IDENTITY_CHANGED_RETRY/);
  assert.equal((await db.pool.query("SELECT 1 FROM hs_effects WHERE document->>'principalId'=$1",[f.context.principalId])).rows.length,0);
  await db.commitDraft(f.auth(f.raw),f.raw,f.request,()=>f.context);await db.revokePrincipal(f.context.principalId);
  await assert.rejects(db.commitDraft(f.auth(f.raw),f.raw,f.request,()=>f.context),/PRINCIPAL_REVOKED/);
 }finally{await db.close();}
});

test('Draft Board HTTP uses authoritative atomic commit and idempotent retries',{timeout:60000},async()=>{
 const {createServer}=await import('node:http'),{spawn}=await import('node:child_process'),{once}=await import('node:events');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hs-draft-commit-')),db=await database({embedded:true});
 let child,upstream;try{
  await db.initialize();const f=fixture();
  upstream=createServer(async(req,res)=>{
   try{
    res.setHeader('content-type','application/json');
    if(req.url==='/api/v1/sovereignty/status'){res.end(JSON.stringify({ok:true,localDraftCommitEnabled:true}));return;}
    assert.equal(req.url,'/api/v1/actions/commit-draft');
    let raw='';for await(const chunk of req)raw+=chunk;
    const auth={id:req.headers['x-hs-service-id'],time:req.headers['x-hs-time'],nonce:req.headers['x-hs-nonce'],signature:req.headers['x-hs-signature']};
    const result=await db.commitDraft(auth,Buffer.from(raw),JSON.parse(raw),()=>f.context);res.end(JSON.stringify({ok:true,result}));
   }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
  });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
  child=spawn(process.execPath,['examples/draft-board/server.mjs'],{env:{...process.env,PORT:String(port),DRAFT_BOARD_DATA_DIR:dir,HUMAN_SIGNAL_API_URL:`http://127.0.0.1:${upstream.address().port}`},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),10000);child.stdout.on('data',b=>{if(b.toString().includes('listening')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('early exit'));});});
  const origin=`http://127.0.0.1:${port}`,health=await fetch(origin+'/health').then(r=>r.json());assert.equal(health.commitMode,'ATOMIC_LOCAL_DRAFT');
  await db.enrollService({id:'draft-board',publicKey:health.servicePublicKey,audience:f.context.audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:',requireApproval:false});
  const text='Signed draft through HTTP',resource='draft:http';
  const action={...f.common(),performer:'HUMAN',signerKey:f.principalKey,delegationId:'',action:'DRAFT_APP_ACTION',resource,payloadHash:payloadDigest(Buffer.from(text))};
  const input={text,resource,proof:{payload:action,signature:signProof('ACTION',action,f.human.privateKey)}};
  const post=x=>fetch(origin+'/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(x)});
  const saved=await post(input);assert.equal(saved.status,201);assert.equal((await saved.json()).saved,true);
  const again=await post(input);assert.equal(again.status,200);assert.equal((await again.json()).result.idempotentReplay,true);
  assert.equal((await post({...input,text:'substitution'})).status,403);
  assert.equal((await db.pool.query('SELECT 1 FROM hs_effects')).rows.length,1);
  await db.revokePrincipal(f.context.principalId);assert.equal((await post(input)).status,403);
 }finally{
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  if(upstream)await new Promise(r=>upstream.close(r));await db.close();await fs.rm(dir,{recursive:true,force:true});
 }
});
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
  assert.equal(results.filter(r=>r.executionAuthorized).length,1);
  const admitted=results.find(r=>r.executionAuthorized);assert.equal(admitted.sovereignty.authorityClass,'ED25519_POHA');assert.equal(admitted.sovereignty.executionAuthorized,false);assert.match(admitted.sovereignty.decisionDigest,/^[a-f0-9]{64}$/);assert.equal(results.filter(r=>r.reasonCodes.includes('ACTION_REPLAY')).length,7);
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
 const original=await database();const cloneEngine=new PGlite();
 const clone=new PohaDatabase({pool:{connect:async()=>({query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):(!args&&sql.includes('CREATE TABLE')?cloneEngine.exec(sql).then(()=>({rows:[]})):cloneEngine.query(sql,args)),release(){}}),end:()=>cloneEngine.close()}});
 try{
  await original.initialize();await clone.initialize();const f=fixture();
  await original.enrollService({id:f.serviceId,publicKey:publicKeyBase64(f.service.privateKey),audience:f.context.audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:',requireApproval:false});
  await original.mutate(f.context,'AGENT',{payload:f.binding,principalSignature:signProof('AGENT_BINDING',f.binding,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',f.binding,f.agent.privateKey)});
  const action={...f.common(),performer:'HUMAN',signerKey:f.principalKey,delegationId:'',action:'DRAFT_APP_ACTION',resource:'draft:backup',payloadHash:payloadDigest(Buffer.from('Backup draft'))};
  const request={action:action.action,resource:action.resource,payloadBase64:Buffer.from('Backup draft').toString('base64'),proof:{payload:action,signature:signProof('ACTION',action,f.human.privateKey)}};
  const raw=Buffer.from(JSON.stringify(request));assert.equal((await original.authorize(f.auth(raw),raw,request,()=>f.context)).executionAuthorized,true);
  const backup=await original.exportBackup();await clone.restoreBackup(backup);assert.deepEqual((await clone.exportBackup()).tables,backup.tables);assert.equal((await clone.authorize(f.auth(raw),raw,request,()=>f.context)).reasonCodes[0],'ACTION_REPLAY');await assert.rejects(clone.restoreBackup(backup),/RESTORE_DATABASE_NOT_EMPTY/);}finally{await original.close();await clone.close();}
});

test('resumable JSON import discovers later records and never restores revoked authority',{timeout:60000},async()=>{
 const db=await database();try{
  await db.initialize();await db.importLegacy({});const f=fixture();
  const record=bindAgent({},f.context,{payload:f.binding,principalSignature:signProof('AGENT_BINDING',f.binding,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',f.binding,f.agent.privateKey)});
  await db.importLegacy({pohaAgents:[record]});assert.ok((await db.listing(f.context.principalId)).pohaAgents.some(r=>r.id===record.id));
  await db.mutate(f.context,'REVOKE',{type:'AGENT',id:record.id});await db.importLegacy({pohaAgents:[record]});assert.ok((await db.listing(f.context.principalId)).pohaAgents[0].revokedAt);
 }finally{await db.close();}
});

test('PoHA disclosure integration releases exact local bytes only after authoritative consent',{timeout:60000},async()=>{
 const {LocalDisclosureGateway,signDisclosure,DISCLOSURE_VERSION,grantId,nonce,interval}=await import('../lib/private-disclosure.mjs');
 const {PohaDisclosureGateway,DISCLOSURE_POLICY_VERSION}=await import('../lib/poha-disclosure.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hs-integrated-'));
 const db=await database();
 try{
  await db.initialize();const f=fixture();
  const policy={version:DISCLOSURE_POLICY_VERSION,endpoint:'mock://wellness/v1',model:'mock-wellness-v1',purpose:'GENERAL_WELLNESS',maxBytes:4096};
  const service={id:f.serviceId,publicKey:publicKeyBase64(f.service.privateKey),audience:f.context.audience,scopes:['DRAFT_APP_ACTION'],resourcePrefix:'draft:',requireApproval:false,disclosurePolicy:policy};
  await assert.rejects(db.enrollService({...service,disclosurePolicy:{...policy,endpoint:'https://evil.example'}}),/INVALID_DISCLOSURE_POLICY/);
  await db.enrollService(service);
  const binding=await db.mutate(f.context,'AGENT',{payload:f.binding,principalSignature:signProof('AGENT_BINDING',f.binding,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',f.binding,f.agent.privateKey)});
  const delegationPayload={...f.common(),principalKey:f.principalKey,agentKey:f.agentKey,bindingId:binding.id,scopes:['DRAFT_APP_ACTION'],resource:'draft:privacy',approvalRequired:false,expiresAt:f.binding.expiresAt};
  const delegation=await db.mutate(f.context,'DELEGATION',{payload:delegationPayload,signature:signProof('DELEGATION',delegationPayload,f.human.privateKey)});
  const grantPayload={version:DISCLOSURE_VERSION,principalKey:f.principalKey,agentKey:f.agentKey,purpose:policy.purpose,endpoint:policy.endpoint,model:policy.model,allowedFields:['activityBand','ageBand','dietaryNeeds'],approvalFields:['dietaryNeeds'],maxBytes:4096,maxRequests:2,nonce:nonce(),...interval()};
  const grant={payload:grantPayload,signature:signDisclosure('GRANT',grantPayload,f.human.privateKey)};
  const local=new LocalDisclosureGateway({principalKey:f.principalKey,vault:{name:'DO NOT SEND',ageYears:36,activityBand:'moderate',dietaryNeeds:['vegetarian']},ledgerFile:path.join(dir,'ledger.json')});
  const gateway=new PohaDisclosureGateway({localGateway:local,database:db});
  const make=(fields,consent=false)=>{
   const proposal={fields},preview=gateway.preview(grant,proposal);
   const a={version:DISCLOSURE_VERSION,grantId:grantId(grantPayload),agentKey:f.agentKey,requestDigest:preview.requestDigest,nonce:nonce(),...interval()};
   const input={grant,proposal,action:{payload:a,signature:signDisclosure('ACTION',a,f.agent.privateKey)}};
   const payloadBytes=Buffer.from(JSON.stringify(preview.manifest));
   const p={...f.common(),performer:'AGENT',signerKey:f.agentKey,delegationId:delegation.id,action:'DRAFT_APP_ACTION',resource:'draft:privacy',payloadHash:payloadDigest(payloadBytes),nonce:a.nonce};
   const request={action:p.action,resource:p.resource,payloadBase64:payloadBytes.toString('base64'),proof:{payload:p,signature:signProof('ACTION',p,f.agent.privateKey)}};
   if(consent){
    const q={version:DISCLOSURE_VERSION,principalKey:f.principalKey,grantId:grantId(grantPayload),requestDigest:preview.requestDigest,agentNonce:a.nonce,nonce:nonce(),...interval()};
    input.approval={payload:q,signature:signDisclosure('APPROVAL',q,f.human.privateKey)};
   }
   return {input,request};
  };
  const call=async x=>{const raw=Buffer.from(JSON.stringify(x.request));return gateway.execute({...x,raw,auth:f.auth(raw),resolveContext:()=>f.context});};
  // Distinct action nonces still share one atomic grant budget across instances.
  const concurrentGrantPayload={...grantPayload,maxRequests:1,nonce:nonce()};
  const concurrentGrant={payload:concurrentGrantPayload,signature:signDisclosure('GRANT',concurrentGrantPayload,f.human.privateKey)};
  const template=make(['ageBand']);
  const concurrent=await Promise.all(Array.from({length:8},async()=>{
   const manifest={...JSON.parse(Buffer.from(template.request.payloadBase64,'base64')),grant:concurrentGrant};
   const payloadBase64=Buffer.from(JSON.stringify(manifest)).toString('base64');
   const p={...template.request.proof.payload,nonce:nonce(),payloadHash:payloadDigest(Buffer.from(payloadBase64,'base64'))};
   const request={...template.request,payloadBase64,proof:{payload:p,signature:signProof('ACTION',p,f.agent.privateKey)}};
   const raw=Buffer.from(JSON.stringify(request));return db.authorize(f.auth(raw),raw,request,()=>f.context);
  }));
  assert.equal(concurrent.filter(r=>r.executionAuthorized).length,1);
  assert.equal(concurrent.filter(r=>r.reasonCodes.includes('DISCLOSURE_BUDGET_EXCEEDED')).length,7);
  const ordinary=make(['ageBand']);
  const altered=structuredClone(ordinary);altered.request.payloadBase64=Buffer.from('{}').toString('base64');
  await assert.rejects(call(altered),/DISCLOSURE_REQUEST_MISMATCH/);assert.equal(local.capturedRequests().length,0);
  const out=await call(ordinary);assert.equal(out.sent,true);assert.equal(out.receipt.actorClass,'AUTHORIZED_AGENT');
  assert.equal(out.receipt.disclosurePolicyVersion,DISCLOSURE_POLICY_VERSION);
  assert.equal((await call(ordinary)).sent,false);assert.equal(local.capturedRequests().length,1);
  const sensitive=make(['dietaryNeeds'],true);
  const needsApproval=await call(sensitive);assert.equal(needsApproval.disclosureDecision,'HUMAN_APPROVAL_REQUIRED');assert.equal(local.capturedRequests().length,1);
  const approve={...f.common(),principalKey:f.principalKey,actionDigest:(await import('../lib/poha-v1.mjs')).proofDigest('ACTION',sensitive.request.proof.payload)};
  sensitive.request.proof.approval={payload:approve,signature:signProof('APPROVAL',approve,f.human.privateKey)};
  assert.equal((await call(sensitive)).sent,true);
  assert.deepEqual(local.capturedRequests().map(JSON.parse),[
   {facts:{ageBand:'30-44'},model:policy.model,task:policy.purpose},
   {facts:{dietaryNeeds:['vegetarian']},model:policy.model,task:policy.purpose}
  ]);
  // A second profile bound to the same owner key must not reset the budget.
  const aliasContext={...f.context,principalId:'HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase()};
  const aliasBindingPayload={...f.binding,principalId:aliasContext.principalId,nonce:nonce()};
  const aliasBinding=await db.mutate(aliasContext,'AGENT',{payload:aliasBindingPayload,principalSignature:signProof('AGENT_BINDING',aliasBindingPayload,f.human.privateKey),agentSignature:signProof('AGENT_BINDING',aliasBindingPayload,f.agent.privateKey)});
  const aliasDelegationPayload={...delegationPayload,principalId:aliasContext.principalId,bindingId:aliasBinding.id,nonce:nonce()};
  const aliasDelegation=await db.mutate(aliasContext,'DELEGATION',{payload:aliasDelegationPayload,signature:signProof('DELEGATION',aliasDelegationPayload,f.human.privateKey)});
  const aliasAction={...ordinary.request.proof.payload,principalId:aliasContext.principalId,delegationId:aliasDelegation.id,nonce:nonce()};
  const aliasRequest={...ordinary.request,proof:{payload:aliasAction,signature:signProof('ACTION',aliasAction,f.agent.privateKey)}};
  const aliasRaw=Buffer.from(JSON.stringify(aliasRequest));
  assert.equal((await db.authorize(f.auth(aliasRaw),aliasRaw,aliasRequest,()=>aliasContext)).reasonCodes[0],'DISCLOSURE_BUDGET_EXCEEDED');
  const backup=await db.exportBackup();const ledger=backup.tables.hs_state_documents.find(r=>r.id==='disclosure-key:'+f.principalKey);
  assert.equal(ledger.document.counts[grantId(grantPayload)],2);assert.ok(!JSON.stringify(ledger).includes('vegetarian'));
  const restoredEngine=new PGlite();
  const restored=new PohaDatabase({pool:{connect:async()=>({query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):(!args&&sql.includes('CREATE TABLE')?restoredEngine.exec(sql).then(()=>({rows:[]})):restoredEngine.query(sql,args)),release(){}}),end:()=>restoredEngine.close()}});
  try{
   await restored.initialize();await restored.restoreBackup(backup);
   assert.deepEqual((await restored.exportBackup()).tables,backup.tables);
   const replayRaw=Buffer.from(JSON.stringify(ordinary.request));
   assert.equal((await restored.authorize(f.auth(replayRaw),replayRaw,ordinary.request,()=>f.context)).executionAuthorized,false);
  }finally{await restored.close();}
  // Independent gateway storage cannot reset the backend's budget.
  const resetLocal=new LocalDisclosureGateway({principalKey:f.principalKey,vault:{ageYears:36},ledgerFile:path.join(dir,'reset.json')});
  const reset=new PohaDisclosureGateway({localGateway:resetLocal,database:db});
  const newPreview=reset.preview(grant,{fields:['ageBand']});
  const a={version:DISCLOSURE_VERSION,grantId:grantId(grantPayload),agentKey:f.agentKey,requestDigest:newPreview.requestDigest,nonce:nonce(),...interval()};
  const p={...ordinary.request.proof.payload,nonce:a.nonce};
  const req={...ordinary.request,proof:{payload:p,signature:signProof('ACTION',p,f.agent.privateKey)}};const raw=Buffer.from(JSON.stringify(req));
  const blocked=await reset.execute({input:{grant,proposal:{fields:['ageBand']},action:{payload:a,signature:signDisclosure('ACTION',a,f.agent.privateKey)}},auth:f.auth(raw),raw,request:req,resolveContext:()=>f.context});
  assert.equal(blocked.receipt.reasonCodes[0],'DISCLOSURE_BUDGET_EXCEEDED');assert.equal(resetLocal.capturedRequests().length,0);
  await db.mutate(f.context,'REVOKE',{type:'DELEGATION',id:delegation.id});
  const after=await reset.execute({input:{grant,proposal:{fields:['ageBand']},action:{payload:a,signature:signDisclosure('ACTION',a,f.agent.privateKey)}},auth:f.auth(raw),raw,request:req,resolveContext:()=>f.context});
  assert.equal(after.receipt.reasonCodes[0],'DELEGATION_UNAVAILABLE');
 }finally{await db.close();await fs.rm(dir,{recursive:true,force:true});}
});
