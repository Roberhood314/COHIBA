import test from "node:test";
import assert from "node:assert/strict";
import {resourceContributionScore,recordResourceHeartbeat,RESOURCE_WEIGHTS} from "../lib/resource-mining.mjs";

test("resource weights add to 100%",()=>{
  const total=Object.values(RESOURCE_WEIGHTS).reduce((a,b)=>a+b,0);
  assert.equal(Number(total.toFixed(8)),1);
});

test("browser heartbeat is server-time based and rate-limited to five minutes",()=>{
  const now=Date.parse("2026-10-02T00:00:00Z");
  const profile={};
  const a=recordResourceHeartbeat(profile,now);
  const b=recordResourceHeartbeat(profile,now+60_000);
  const c=recordResourceHeartbeat(profile,now+5*60_000);
  assert.equal(a.accepted,true);
  assert.equal(b.accepted,false);
  assert.equal(c.accepted,true);
  assert.equal(profile.resourceProof.heartbeats.length,2);
});

test("resource score uses verified evidence and ignores client performance claims",()=>{
  const now=Date.parse("2026-10-02T12:00:00Z");
  const profile={resourceProof:{heartbeats:[],jobs:[],storageProofs:[],networkJobs:[]},cpuPercent:100,claimedBandwidthMbps:10000};
  for(let i=0;i<36;i++){
    profile.resourceProof.heartbeats.push({at:new Date(now-i*10*60_000).toISOString(),source:"WEB_AUTH_SESSION"});
  }
  const x=resourceContributionScore(profile,now);
  assert.equal(x.components.uptime,1);
  assert.equal(x.components.usefulWork,0);
  assert.equal(x.components.storage,0);
  assert.equal(x.components.network,0);
  assert.equal(x.policy.cpuGpuUsageRewarded,false);
  assert.equal(x.policy.passiveBandwidthRewarded,false);
  assert.ok(x.score>0);
  assert.ok(x.score<1);
});

test("verified node evidence can raise useful resource components",()=>{
  const now=Date.parse("2026-10-02T12:00:00Z");
  const profile={resourceProof:{heartbeats:[],jobs:[],storageProofs:[],networkJobs:[]}};
  for(let i=0;i<20;i++) profile.resourceProof.jobs.push({verified:true,verifiedAt:new Date(now-i*60_000).toISOString()});
  for(let i=0;i<24;i++) profile.resourceProof.storageProofs.push({verified:true,verifiedAt:new Date(now-i*60_000).toISOString()});
  for(let i=0;i<50;i++) profile.resourceProof.networkJobs.push({verified:true,verifiedAt:new Date(now-i*60_000).toISOString()});
  const x=resourceContributionScore(profile,now);
  assert.equal(x.components.usefulWork,1);
  assert.equal(x.components.storage,1);
  assert.equal(x.components.network,1);
});
