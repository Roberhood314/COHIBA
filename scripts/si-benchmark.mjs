import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {inferSovereignty} from '../lib/sovereignty-inference.mjs';
import {hashObject} from '../lib/human-signal-core.mjs';
import {QUORUM_VERSION,signSovereignStatement,verifySovereignQuorum} from '../lib/sovereign-quorum.mjs';

export function benchmarkSI({samples=2000,warmup=200}={}){
 const now=new Date('2026-10-05T04:00:00Z');
 const input={envelope:{version:'1.0-alpha',rootId:'HUMAN-ABCDEF123456',subject:'synthetic-agent',actions:['APP_REGISTER'],effects:['APP_REGISTRY_WRITE'],budget:2,epoch:0,nonce:'synthetic',expiresAt:'2026-10-05T04:01:00.000Z'},action:'APP_REGISTER',subject:'synthetic-agent',contract:{effects:['APP_REGISTRY_WRITE']},now};
 const signers=Array.from({length:4},(_,i)=>({id:'synthetic-'+i,...crypto.generateKeyPairSync('ed25519')}));
 const committee={faults:1,threshold:3,nodes:signers.map(s=>({id:s.id,publicKey:s.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}))};
 const statement={version:QUORUM_VERSION,kind:'AUTHORITY_DECISION',network:'local-benchmark',epoch:0,sequence:1,stateRoot:hashObject({}),policyHash:hashObject({}),intentHash:hashObject({}),issuedAt:now.toISOString(),expiresAt:'2026-10-05T04:00:30.000Z'};
 const votes=signers.slice(0,3).map(s=>signSovereignStatement(statement,s));
 const measure=(name,fn)=>{for(let i=0;i<warmup;i++)fn();const durations=[];const start=performance.now();for(let i=0;i<samples;i++){const t=performance.now();fn();durations.push((performance.now()-t)*1000);}const elapsedMs=performance.now()-start;durations.sort((a,b)=>a-b);const q=p=>durations[Math.min(samples-1,Math.floor((samples-1)*p))];return {name,samples,warmup,elapsedMs,p50us:q(.5),p95us:q(.95),p99us:q(.99),iterationsPerSecond:samples*1000/elapsedMs};};
 const cases=[measure('session-envelope-allow',()=>assert.equal(inferSovereignty(input).verdict,'ALLOW')),measure('session-envelope-revoked-deny',()=>assert.equal(inferSovereignty({...input,revoked:true}).reason,'REVOKED')),measure('pinned-quorum-3-of-4',()=>assert.equal(verifySovereignQuorum(votes,{committee,expected:statement,now}).accepted,true))];
 return {kind:'IN_PROCESS_MICROBENCHMARK',productionThroughput:false,clock:'performance.now',environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},cases};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)console.log(JSON.stringify(benchmarkSI(),null,2));
