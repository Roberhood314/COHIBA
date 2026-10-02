import test from "node:test";
import assert from "node:assert/strict";
import {createNodeJob,publicNodeJob,expectedNodeResult,verifyNodeJob,jobCooldownRemaining,NODE_JOB_COOLDOWN_MS} from "../lib/node-jobs.mjs";

test("node job exposes no server-only expected result",()=>{
  const now=Date.parse("2026-10-02T12:00:00Z");
  const job=createNodeJob("COH-TEST",{now,nonce:"00112233445566778899aabbccddeeff"});
  const pub=publicNodeJob(job);
  assert.equal(pub.id,job.id);
  assert.equal("expectedResult" in pub,false);
  assert.equal(pub.type,"DATA_INTEGRITY_V1");
});

test("valid deterministic node result verifies",()=>{
  const now=Date.parse("2026-10-02T12:00:00Z");
  const job=createNodeJob("COH-TEST",{now,nonce:"00112233445566778899aabbccddeeff"});
  const result=expectedNodeResult(job);
  assert.deepEqual(verifyNodeJob(job,result,now+1000),{ok:true});
});

test("wrong or expired node result is rejected",()=>{
  const now=Date.parse("2026-10-02T12:00:00Z");
  const job=createNodeJob("COH-TEST",{now,nonce:"00112233445566778899aabbccddeeff"});
  assert.equal(verifyNodeJob(job,"00".repeat(32),now+1000).ok,false);
  assert.equal(verifyNodeJob(job,expectedNodeResult(job),Date.parse(job.expiresAt)+1).error,"NODE_JOB_EXPIRED");
});

test("node job cooldown prevents rapid reward farming",()=>{
  const now=Date.parse("2026-10-02T12:00:00Z");
  const job=createNodeJob("COH-TEST",{now,nonce:"00112233445566778899aabbccddeeff"});
  assert.equal(jobCooldownRemaining([job],now+60_000),NODE_JOB_COOLDOWN_MS-60_000);
  assert.equal(jobCooldownRemaining([job],now+NODE_JOB_COOLDOWN_MS+1),0);
});
