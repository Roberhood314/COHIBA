import test from "node:test";
import assert from "node:assert/strict";
import {systemBaseRate,calculateMiningRate,newMiningSession,claimablePoints,applyClaim,pioneerBonus} from "../lib/signal-mining.mjs";

test("base rate declines smoothly as verified network grows",()=>{
  assert.equal(systemBaseRate(0),1);
  assert.ok(systemBaseRate(10000)<1);
  assert.ok(systemBaseRate(100000)<systemBaseRate(10000));
});

test("trust, streak and verified contribution increase rate but remain bounded",()=>{
  const profile={pioneer:true,activeDays:10,streak:30,trustConnections:["a","b","c","d","e","f"]};
  const x=calculateMiningRate({profile,profileCount:10000,verifiedReputation30d:500,meaningfulActions7d:500});
  assert.ok(x.rate>x.baseRate);
  assert.ok(x.multipliers.trust<=0.4);
  assert.ok(x.multipliers.streak<=0.2);
  assert.ok(x.multipliers.contribution<=0.75);
  assert.ok(x.multipliers.utility<=0.35);
});

test("pioneer bonus decays and disappears after 180 active days",()=>{
  assert.ok(pioneerBonus({pioneer:true,activeDays:0})>0);
  assert.equal(pioneerBonus({pioneer:true,activeDays:180}),0);
  assert.equal(pioneerBonus({pioneer:false,activeDays:0}),0);
});

test("session accrues server-side by elapsed time and caps at 24h",()=>{
  const now=Date.parse("2026-10-02T00:00:00Z");
  const profile={signalPoints:0,pendingCoh:0};
  const s=newMiningSession("HUMAN-X",{rate:2},now);
  assert.equal(claimablePoints(s,now+3600000),2);
  const r=applyClaim(s,profile,now+25*3600000);
  assert.equal(r.amount,48);
  assert.equal(profile.signalPoints,48);
  assert.equal(profile.pendingCoh,48);
  assert.equal(r.pendingCohAdded,48);
  assert.equal(s.status,"COMPLETED");
});


test("pending COH ledger is additive and independent from on-chain token state",()=>{
  const now=Date.parse("2026-10-02T00:00:00Z");
  const profile={signalPoints:10,pendingCoh:7.5};
  const s=newMiningSession("HUMAN-Y",{rate:1},now);
  const r=applyClaim(s,profile,now+2*3600000);
  assert.equal(r.amount,2);
  assert.equal(profile.signalPoints,12);
  assert.equal(profile.pendingCoh,9.5);
  assert.equal(r.pendingCohAdded,2);
});
