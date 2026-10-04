// Standalone: imports only the distributable verifier and public vectors.
import fs from 'node:fs';
import {inspectAuthority} from '../../packages/authority-verifier/index.mjs';
const vectors=JSON.parse(fs.readFileSync(new URL('./vectors.json',import.meta.url),'utf8'));
for(const item of vectors.cases){const result=inspectAuthority(item.input);if(result.actorClass!==item.expected.actorClass||result.decision!==item.expected.decision||result.executionAuthorized)throw Error('VECTOR_FAILED: '+item.name);console.log(JSON.stringify({case:item.name,actorClass:result.actorClass,decision:result.decision,executionAuthorized:result.executionAuthorized}));}
