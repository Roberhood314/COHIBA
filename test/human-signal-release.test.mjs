import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {humanSignalReleaseReadiness,HUMAN_SIGNAL_GATES} from '../lib/human-signal-release.mjs';
const sha='a'.repeat(40),entry={reviewedCommit:sha,operator:'independent operator',evidenceUrl:'https://example.org/report',reportSha256:'b'.repeat(64),accepted:true,retestComplete:true,unresolvedCriticalHigh:0};
const full=()=>({schemaVersion:'HS_RELEASE_GATES_1',auditPreparationComplete:true,gates:Object.fromEntries(HUMAN_SIGNAL_GATES.map(k=>[k,{...entry}]))});
test('current registry and malformed evidence remain PRE_AUDIT and blocked',()=>{
 const current=JSON.parse(fs.readFileSync(new URL('../release/human-signal-gates.json',import.meta.url)));
 for(const r of [current,null,{}, {...full(),schemaVersion:'other'}]){const result=humanSignalReleaseReadiness(r,sha);assert.equal(result.status,'PRE_AUDIT');assert.equal(result.openReleaseEligible,false);assert.equal(result.blockedBy.length,4);}
});
test('all four recorded gates must match exact commit, evidence and retest',()=>{
 assert.equal(humanSignalReleaseReadiness(full(),sha).openReleaseEligible,true);
 for(const gate of HUMAN_SIGNAL_GATES)for(const mutation of [e=>e.reviewedCommit='c'.repeat(40),e=>e.evidenceUrl='http://example.org',e=>e.reportSha256='',e=>e.operator='',e=>e.accepted=false,e=>e.retestComplete=false,e=>e.unresolvedCriticalHigh=1]){const r=full();mutation(r.gates[gate]);const out=humanSignalReleaseReadiness(r,sha);assert.equal(out.openReleaseEligible,false);assert.equal(out.status,'AUDIT_READY');assert.deepEqual(out.blockedBy,[gate]);}
 assert.equal(humanSignalReleaseReadiness(full(),null).openReleaseEligible,false);
});
