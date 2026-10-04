import {AsyncLocalStorage} from 'node:async_hooks';
import crypto from 'node:crypto';
import pg from 'pg';

const revision=Symbol('accountStateRevision');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Compatibility boundary: existing domain functions operate on transaction-local
// documents. PostgreSQL, never an in-memory cache or JSON mirror, owns their state.
export class AccountStateDatabase {
 constructor({connectionString,pool,stores}){
  this.pool=pool||new pg.Pool({connectionString,max:4,connectionTimeoutMillis:5000,statement_timeout:15000});
  this.pool.on?.('error',()=>{});this.stores=stores;this.context=new AsyncLocalStorage();
 }
 async initialize(){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(721042)');
   await client.query('CREATE TABLE IF NOT EXISTS hs_state_documents (id text PRIMARY KEY, document jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1)');
   for(const [id,spec] of Object.entries(this.stores)){
    const existing=(await client.query('SELECT document FROM hs_state_documents WHERE id=$1',[id])).rows[0];
    if(existing){if(!spec.validate(existing.document))throw Error('ACCOUNT_STATE_INVALID');continue;}
    const value=spec.readLegacy();
    if(value.storageRecovered||!spec.validate(value))throw Error('ACCOUNT_MIGRATION_INVALID_SOURCE');
    await client.query('INSERT INTO hs_state_documents(id,document) VALUES($1,$2)',[id,value]);
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 read(id){
  const state=this.context.getStore();if(!state)throw Error('ACCOUNT_TRANSACTION_REQUIRED');
  const value=structuredClone(state.documents[id]);if(!value)throw Error('ACCOUNT_STATE_UNAVAILABLE');
  Object.defineProperty(value,revision,{value:hash(value),writable:true});return value;
 }
 write(id,value){
  const state=this.context.getStore();if(!state)throw Error('ACCOUNT_TRANSACTION_REQUIRED');
  if(value.storageRecovered||!this.stores[id]?.validate(value))throw Error('ACCOUNT_STATE_INVALID');
  if(value[revision]!==hash(state.documents[id]))throw Error('STORAGE_WRITE_CONFLICT');
  state.documents[id]=structuredClone(value);state.dirty.add(id);value[revision]=hash(value);
 }
 async transaction(fn,{shouldCommit=()=>true}={}){
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   // Coarse serialization is deliberate for this modular-monolith migration.
   // A dedicated pool prevents request waiters starving PoHA's own connections.
   await client.query('SELECT pg_advisory_xact_lock(721042)');
   const documents=Object.fromEntries((await client.query('SELECT id,document FROM hs_state_documents ORDER BY id')).rows.map(row=>[row.id,row.document]));
   for(const [id,spec] of Object.entries(this.stores))if(!spec.validate(documents[id]))throw Error('ACCOUNT_STATE_INVALID');
   const state={documents,dirty:new Set()};
   const result=await this.context.run(state,fn);
   if(!shouldCommit()){await client.query('ROLLBACK');return result;}
   for(const id of state.dirty)await client.query('UPDATE hs_state_documents SET document=$1,revision=revision+1 WHERE id=$2',[state.documents[id],id]);
   await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 async close(){await this.pool.end();}
}

// Hold headers/body until COMMIT. A returned login token must never precede its
// durable session. Error responses roll back all domain-document writes.
export async function transactionalResponse(database,handler,req,res){
 // Receive bounded request bytes before acquiring the shared state lock. Slow
 // uploaders must not hold identity/account transactions open.
 if(req.method==='POST'){
  const chunks=[];let size=0;
  try{for await(const chunk of req){size+=chunk.length;if(size>24576){res.writeHead(413,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:'REQUEST_TOO_LARGE'}));return;}chunks.push(chunk);}}
  catch{if(!res.destroyed){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:'REQUEST_ABORTED'}));}return;}
  const bytes=Buffer.concat(chunks);req[Symbol.asyncIterator]=async function*(){if(bytes.length)yield bytes;};
 }
 const originalHead=res.writeHead.bind(res),originalEnd=res.end.bind(res);
 let head=null,end=null;let ended;const completion=new Promise(resolve=>{ended=resolve;});
 res.writeHead=(...args)=>{head=args;res.statusCode=args[0];return res;};
 res.end=(...args)=>{end=args;ended();return res;};
 try{
  await database.transaction(async()=>{await handler(req,res);await completion;},{shouldCommit:()=>res.statusCode<400&&!req.aborted});
  res.writeHead=originalHead;res.end=originalEnd;
  if(head)originalHead(...head);originalEnd(...(end||[]));
 }catch{
  res.writeHead=originalHead;res.end=originalEnd;
  if(!res.destroyed){originalHead(503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});originalEnd(JSON.stringify({ok:false,error:'ACCOUNT_STORAGE_UNAVAILABLE'}));}
 }
}
