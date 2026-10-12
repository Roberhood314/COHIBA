// Synthetic isolated load only. Never point this at a customer database.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
import {signProof} from '../sdk/human-signal-node.mjs';
import {createDestinationStore} from '../packages/authority-verifier/destination-store.mjs';
const native=Boolean(process.env.TEST_DATABASE_URL);
let pool;
if(native)pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:12,connectionTimeoutMillis:5000,statement_timeout:10000});
else {
 const engine=new PGlite();let tail=Promise.resolve();
 pool={async connect(){let release;const next=new Promise(r=>release=r),prior=tail;tail=next;await prior;return {release,query:(sql,args)=>!args&&sql.includes('CREATE TABLE')?engine.exec(sql).then(()=>({rows:[]})):engine.query(sql,args)};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}},end:()=>engine.close()};
}
try{
 const databaseVersion=(await pool.query('SELECT version() AS version')).rows[0].version;
 const count=100,concurrency=8,f=fixture(),issuer='benchmark-'+crypto.randomBytes(8).toString('hex');
 const store=await createDestinationStore({pool,trust:{[issuer]:f.bundle.trust['synthetic-issuer']},audience:f.context.audience,resource:'draft:independent'});
 const latencies=[];let next=0,committed=0,failed=0;
 const start=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(next++<count){
   const item=fixture();item.bundle.proof.payload.nonce=crypto.randomBytes(24).toString('base64url');
   item.bundle.proof.signature=signProof('ACTION',item.bundle.proof.payload,item.keys.agent);
   item.bundle.status.payload.issuer=issuer;item.bundle.status.payload.challenge=crypto.randomBytes(24).toString('base64url');item.resignStatus();
   const {proof,binding,delegation,status}=item.bundle,t=performance.now();
   const result=await store.commit({bundle:{proof,binding,delegation,status},challenge:status.payload.challenge,payloadBase64:Buffer.from('SYNTHETIC PAYLOAD').toString('base64')});
   latencies.push(performance.now()-t);if(result.operationCommitted)committed++;else failed++;
  }
 }));
 const elapsedMs=performance.now()-start;latencies.sort((a,b)=>a-b);
 const sources=['packages/authority-verifier/destination-store.mjs','packages/authority-verifier/postgres-adapter.mjs','packages/authority-verifier/index.mjs','scripts/benchmark-destination.mjs'];
 const report={version:'DESTINATION_BENCHMARK_V0_1',generatedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:Boolean(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim()),node:process.version,databaseVersion,backend:native?'native-postgresql':'serialized-pglite',sourceHashes:Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),count,concurrency,committed,failed,elapsedMs,throughputPerSecond:committed/(elapsedMs/1000),p50Ms:latencies[Math.floor(latencies.length*.5)],p95Ms:latencies[Math.floor(latencies.length*.95)],scope:'Synthetic fixed SQL draft commits, one principal and one destination; excludes HTTP/TLS and blockchain. Not a production capacity guarantee or independent review.'};
 console.log(JSON.stringify(report,null,2));if(failed||committed!==count)process.exitCode=1;
}finally{await pool.end();}
