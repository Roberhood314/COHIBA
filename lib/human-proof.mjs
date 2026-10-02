import crypto from "node:crypto";

export const HUMAN_PROOF_VERSION="0.1";

export function hashIdentity(kind,value,pepper){
  if(!pepper) throw new Error("IDENTITY_PEPPER_NOT_CONFIGURED");
  const normalized=String(value||"").trim().toLowerCase();
  if(!normalized) throw new Error("IDENTITY_VALUE_REQUIRED");
  return crypto.createHmac("sha256",pepper).update(kind+"\n"+normalized).digest("hex");
}

export function normalizePhone(value){
  let raw=String(value||"").trim().replace(/[\s().-]/g,"");
  if(/^0\d{9}$/.test(raw)) raw="+84"+raw.slice(1);
  else if(/^84\d{9}$/.test(raw)) raw="+"+raw;
  if(!/^\+[1-9]\d{7,14}$/.test(raw)) throw new Error("INVALID_E164_PHONE");
  return raw;
}

export function newOauthState(profileId,provider,returnTo="/human-signal.html"){
  const state=crypto.randomBytes(24).toString("base64url");
  return {
    state,
    profileId,
    provider,
    returnTo:String(returnTo||"/human-signal.html").startsWith("/")?String(returnTo):"/human-signal.html",
    createdAt:new Date().toISOString(),
    expiresAt:new Date(Date.now()+10*60*1000).toISOString(),
    used:false
  };
}

export function isOauthStateValid(record){
  return Boolean(record && !record.used && Date.parse(record.expiresAt)>Date.now());
}

export function humanConfidence(profile){
  const proofs=profile?.humanProofs||{};
  let score=0;
  const breakdown={};
  if(profile?.wallet){ score+=15; breakdown.wallet=15; }
  if(proofs.phone?.verified){ score+=30; breakdown.phone=30; }
  if(proofs.google?.verified){ score+=25; breakdown.google=25; }
  if(proofs.facebook?.verified){ score+=20; breakdown.facebook=20; }
  if(profile?.antiBotPassedAt){ score+=10; breakdown.antiBot=10; }
  score=Math.min(100,score);
  let tier="UNVERIFIED";
  if(score>=70 && proofs.phone?.verified && (proofs.google?.verified||proofs.facebook?.verified)) tier="HUMAN_VERIFIED";
  else if(score>=45) tier="STRONG_SIGNAL";
  else if(score>=20) tier="BASIC_SIGNAL";
  return {score,tier,breakdown,version:HUMAN_PROOF_VERSION};
}

export function publicHumanProof(profile){
  const p=profile?.humanProofs||{};
  const safe=x=>x?.verified?{verified:true,verifiedAt:x.verifiedAt||null}: {verified:false,verifiedAt:null};
  return {
    phone:safe(p.phone),
    google:safe(p.google),
    facebook:safe(p.facebook),
    antiBot:Boolean(profile?.antiBotPassedAt),
    confidence:humanConfidence(profile),
    uniquenessGuaranteed:false,
    note:"Multi-signal verification raises confidence that a real person controls the linked accounts/devices; it does not prove global one-person-one-account uniqueness."
  };
}
