import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAuthorityModel} from '../scripts/si-model-check.mjs';
test('bounded authority model explores safety transitions and preserves unsupported-design counterexamples',()=>{
 const r=checkAuthorityModel();assert.ok(r.states>100);assert.ok(r.transitions>r.states);assert.ok(r.admissions>0);assert.equal(r.universalImplementationProof,false);assert.equal(r.negativeWitnesses.length,3);
});
