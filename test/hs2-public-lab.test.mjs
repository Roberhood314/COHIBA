import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';

test('public lab Worker performs actual shared signature checks and never authorizes execution',async()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../web/public/hs2-vectors.json',import.meta.url),'utf8'));
 const moduleUrl=new URL('../web/si-lab-worker.mjs',import.meta.url).href;
 const worker=new Worker("import {parentPort,workerData} from 'node:worker_threads';globalThis.self={postMessage:v=>parentPort.postMessage(v)};await import(workerData.moduleUrl);self.onmessage({data:workerData.report});",{eval:true,type:'module',workerData:{moduleUrl,report}});
 try{
  const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  assert.equal(result.ok,true);assert.equal(result.rows.length,8);assert.equal(result.rows.filter(r=>r.verdict==='REJECTED').length,7);assert.ok(result.rows.every(r=>r.passed));assert.equal(result.executionAuthorized,false);assert.equal(result.signatureBytes,17088);
 }finally{await worker.terminate();}
});

test('public evidence labels remain explicit and homepage links to the lab',()=>{
 const html=fs.readFileSync(new URL('../web/si-lab.html',import.meta.url),'utf8');
 for(const label of ['Experimental / pre-audit','historical, synthetic','not a FIPS-validated module','not automatically enabled on production'])assert.ok(html.includes(label),label);
 assert.ok(fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8').includes('/si-lab.html'));
 const vector=JSON.parse(fs.readFileSync(new URL('../web/public/hs2-vectors.json',import.meta.url),'utf8'));
 assert.equal(vector.executionAuthorized,false);assert.equal(vector.inspection.executionAuthorized,false);
});
