import test from "node:test";
import assert from "node:assert/strict";
import {normalizeContribution,contributionDigest,contributionId,scoreContribution,reputationTable} from "../lib/human-signal.mjs";

test("normalizes and hashes contribution deterministically",()=>{
  const a=normalizeContribution({type:"code",title:"  Add invariant test  ",summary:"A deterministic contribution that improves launch verification behavior.",evidenceUrl:"https://github.com/Roberhood314/COHIBA/pull/1#x",contributor:"alice"});
  const b=normalizeContribution({...a});
  assert.equal(contributionDigest(a),contributionDigest(b));
  assert.match(contributionId(contributionDigest(a)),/^HSP-[A-F0-9]{16}$/);
});

test("rejects unsupported evidence schemes",()=>{
  assert.throws(()=>normalizeContribution({type:"CODE",title:"Valid title",summary:"A sufficiently long summary for validation.",evidenceUrl:"javascript:alert(1)"}),/INVALID_EVIDENCE_URL/);
});

test("unverified work receives no reputation",()=>{
  assert.equal(scoreContribution({type:"SECURITY",status:"SUBMITTED"}),0);
  assert.equal(scoreContribution({type:"SECURITY",status:"VERIFIED"}),30);
});

test("reputation derives only from verified records",()=>{
  const rows=reputationTable([
    {contributor:"alice",type:"CODE",status:"VERIFIED"},
    {contributor:"alice",type:"SECURITY",status:"SUBMITTED"},
    {contributor:"bob",type:"CREATIVE",status:"VERIFIED"}
  ]);
  assert.deepEqual(rows[0],{contributor:"alice",reputationPoints:25,verifiedContributions:1,types:{CODE:1}});
});
