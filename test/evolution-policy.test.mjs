import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEvolutionGate,CHANGE_CLASSES,CRYPTO_AGILITY_POLICY} from "../lib/evolution-policy.mjs";

test("safe reversible verified patch may enter automatic rollout",()=>{
  const r=evaluateEvolutionGate({tags:["performance"],testsPassed:true,securityPassed:true,rollbackDefined:true});
  assert.equal(r.changeClass,CHANGE_CLASSES.PERFORMANCE);
  assert.equal(r.automaticEligible,true);
  assert.equal(r.requiresHumanApproval,false);
});

test("Mainnet can never be autonomously approved",()=>{
  const r=evaluateEvolutionGate({tags:["mainnet"],testsPassed:true,securityPassed:true,rollbackDefined:true});
  assert.equal(r.changeClass,CHANGE_CLASSES.MAINNET);
  assert.equal(r.automaticEligible,false);
  assert.equal(r.requiresHumanApproval,true);
});

test("economics identity schema crypto remain human-gated",()=>{
  for(const tags of [["economics"],["auth"],["identity"],["schema"],["crypto"]]){
    const r=evaluateEvolutionGate({tags,testsPassed:true,securityPassed:true,rollbackDefined:true});
    assert.equal(r.automaticEligible,false);
  }
});

test("missing rollback or verification blocks automatic rollout",()=>{
  assert.equal(evaluateEvolutionGate({tags:["security"],testsPassed:true,securityPassed:true,rollbackDefined:false}).automaticEligible,false);
  assert.equal(evaluateEvolutionGate({tags:["security"],testsPassed:false,securityPassed:true,rollbackDefined:true}).automaticEligible,false);
});

test("data loss authority secrets irreversible or Mainnet are hard stops",()=>{
  for(const field of ["dataLossRisk","changesAuthority","changesSecrets","irreversible","touchesMainnet"]){
    const input={tags:["safe_patch"],testsPassed:true,securityPassed:true,rollbackDefined:true,[field]:true};
    const r=evaluateEvolutionGate(input);
    assert.equal(r.automaticEligible,false);
    assert.equal(r.reason,"HIGH_IMPACT_OR_IRREVERSIBLE");
  }
});

test("crypto agility never relies on algorithm secrecy",()=>{
  assert.ok(CRYPTO_AGILITY_POLICY.requirements.some(x=>x.includes("no proprietary secrecy")));
});
