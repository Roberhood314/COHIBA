import test from "node:test";
import assert from "node:assert/strict";
import {miningEligibility,onboardingChecklist,pioneerMissions,referralBoost} from "../lib/pioneer-support.mjs";

test("wallet is the minimum mining requirement",()=>{
  assert.equal(miningEligibility({}).eligible,false);
  assert.equal(miningEligibility({wallet:"x"}).eligible,true);
});

test("enforced human proof progressively limits rate",()=>{
  const basic=miningEligibility({wallet:"x"},{enforceHumanProof:true});
  assert.equal(basic.factor,0.5);
  const full=miningEligibility({wallet:"x",humanProofs:{phone:{verified:true},google:{verified:true}}},{enforceHumanProof:true});
  assert.equal(full.factor,1);
});

test("checklist and missions are deterministic",()=>{
  const p={wallet:"x",streak:7,trustConnections:["a","b","c"],humanProofs:{phone:{verified:true},google:{verified:true}},hasContribution:true};
  assert.ok(onboardingChecklist(p).some(x=>x.id==="wallet"&&x.done));
  assert.ok(pioneerMissions(p).every(x=>x.complete));
});

test("referral boost is capped",()=>{
  assert.ok(referralBoost(1)>0);
  assert.ok(referralBoost(100000)<=0.25);
});
