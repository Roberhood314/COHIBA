import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectAuthority} from '../packages/authority-verifier/index.mjs';
test('320 deterministic signature-byte mutations cannot admit altered authority chains',()=>{
 const vectors=JSON.parse(fs.readFileSync(new URL('../examples/independent-verifier/vectors.json',import.meta.url)));
 const input=vectors.cases.find(x=>x.name==='agent').input;
 assert.equal(inspectAuthority(input).decision,'ALLOW');
 const paths=[['proof','signature'],['binding','principalSignature'],['binding','agentSignature'],['delegation','signature'],['status','signature']];
 let count=0;
 for(const [record,field] of paths)for(let byte=0;byte<64;byte++){
  const changed=structuredClone(input),signature=Buffer.from(changed[record][field],'base64');
  assert.equal(signature.length,64);signature[byte]^=1;changed[record][field]=signature.toString('base64');
  const result=inspectAuthority(changed);assert.equal(result.decision,'DENY',`${record}.${field} byte ${byte}`);assert.equal(result.executionAuthorized,false);count++;
 }
 assert.equal(count,320);
});
