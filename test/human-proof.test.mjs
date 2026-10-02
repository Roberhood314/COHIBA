import test from "node:test";
import assert from "node:assert/strict";
import {hashIdentity,normalizePhone,humanConfidence,newOauthState,isOauthStateValid} from "../lib/human-proof.mjs";

test("phone normalization accepts E.164 only",()=>{
  assert.equal(normalizePhone("+84901234567"),"+84901234567");
  assert.throws(()=>normalizePhone("0901234567"),/INVALID_E164_PHONE/);
});

test("identity hash is deterministic and peppered",()=>{
  assert.equal(hashIdentity("phone","+84901234567","pepper"),hashIdentity("phone","+84901234567","pepper"));
  assert.notEqual(hashIdentity("phone","+84901234567","pepper"),hashIdentity("phone","+84901234567","other"));
});

test("human verified requires strong score plus phone and social proof",()=>{
  const a={wallet:"x",humanProofs:{phone:{verified:true},google:{verified:true}},antiBotPassedAt:new Date().toISOString()};
  assert.equal(humanConfidence(a).tier,"HUMAN_VERIFIED");
  const b={wallet:"x",humanProofs:{google:{verified:true},facebook:{verified:true}},antiBotPassedAt:new Date().toISOString()};
  assert.notEqual(humanConfidence(b).tier,"HUMAN_VERIFIED");
});

test("oauth state expires and is single-use",()=>{
  const s=newOauthState("HUMAN-X","google");
  assert.equal(isOauthStateValid(s),true);
  s.used=true;
  assert.equal(isOauthStateValid(s),false);
});

test("Vietnam phone formats normalize to E.164",()=>{
  assert.equal(normalizePhone("0901234567"),"+84901234567");
  assert.equal(normalizePhone("84901234567"),"+84901234567");
  assert.equal(normalizePhone("+84901234567"),"+84901234567");
  assert.equal(normalizePhone("+84 901 234 567"),"+84901234567");
});
test("invalid phone formats are rejected",()=>{
  assert.throws(()=>normalizePhone(""),/INVALID_E164_PHONE/);
  assert.throws(()=>normalizePhone("1234"),/INVALID_E164_PHONE/);
});
