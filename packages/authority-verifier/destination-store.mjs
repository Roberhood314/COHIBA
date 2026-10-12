// Destination-owned PostgreSQL is the common ordering point. Source databases
// do not create authority and cannot independently execute the protected effect.
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { inspectAuthority, commitAuthority, sha256 } from './index.mjs';
import { createPostgresCommitGate } from './postgres-adapter.mjs';

export async function createDestinationStore({pool,trust,audience,resource,requireApproval=false}) {
 if(typeof audience!=='string'||!audience.startsWith('https://')||new URL(audience).origin!==audience||typeof resource!=='string'||!resource.length||typeof requireApproval!=='boolean')throw Error('INVALID_DESTINATION_POLICY');
 const pinnedTrust=structuredClone(trust),context=new AsyncLocalStorage();
 const initializer=await pool.connect();try{
 await initializer.query('BEGIN');
 await initializer.query('SELECT pg_advisory_xact_lock(721043)');
 await initializer.query(`CREATE TABLE IF NOT EXISTS hs_destination_receipts(
 action_digest text PRIMARY KEY,receipt_id text NOT NULL UNIQUE,payload bytea NOT NULL,
 payload_hash text NOT NULL,resource text NOT NULL,audience text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());`);
 await initializer.query('COMMIT');
 }catch(e){await initializer.query('ROLLBACK').catch(()=>{});throw e;}finally{initializer.release();}
 const gate=await createPostgresCommitGate(pool,{onCommit:async(c,x)=>{
  const bytes=context.getStore();
  if(!Buffer.isBuffer(bytes)||sha256(bytes)!==x.payloadHash||x.resource!==resource||x.audience!==audience||x.action!=='DRAFT_APP_ACTION')throw Error('DESTINATION_CONTEXT_MISMATCH');
  await c.query('INSERT INTO hs_destination_receipts(action_digest,receipt_id,payload,payload_hash,resource,audience) VALUES($1,$2,$3,$4,$5,$6)',[x.actionDigest,crypto.randomUUID(),bytes,x.payloadHash,resource,audience]);
 }});
 const denied=reason=>({decision:'DENY',operationCommitted:false,executionAuthorized:false,reason});
 async function receiptFor(bundle,expected,inspection){
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const a=bundle.proof.payload,s=bundle.status.payload;
   const epoch=(await c.query('SELECT credential_epoch FROM hs_verifier_epochs WHERE issuer=$1 AND principal_id=$2 FOR UPDATE',[s.issuer,a.principalId])).rows[0];
   if(!epoch||BigInt(epoch.credential_epoch)>BigInt(s.credentialEpoch))throw Error('REJECT');
   const ids=a.performer==='AGENT'?[bundle.binding.id,bundle.delegation.id]:[];
   const revoked=await c.query('SELECT 1 FROM hs_verifier_revocations WHERE issuer=$1 AND principal_id=$2 AND authority_id=ANY($3::text[])',[s.issuer,a.principalId,['*',...ids]]);
   if(revoked.rows.length)throw Error('REJECT');
   // Reverify after awaiting the database lock. A stale signed snapshot is never
   // sufficient to bypass local revocation or expiry.
   if(inspectAuthority({...bundle,trust:pinnedTrust,expected}).decision!=='ALLOW')throw Error('REJECT');
   const row=(await c.query('SELECT receipt_id,payload_hash,resource,audience FROM hs_destination_receipts WHERE action_digest=$1',[inspection.actionDigest])).rows[0];
   if(!row||row.payload_hash!==expected.payloadHash||row.resource!==resource||row.audience!==audience)throw Error('REJECT');
   await c.query('COMMIT');
   return {decision:'ALLOW',operationCommitted:true,executionAuthorized:false,idempotentReplay:true,receiptId:row.receipt_id};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});return denied(e.message==='REJECT'?'RECEIPT_UNAVAILABLE':'DESTINATION_UNAVAILABLE');}finally{c.release();}
 }
 return Object.freeze({
  revoke:gate.revoke,
  async commit({bundle,payloadBase64,challenge}={}){
   let detached,bytes,expected;
   try{
    if(typeof payloadBase64!=='string'||payloadBase64.length>8000||typeof challenge!=='string'||!/^[A-Za-z0-9_-]{22,128}$/.test(challenge))throw Error('INVALID_REQUEST');
    bytes=Buffer.from(payloadBase64,'base64');if(!bytes.length||bytes.toString('base64')!==payloadBase64)throw Error('INVALID_REQUEST');
    detached=structuredClone(bundle);
    expected={audience,action:'DRAFT_APP_ACTION',resource,payloadHash:sha256(bytes),requireApproval,challenge};
   }catch{return denied('INVALID_REQUEST');}
   const inspection=inspectAuthority({...detached,trust:pinnedTrust,expected});
   if(inspection.decision!=='ALLOW')return denied('AUTHORITY_DENIED');
   const result=await context.run(bytes,()=>commitAuthority(detached,{trust:pinnedTrust,expected,commit:gate.commit}));
   // Resolve both an ordinary replay and an ambiguous COMMIT response against
   // durable destination state. This never calls the business effect twice.
   let receipt;
   try { receipt=await receiptFor(detached,expected,inspection); }
   catch { return denied('DESTINATION_UNAVAILABLE'); }
   if(!receipt.operationCommitted)return receipt;
   return {...receipt,idempotentReplay:!result.operationCommitted};
  }
 });
}
