import fs from 'node:fs';
import {hybridFixture} from '../examples/hs2/fixture.mjs';
import {inspectHybridAuthority} from '../packages/hs2-verifier/index.mjs';
import {encode64,HS2_LENGTHS} from '../packages/hs2-verifier/wire.mjs';
// Historical timestamp intentionally makes this a reproducible inspection,
// not a fresh authorization usable by the public website.
const now=Date.parse('2026-10-09T00:00:00.000Z'),f=hybridFixture({now});
const inspection=inspectHybridAuthority(f.input,{...f.options,now});
if(inspection.decision!=='ALLOW'||!inspection.pqVerified||inspection.executionAuthorized)throw Error('HS2_LAB_GENERATION_FAILED');
const checks=f.contexts.map(c=>({...c,classicalBytes:encode64(c.classicalBytes),edPublicKey:c.edPublicKey||f.options.trust['synthetic-issuer'].publicKey}));
const report={schema:'HS2_PUBLIC_SYNTHETIC_LAB_1',version:f.input.version,suite:f.input.suite,historicalFixture:true,evaluationTime:new Date(now).toISOString(),executionAuthorized:false,signatureBytes:HS2_LENGTHS.signature,inspection,input:f.input,options:f.options,checks};
fs.writeFileSync(new URL('../web/public/hs2-vectors.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({schema:report.schema,checks:checks.length,inspection:inspection.decision,executionAuthorized:false,signatureBytes:report.signatureBytes}));
