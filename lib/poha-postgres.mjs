import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
import {bindAgent,createSignedDelegation,revokeSignedRecord,inspectAction,proofDigest} from './poha-v1.mjs';
import {validateDisclosurePolicy,inspectDisclosureMetadata,DISCLOSURE_POLICY_VERSION} from './poha-disclosure.mjs';
const PREFIX=Buffer.from('302a300506032b6570032100','hex');
export function serviceSigningBytes(id,time,nonce,body){return Buffer.from(`HS/1/SERVICE\n${id}\n${time}\n${nonce}\n${crypto.createHash('sha256').update(body).digest('hex')}`);}
const denied=reason=>({version:'1',mode:'AUTHORIZE',actorClass:'UNVERIFIED',decision:'DENY',executionAuthorized:false,reasonCodes:[reason]});
export class PohaDatabase{
 constructor({connectionString,pool}={}){this.pool=pool||new pg.Pool({connectionString,max:8,connectionTimeoutMillis:5000,statement_timeout:10000});this.pool.on?.('error',()=>{});}
 async initialize(){
  const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(721041)");await c.query(await fs.readFile(new URL('../migrations/001-poha.sql',import.meta.url),'utf8'));await c.query('COMMIT');}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 }
 async transaction(id,fn){
  const c=await this.pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 }
 async principal(c,context){
  const old=(await c.query('SELECT document FROM hs_principals WHERE id=$1 FOR UPDATE',[context.principalId])).rows[0]?.document;
  if(old?.revokedAt)throw Error('PRINCIPAL_REVOKED');
  const document={id:context.principalId,principalKey:context.principalKey,identityAssurance:context.identityAssurance,assuranceExpiresAt:context.assuranceExpiresAt||null,credentialEpoch:old?(old.credentialEpoch+(old.principalKey===context.principalKey?0:1)):1,revokedAt:null};
  await c.query('INSERT INTO hs_principals(id,document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=excluded.document',[context.principalId,document]);return document;
 }
 async store(c,id){
  const agents=(await c.query('SELECT document FROM hs_agents WHERE principal_id=$1',[id])).rows.map(x=>x.document);
  const delegations=(await c.query('SELECT document FROM hs_delegations WHERE principal_id=$1',[id])).rows.map(x=>x.document);
  return {pohaAgents:agents,pohaDelegations:delegations};
 }
 async mutate(context,kind,input){return this.transaction(context.principalId,async c=>{
  await this.principal(c,context);const store=await this.store(c,context.principalId);let record,changed=true;
  if(kind==='AGENT'){record=bindAgent(store,context,input);await c.query('INSERT INTO hs_agents(id,principal_id,nonce,document) VALUES($1,$2,$3,$4)',[record.id,context.principalId,record.payload.nonce,record]);}
  else if(kind==='DELEGATION'){record=createSignedDelegation(store,context,input);await c.query('INSERT INTO hs_delegations(id,principal_id,nonce,document) VALUES($1,$2,$3,$4)',[record.id,context.principalId,record.payload.nonce,record]);}
  else{const out=revokeSignedRecord(store,context,input);record=out.record;changed=out.changed;const table=input.type==='AGENT'?'hs_agents':'hs_delegations';await c.query(`UPDATE ${table} SET document=$1 WHERE id=$2`,[record,record.id]);}
  if(changed)await c.query('INSERT INTO hs_audit(event) VALUES($1)',[{kind,principalId:context.principalId,recordId:record.id,revokedAt:record.revokedAt}]);return record;
 });}
 async listing(id){return this.transaction(id,c=>this.store(c,id));}
 async inspect(context,proof,expected){return this.transaction(context.principalId,async c=>{await this.principal(c,context);return inspectAction(await this.store(c,context.principalId),context,proof,expected);});}
 async enrollService(service){
  if(!/^[a-z0-9-]{3,64}$/.test(service.id) || !service.publicKey || !service.audience?.startsWith('https://') || new URL(service.audience).origin!==service.audience || !Array.isArray(service.scopes) || service.scopes.some(x=>!['READ_PUBLIC_SIGNALS','DRAFT_CONTRIBUTION','DRAFT_APP_ACTION'].includes(x)) || typeof service.resourcePrefix!=='string' || !service.resourcePrefix.length)throw Error('INVALID_SERVICE_POLICY');
  const key=Buffer.from(service.publicKey,'base64');if(key.length!==32 || key.toString('base64')!==service.publicKey)throw Error('INVALID_SERVICE_KEY');
  if(service.disclosurePolicy!==undefined)validateDisclosurePolicy(service.disclosurePolicy);
  await this.pool.query('INSERT INTO hs_services(id,document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=excluded.document',[service.id,{...service,enabled:service.enabled!==false,requireApproval:service.requireApproval===true}]);
 }
 async service(id){return (await this.pool.query('SELECT document FROM hs_services WHERE id=$1',[id])).rows[0]?.document;}
 async authenticateService(c,auth,raw,now){
  const service=(await c.query('SELECT document FROM hs_services WHERE id=$1 FOR SHARE',[auth.id])).rows[0]?.document;
  if(!service || !service.enabled)throw Error('SERVICE_AUTH_INVALID');
  const time=Date.parse(auth.time);if(!Number.isFinite(time)||new Date(time).toISOString()!==auth.time||Math.abs(now.getTime()-time)>60000||!/^[A-Za-z0-9_-]{22,128}$/.test(auth.nonce))throw Error('SERVICE_AUTH_INVALID');
  const sig=Buffer.from(auth.signature||'','base64');if(sig.length!==64||sig.toString('base64')!==auth.signature)throw Error('SERVICE_AUTH_INVALID');
  const key=crypto.createPublicKey({key:Buffer.concat([PREFIX,Buffer.from(service.publicKey,'base64')]),format:'der',type:'spki'});
  if(!crypto.verify(null,serviceSigningBytes(auth.id,auth.time,auth.nonce,raw),key,sig))throw Error('SERVICE_AUTH_INVALID');
  const consumed=await c.query('INSERT INTO hs_service_nonces(service_id,nonce,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING nonce',[auth.id,auth.nonce,new Date(now.getTime()+120000)]);
  if(!consumed.rows.length)throw Error('SERVICE_REQUEST_REPLAY');return service;
 }
 async authorize(auth,raw,request,resolveContext,now=new Date()){
  const id=request?.proof?.payload?.principalId;if(typeof id!=='string'||id.length>64)throw Error('INVALID_PRINCIPAL');
  return this.transaction(id,async c=>{
   now=new Date(); // Re-evaluate freshness after waiting for the principal transaction lock.
   const service=await this.authenticateService(c,auth,raw,now);
   const context=resolveContext(id,service.audience);if(!context)return denied('PRINCIPAL_UNAVAILABLE');
   const snapshot=JSON.stringify(context);const principal=await this.principal(c,context);
   const action=request.proof.payload;
   if(!service.scopes.includes(request.action)||typeof request.resource!=='string'||!request.resource.startsWith(service.resourcePrefix))return denied('SERVICE_POLICY_DENIED');
   if(typeof request.payloadBase64!=='string'||request.payloadBase64.length>12000)return denied('INVALID_PAYLOAD');
   const bytes=Buffer.from(request.payloadBase64,'base64');if(bytes.toString('base64')!==request.payloadBase64)return denied('INVALID_PAYLOAD');
   let disclosure;
   if(service.disclosurePolicy){
    try{disclosure=inspectDisclosureMetadata(bytes,service.disclosurePolicy,context,action);}catch(e){return denied(e.message);}
   }
   const expected={audience:service.audience,action:request.action,resource:request.resource,payloadHash:crypto.createHash('sha256').update(bytes).digest('hex'),requireApproval:service.requireApproval||disclosure?.requireApproval};
   const store=await this.store(c,id);now=new Date();
   const inspection=inspectAction(store,context,request.proof,expected,now);
   const result={...inspection,mode:'AUTHORIZE',policyVersion:'HS_DRAFT_SERVICE_V1',serviceId:service.id,principalId:id,performerKey:action.signerKey,delegationId:action.delegationId,credentialEpoch:principal.credentialEpoch};
   if(result.decision!=='ALLOW')return result;
   let ledger,ledgerId;
   if(disclosure){
    ledgerId='disclosure:'+id;
    ledger=(await c.query('SELECT document FROM hs_state_documents WHERE id=$1 FOR UPDATE',[ledgerId])).rows[0]?.document||{version:DISCLOSURE_POLICY_VERSION,counts:{}};
    if(ledger.version!==DISCLOSURE_POLICY_VERSION||!ledger.counts||Array.isArray(ledger.counts)||typeof ledger.counts!=='object'||Object.keys(ledger).length!==2||Object.keys(ledger.counts).some(k=>!/^DISCLOSURE-[a-f0-9]{64}$/.test(k))||Object.values(ledger.counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('DISCLOSURE_LEDGER_INVALID');
    if((ledger.counts[disclosure.grantId]||0)>=disclosure.maxRequests)return denied('DISCLOSURE_BUDGET_EXCEEDED');
    result.disclosurePolicyVersion=DISCLOSURE_POLICY_VERSION;result.disclosureRequestDigest=disclosure.requestDigest;
   }
   const digest=proofDigest('ACTION',action);
   const receipt={...result,executionAuthorized:true,receiptId:'RECEIPT-'+crypto.randomUUID(),actionDigest:digest,nonceConsumed:true,humanApprovalDigest:request.proof.approval?proofDigest('APPROVAL',request.proof.approval.payload):null,reasonCodes:['AUTHORIZED_ONLINE_TRANSACTION'],expiresAt:new Date(Math.min(Date.parse(action.expiresAt),now.getTime()+30000)).toISOString()};
   const inserted=await c.query('INSERT INTO hs_actions(digest,principal_id,signer_key,nonce,receipt) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING digest',[digest,id,action.signerKey,action.nonce,receipt]);
   if(!inserted.rows.length)return denied('ACTION_REPLAY');
   if(request.proof.approval){
    const approval=request.proof.approval.payload;
    const consumed=await c.query('INSERT INTO hs_approvals(principal_id,nonce,action_digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING nonce',[id,approval.nonce,digest]);
    if(!consumed.rows.length)throw Error('APPROVAL_REPLAY');
   }
   if(Date.parse(action.expiresAt)<=Date.now())throw Error("PROOF_EXPIRED_RETRY");
   if(JSON.stringify(resolveContext(id,service.audience))!==snapshot)throw Error('IDENTITY_CHANGED_RETRY');
   if(disclosure){
    ledger.counts[disclosure.grantId]=(ledger.counts[disclosure.grantId]||0)+1;
    await c.query('INSERT INTO hs_state_documents(id,document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=excluded.document,revision=hs_state_documents.revision+1',[ledgerId,ledger]);
   }
   await c.query('INSERT INTO hs_audit(event) VALUES($1)',[{kind:'ACTION_AUTHORIZED',serviceId:service.id,principalId:id,actionDigest:digest,receiptId:receipt.receiptId}]);
   return receipt;
  });
 }
 async revokePrincipal(id){return this.transaction(id,async c=>{const row=(await c.query('SELECT document FROM hs_principals WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw Error('PRINCIPAL_NOT_FOUND');const document={...row.document,credentialEpoch:row.document.credentialEpoch+1,revokedAt:new Date().toISOString()};await c.query('UPDATE hs_principals SET document=$1 WHERE id=$2',[document,id]);await c.query('INSERT INTO hs_audit(event) VALUES($1)',[{kind:'PRINCIPAL_REVOKED',principalId:id}]);return {revoked:true};});}
 async importLegacy(core){
  if(core.storageRecovered)throw Error('POHA_STORAGE_UNAVAILABLE');
  return this.transaction('legacy-import',async c=>{
   for(const [table,records] of [['hs_agents',core.pohaAgents||[]],['hs_delegations',core.pohaDelegations||[]]])for(const record of records){
    const p=record.payload;
    await c.query('INSERT INTO hs_principals(id,document) VALUES($1,$2) ON CONFLICT DO NOTHING',[p.principalId,{id:p.principalId,principalKey:p.principalKey,identityAssurance:'NONE',credentialEpoch:1,revokedAt:null}]);
    await c.query(`INSERT INTO ${table}(id,principal_id,nonce,document) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[record.id,p.principalId,p.nonce,record]);
   }
   await c.query("INSERT INTO hs_migrations(id) VALUES('json-poha-v1') ON CONFLICT DO NOTHING");
  });
 }
 async snapshot(){
  const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const result={principals:(await c.query('SELECT document FROM hs_principals ORDER BY id')).rows.map(x=>x.document),pohaAgents:(await c.query('SELECT document FROM hs_agents ORDER BY id')).rows.map(x=>x.document),pohaDelegations:(await c.query('SELECT document FROM hs_delegations ORDER BY id')).rows.map(x=>x.document),authorizationHistory:(await c.query('SELECT digest,principal_id,receipt FROM hs_actions ORDER BY digest')).rows.map(x=>({digest:x.digest,principalId:x.principal_id,serviceId:x.receipt.serviceId,actorClass:x.receipt.actorClass,credentialEpoch:x.receipt.credentialEpoch,checkedAt:x.receipt.checkedAt}))};await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async exportBackup(){
  const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const tables={};
   for(const table of ['hs_principals','hs_services','hs_agents','hs_delegations','hs_actions','hs_approvals','hs_service_nonces','hs_audit','hs_migrations','hs_state_documents','hs_state_roots']){
    const columns=table==='hs_audit'?'id::text AS id,event,created_at':table==='hs_state_documents'?'id,document,revision::text AS revision':'*';
    const order=table==='hs_actions'?'digest':table==='hs_approvals'?'principal_id,nonce':table==='hs_service_nonces'?'service_id,nonce':'id';
    const ordering=table==='hs_audit'?'hs_audit.id':order.split(',').map(column=>column+' COLLATE "C"').join(',');
    tables[table]=(await c.query(`SELECT ${columns} FROM ${table} ORDER BY ${ordering}`)).rows;
   }
   await c.query('COMMIT');return {version:'HS_PG_BACKUP_V1',createdAt:new Date().toISOString(),tables};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async restoreBackup(backup){
  const fields={hs_principals:['id','document'],hs_services:['id','document'],hs_agents:['id','principal_id','nonce','document'],hs_delegations:['id','principal_id','nonce','document'],hs_actions:['digest','principal_id','signer_key','nonce','receipt'],hs_approvals:['principal_id','nonce','action_digest'],hs_service_nonces:['service_id','nonce','expires_at'],hs_audit:['id','event','created_at'],hs_migrations:['id','applied_at'],hs_state_documents:['id','document','revision'],hs_state_roots:['id','document']};
  if(backup?.version==='HS_PG_BACKUP_V1' && backup.tables && !Object.hasOwn(backup.tables,'hs_state_documents'))backup={...backup,tables:{...backup.tables,hs_state_documents:[]}};
  if(backup?.version==='HS_PG_BACKUP_V1' && backup.tables && !Object.hasOwn(backup.tables,'hs_state_roots'))backup={...backup,tables:{...backup.tables,hs_state_roots:[]}};
  if(backup.version!=='HS_PG_BACKUP_V1'||!backup.tables||Object.keys(backup.tables).length!==Object.keys(fields).length)throw Error('INVALID_DATABASE_BACKUP');
  return this.transaction('restore',async c=>{
   for(const table of Object.keys(fields))if((await c.query(`SELECT 1 FROM ${table} LIMIT 1`)).rows.length)throw Error('RESTORE_DATABASE_NOT_EMPTY');
   for(const [table,columns] of Object.entries(fields)){
    if(!Array.isArray(backup.tables[table]))throw Error('INVALID_DATABASE_BACKUP');
    for(const row of backup.tables[table]){
     if(Object.keys(row).length!==columns.length||columns.some(k=>!Object.hasOwn(row,k)))throw Error('INVALID_DATABASE_BACKUP');
     await c.query(`INSERT INTO ${table}(${columns.join(',')}) ${table==='hs_audit'?'OVERRIDING SYSTEM VALUE ':''}VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(k=>row[k]));
    }
   }
   await c.query("SELECT setval(pg_get_serial_sequence('hs_audit','id'),COALESCE((SELECT max(id) FROM hs_audit),1),EXISTS(SELECT 1 FROM hs_audit))");return {restored:true};
  });
 }
 async graphRecords(id){
  return this.transaction(id,async c=>({...(await this.store(c,id)),principal:(await c.query('SELECT document FROM hs_principals WHERE id=$1',[id])).rows[0]?.document||null,receipts:(await c.query('SELECT receipt FROM hs_actions WHERE principal_id=$1 ORDER BY digest',[id])).rows.map(r=>r.receipt)}));
 }
 async saveCheckpoint(state){
  if(state.version!=='HS_TRUST_STATE_V1'||state.economicStateIncluded!==false||!/^[a-f0-9]{64}$/.test(state.stateRoot))throw Error('INVALID_CHECKPOINT');
  await this.pool.query('INSERT INTO hs_state_roots(id,document) VALUES($1,$2) ON CONFLICT DO NOTHING',[state.stateRoot,state]);
 }
 async checkpoints(){return (await this.pool.query("SELECT document FROM hs_state_roots ORDER BY document->>'createdAt' DESC LIMIT 25")).rows.map(r=>r.document);}
 async health(){await this.pool.query('SELECT 1');return {storage:'POSTGRESQL',ready:true};}
 async close(){await this.pool.end();}
}
