import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
import {signProof} from '../sdk/human-signal-node.mjs';
import {createDestinationStore} from '../packages/authority-verifier/destination-store.mjs';
import {createDestinationServer} from '../examples/destination-service/server.mjs';
import {createPostgresReplayStore} from '../packages/authority-verifier/postgres-adapter.mjs';
async function embedded(){
 const db=new PGlite();let tail=Promise.resolve();
 return {async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(sql,args)=>!args&&sql.includes('CREATE TABLE')?db.exec(sql).then(()=>({rows:[]})):db.query(sql,args),release};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}},end:()=>db.close()};
}
async function database(){return process.env.TEST_DATABASE_URL?new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:12,connectionTimeoutMillis:5000,statement_timeout:10000}):embedded();}
function request(){
 const f=fixture(),issuer='resilience-'+crypto.randomBytes(8).toString('hex');
 f.bundle.proof.payload.nonce=crypto.randomBytes(24).toString('base64url');
 f.bundle.proof.signature=signProof('ACTION',f.bundle.proof.payload,f.keys.agent);
 f.bundle.status.payload.issuer=issuer;
 f.bundle.status.payload.challenge=crypto.randomBytes(24).toString('base64url');f.resignStatus();
 const {proof,binding,delegation,status}=f.bundle;
 return {f,input:{bundle:{proof,binding,delegation,status},challenge:status.payload.challenge,payloadBase64:Buffer.from('SYNTHETIC PAYLOAD').toString('base64')},policy:{trust:{[issuer]:f.bundle.trust['synthetic-issuer']},audience:proof.payload.audience,resource:proof.payload.resource},revocation:{issuer,principalId:proof.payload.principalId}};
}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(r=>server.close(r));}

test('two independent replay databases admit locally, one shared HTTP destination commits once',{timeout:60000},async()=>{
 const sources=await Promise.all([embedded(),embedded()]),pool=await database();let host;
 try{
  const r=request();
  const admission={issuer:r.revocation.issuer,principalId:r.revocation.principalId,credentialEpoch:1,signerKey:r.input.bundle.proof.payload.signerKey,actionNonce:r.input.bundle.proof.payload.nonce,actionDigest:r.input.bundle.status.payload.actionDigest,challenge:r.input.challenge,audience:r.policy.audience,validUntil:new Date(Date.now()+10000).toISOString()};
  const localStores=await Promise.all(sources.map(createPostgresReplayStore));
  assert.deepEqual(await Promise.all(localStores.map(consume=>consume(admission))),[true,true]);
  host=await createDestinationServer({pool,...r.policy});const url=await listen(host.server);
  const responses=await Promise.all(Array.from({length:24},()=>fetch(url+'/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(r.input)}).then(async x=>({status:x.status,body:await x.json()}))));
  assert.ok(responses.every(x=>x.status===200));
  assert.equal(responses.filter(x=>!x.body.idempotentReplay).length,1);
  assert.equal(new Set(responses.map(x=>x.body.receiptId)).size,1);
  assert.ok(responses.every(x=>x.body.executionAuthorized===false));
  const rows=(await pool.query('SELECT payload FROM hs_destination_receipts WHERE action_digest=$1',[admission.actionDigest])).rows;
  assert.equal(rows.length,1);assert.equal(Buffer.from(rows[0].payload).toString(),'SYNTHETIC PAYLOAD');
 }finally{if(host)await close(host.server);await pool.end();await Promise.all(sources.map(x=>x.end()));}
});
test('lost commit acknowledgement recovers durable receipt without another effect',{timeout:60000},async()=>{
 const pool=await database();let loseAck=false;
 const faulty={query:(...x)=>pool.query(...x),async connect(){const c=await pool.connect();return {release:()=>c.release(),async query(sql,args){const result=await c.query(sql,args);if(sql==='COMMIT'&&loseAck){loseAck=false;throw Error('CONNECTION_LOST_AFTER_COMMIT');}return result;}};}};
 try{
  const r=request(),store=await createDestinationStore({pool:faulty,...r.policy});loseAck=true;
  const result=await store.commit(r.input);assert.equal(result.operationCommitted,true);assert.equal(result.idempotentReplay,true);
  const restarted=await createDestinationStore({pool,...r.policy});const retried=await restarted.commit(r.input);
  assert.equal(retried.receiptId,result.receiptId);assert.equal(retried.executionAuthorized,false);
  assert.equal((await pool.query('SELECT 1 FROM hs_destination_receipts WHERE action_digest=$1',[r.input.bundle.status.payload.actionDigest])).rows.length,1);
 }finally{await pool.end();}
});
test('destination revocation denies a live issuer snapshot and survives receiver restart',{timeout:60000},async()=>{
 const pool=await database();try{
  const r=request();let store=await createDestinationStore({pool,...r.policy});
  await store.revoke(r.revocation);store=await createDestinationStore({pool,...r.policy});
  assert.equal((await store.commit(r.input)).operationCommitted,false);
  assert.equal((await pool.query('SELECT 1 FROM hs_destination_receipts WHERE action_digest=$1',[r.input.bundle.status.payload.actionDigest])).rows.length,0);
 }finally{await pool.end();}
});
test('receipt retry cannot recover revoked authority or authorize changed bytes',{timeout:60000},async()=>{
 const pool=await database();try{
  const r=request(),store=await createDestinationStore({pool,...r.policy});assert.equal((await store.commit(r.input)).operationCommitted,true);
  assert.equal((await store.commit({...r.input,payloadBase64:Buffer.from('changed').toString('base64')})).operationCommitted,false);
  await store.revoke(r.revocation);assert.equal((await store.commit(r.input)).operationCommitted,false);
 }finally{await pool.end();}
});
test('unavailable destination denies and can resume with durable authority intact',{timeout:60000},async()=>{
 const pool=await database();let offline=false;
 const flaky={query:(...x)=>pool.query(...x),connect:()=>offline?Promise.reject(Error('PARTITION')):pool.connect()};
 try{
  const r=request(),store=await createDestinationStore({pool:flaky,...r.policy});offline=true;
  // Both admission and receipt resolution must return an explicit denial.
  const denied=await store.commit(r.input);assert.equal(denied.operationCommitted,false);
  offline=false;assert.equal((await store.commit(r.input)).operationCommitted,true);
 }finally{await pool.end();}
});
test('failed destination write rolls back replay and permits a later exact retry',{timeout:60000},async()=>{
 const pool=await database();let failWrite=false;
 const failing={query:(...x)=>pool.query(...x),async connect(){const c=await pool.connect();return {release:()=>c.release(),query(sql,args){if(failWrite&&sql.startsWith('INSERT INTO hs_destination_receipts'))throw Error('WRITE_FAILED');return c.query(sql,args);}};}};
 try{
  const r=request(),store=await createDestinationStore({pool:failing,...r.policy});failWrite=true;
  assert.equal((await store.commit(r.input)).operationCommitted,false);
  assert.equal((await pool.query('SELECT 1 FROM hs_verifier_actions WHERE signer_key=$1 AND nonce=$2',[r.input.bundle.proof.payload.signerKey,r.input.bundle.proof.payload.nonce])).rows.length,0);
  failWrite=false;assert.equal((await store.commit(r.input)).operationCommitted,true);
 }finally{await pool.end();}
});
