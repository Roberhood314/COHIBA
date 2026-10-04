import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {AccountStateDatabase} from '../lib/account-state-postgres.mjs';

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
