import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {Readable} from 'node:stream';
import {AccountStateDatabase,transactionalResponse} from '../lib/account-state-postgres.mjs';

async function embedded(){
 const engine=new PGlite();let tail=Promise.resolve();
 const pool={async connect(){let release;const next=new Promise(r=>release=r),previous=tail;tail=next;await previous;return {query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):engine.query(sql,args),release};},end:()=>engine.close()};
 return pool;
}
test('account migration is insert-only, transactional and preserves concurrent sessions',{timeout:60000},async()=>{
 const id='test-'+crypto.randomUUID();let legacy={profiles:[{id:'HUMAN-1'}],sessions:[],challenges:[]};
 const stores={[id]:{validate:s=>Boolean(s&&Array.isArray(s.profiles)&&Array.isArray(s.sessions)),readLegacy:()=>legacy}};
 const db=new AccountStateDatabase({...process.env.TEST_DATABASE_URL?{connectionString:process.env.TEST_DATABASE_URL}:{pool:await embedded()},stores});
 try{
  await db.initialize();
  await Promise.all(Array.from({length:12},(_,i)=>db.transaction(async()=>{const state=db.read(id);await new Promise(r=>setTimeout(r,2));state.sessions.push({tokenHash:String(i)});db.write(id,state);})));
  assert.equal(await db.transaction(()=>db.read(id).sessions.length),12);
  await assert.rejects(db.transaction(()=>{const state=db.read(id);state.sessions=[];db.write(id,state);throw Error('failure after write');}),/failure/);
  assert.equal(await db.transaction(()=>db.read(id).sessions.length),12);
  await db.transaction(()=>{const state=db.read(id);state.sessions=[];db.write(id,state);},{shouldCommit:()=>false});
  assert.equal(await db.transaction(()=>db.read(id).sessions.length),12);
  // Stale legacy files must never resurrect credentials or sessions on restart.
  legacy={profiles:[{id:'OLD'}],sessions:[{tokenHash:'revoked'}],storageRecovered:true};await db.initialize();
  assert.equal(await db.transaction(()=>db.read(id).profiles[0].id),'HUMAN-1');
  await assert.rejects(db.transaction(()=>{const a=db.read(id),b=db.read(id);a.sessions=[];db.write(id,a);db.write(id,b);}),/STORAGE_WRITE_CONFLICT/);
  assert.equal(await db.transaction(()=>db.read(id).sessions.length),12);
 }finally{await db.close();}
});
test('invalid legacy source blocks migration without replacing existing documents',{timeout:60000},async()=>{
 const db=new AccountStateDatabase({pool:await embedded(),stores:{network:{validate:s=>Boolean(s&&Array.isArray(s.profiles)),readLegacy:()=>({profiles:[],storageRecovered:true})}}});
 try{await assert.rejects(db.initialize(),/ACCOUNT_MIGRATION_INVALID_SOURCE/);}finally{await db.close();}
});
test('response never exposes a session token before commit and uploads precede the state lock',async()=>{
 const req=Readable.from([Buffer.from('{"password":"fixture"}')]);req.method='POST';
 const writes=[];const res={writeHead(...args){writes.push(['headers',...args]);},end(...args){writes.push(['body',...args]);}};
 let received='';
 const database={async transaction(fn){assert.equal(req.readableEnded,true);await fn();assert.deepEqual(writes,[]);throw Error('commit failed');}};
 await transactionalResponse(database,async(req,res)=>{for await(const b of req)received+=b;res.writeHead(200,{'content-type':'application/json'});res.end('{"token":"never-expose"}');},req,res);
 assert.equal(received,'{"password":"fixture"}');assert.equal(writes[0][1],503);assert.ok(!JSON.stringify(writes).includes('never-expose'));
 const large=Readable.from([Buffer.alloc(24577)]);large.method='POST';let locked=false;writes.length=0;
 await transactionalResponse({transaction:async()=>{locked=true;}},()=>{},large,res);assert.equal(locked,false);assert.equal(writes[0][1],413);
});
