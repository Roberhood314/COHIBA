import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {createPostgresReplayStore,createPostgresCommitGate} from '../packages/authority-verifier/postgres-adapter.mjs';

test('native concurrent verifier startup installs one schema and one deferred expiry trigger',{skip:!process.env.TEST_DATABASE_URL,timeout:60000},async()=>{
 const schema='si_init_'+crypto.randomBytes(8).toString('hex');
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 let pool;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:12});
  // Independent clients race on a genuinely empty schema. No pre-created tables.
  const results=await Promise.all(Array.from({length:20},(_,i)=>i%2?createPostgresReplayStore(pool):createPostgresCommitGate(pool,{onCommit:async()=>{}})));
  assert.equal(results.length,20);
  const tables=await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema]);
  assert.equal(tables.rows.length,6);
  const trigger=await pool.query("SELECT tgdeferrable,tginitdeferred FROM pg_trigger WHERE tgrelid='hs_verifier_commits'::regclass AND tgname='hs_verifier_commit_expiry'");
  assert.equal(trigger.rows.length,1);assert.equal(trigger.rows[0].tgdeferrable,true);assert.equal(trigger.rows[0].tginitdeferred,true);
  // A failed migration must roll back and release its client/lock for retry.
  let released=false;
  const broken={connect:async()=>{const c=await pool.connect();return {query:async(sql,args)=>{if(sql.includes('CREATE TABLE'))throw Error('SYNTHETIC_DDL_FAILURE');return c.query(sql,args);},release:()=>{released=true;c.release();}};}};
  await assert.rejects(createPostgresReplayStore(broken),/SYNTHETIC_DDL_FAILURE/);assert.equal(released,true);
  assert.equal(typeof await createPostgresReplayStore(pool),'function');
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
