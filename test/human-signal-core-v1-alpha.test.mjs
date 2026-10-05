import test from "node:test";
import assert from "node:assert/strict";
import {createAuthorityEnvelope,verifyProtectedAction,commitProtectedAction,revokeAuthorityRoot,projectStateProjection,guardDirectHumanMutation,enforcementStatus} from "../lib/human-signal-core-v1-alpha.mjs";

function env(actions,effects,budget=3){
 return createAuthorityEnvelope({rootId:"HUMAN-ABCDEF123456",subject:"cohiba-agent",actions,effects,budget,
  expiresAt:new Date(Date.now()+3600000).toISOString(),nonce:"n-"+Math.random()});
}

test("project state binds existing COHIBA domains",()=>{
 const p=projectStateProjection({profiles:[{id:"HUMAN-ABCDEF123456"}],contributions:[{id:"C1"}],apps:[{id:"A1"}],miningSessions:[{id:"M1"}]});
 assert.equal(typeof p.projectRoot,"string"); assert.equal(p.projectRoot.length,64);
 assert.ok(p.domainHashes.profiles); assert.ok(p.domainHashes.miningSessions);
});

test("mining claim protected action can commit",()=>{
 const store={profiles:[],events:[]};
 const e=env(["MINING_CLAIM"],["PENDING_COH_WRITE"]);
 const r=commitProtectedAction(store,{envelope:e,action:"MINING_CLAIM",subject:"cohiba-agent",receiptData:{amount:1}});
 assert.equal(r.verdict,"ALLOW"); assert.equal(r.receipt.action,"MINING_CLAIM");
});

test("effect escape denied",()=>{
 const e=env(["MINING_CLAIM"],["IDENTITY_WRITE"]);
 assert.equal(verifyProtectedAction({envelope:e,action:"MINING_CLAIM",subject:"cohiba-agent"}).reason,"EFFECT_ESCAPE");
});

test("revocation blocks new commit",()=>{
 const store={}; const e=env(["APP_REGISTER"],["APP_REGISTRY_WRITE"]);
 revokeAuthorityRoot(store,e.rootId);
 const r=commitProtectedAction(store,{envelope:e,action:"APP_REGISTER",subject:"cohiba-agent"});
 assert.equal(r.reason,"REVOKED");
});

test("critical mainnet action is not implicitly authorized",()=>{
 const e=env(["MINING_CLAIM"],["PENDING_COH_WRITE"]);
 const r=verifyProtectedAction({envelope:e,action:"MAINNET_LAUNCH",subject:"cohiba-agent"});
 assert.equal(r.verdict,"DENY");
});


test("authenticated human mutation adapter emits authority receipt",()=>{
 const store={profiles:[{id:"HUMAN-ABCDEF123456"}]};
 const r=guardDirectHumanMutation(store,{profileId:"HUMAN-ABCDEF123456",action:"MINING_START",receiptData:{route:"/mining/start"},nonce:"request-1"});
 assert.equal(r.verdict,"ALLOW");
 assert.equal(enforcementStatus(store).receipts,1);
});

test("direct human adapter fails closed for unknown protected action",()=>{
 assert.throws(()=>guardDirectHumanMutation({}, {profileId:"HUMAN-ABCDEF123456",action:"NOT_REAL"}),/UNKNOWN_ACTION/);
});
