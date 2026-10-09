import fs from 'node:fs';
import {inspectHybridAuthority} from '../../packages/hs2-verifier/index.mjs';
const file=process.argv[2]||new URL('../../web/public/hs2-vectors.json',import.meta.url);
const vector=JSON.parse(fs.readFileSync(file,'utf8'));
const result=inspectHybridAuthority(vector.input,{...vector.options,now:Date.parse(vector.evaluationTime)});
console.log(JSON.stringify({...result,historicalFixture:true},null,2));
if(result.decision!=='ALLOW'||!result.pqVerified||result.executionAuthorized)process.exitCode=1;
