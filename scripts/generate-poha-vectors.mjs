import fs from 'node:fs';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
const now=Date.parse('2026-10-04T15:30:00.000Z');
const cases=[];
for(const [name,options] of [['human',{performer:'HUMAN'}],['agent',{}],['approval-required',{approvalRequired:true}],['approved',{approvalRequired:true,approve:true}]]){
 const f=fixture({now,...options});const r=f.core();cases.push({name,input:f.bundle,expected:{actorClass:r.actorClass,decision:r.decision,executionAuthorized:false}});
}
const revoked=fixture({now});revoked.bundle.status.payload.records[0].revoked=true;revoked.resignStatus();cases.push({name:'revoked',input:revoked.bundle,expected:{actorClass:'UNVERIFIED',decision:'DENY',executionAuthorized:false}});
fs.writeFileSync(new URL('../examples/independent-verifier/vectors.json',import.meta.url),JSON.stringify({version:'HS_PUBLIC_TEST_VECTORS_1',synthetic:true,warning:'Public synthetic keys. Historical clock for inspection only; never production admission.',cases},null,2)+'\n');
