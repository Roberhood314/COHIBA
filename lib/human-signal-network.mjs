import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const MAX_TRUST_CONNECTIONS=5;
export const SESSION_TTL_MS=24*60*60*1000;
export const CHALLENGE_TTL_MS=10*60*1000;

export function profileIdForWallet(wallet){
  const pk=new PublicKey(String(wallet));
  const digest=crypto.createHash("sha256").update(pk.toBuffer()).digest("hex");
  return "HUMAN-"+digest.slice(0,12).toUpperCase();
}

export function createWalletChallenge(wallet,origin="https://cohibameme.site"){
  const pk=new PublicKey(String(wallet)).toBase58();
  const nonce=crypto.randomBytes(24).toString("hex");
  const challengeId=crypto.randomBytes(16).toString("hex");
  const expiresAt=new Date(Date.now()+CHALLENGE_TTL_MS).toISOString();
  const message=[
    "COHIBA Human Signal",
    "Verify wallet ownership to join the Human Signal network.",
    "This signature does not authorize a transaction or token transfer.",
    `Wallet: ${pk}`,
    `Origin: ${origin}`,
    `Challenge: ${challengeId}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`
  ].join("\n");
  return {challengeId,wallet:pk,nonce,message,expiresAt,createdAt:new Date().toISOString(),used:false};
}

export function verifySolanaMessage(wallet,message,signatureBase64){
  const pk=new PublicKey(String(wallet));
  const sig=Buffer.from(String(signatureBase64),"base64");
  if(sig.length!==64) return false;
  const raw=pk.toBuffer();
  const spkiPrefix=Buffer.from("302a300506032b6570032100","hex");
  const key=crypto.createPublicKey({key:Buffer.concat([spkiPrefix,raw]),format:"der",type:"spki"});
  return crypto.verify(null,Buffer.from(String(message),"utf8"),key,sig);
}

export function newSession(profileId){
  const token=crypto.randomBytes(32).toString("base64url");
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  return {
    token,
    record:{
      tokenHash,
      profileId,
      createdAt:new Date().toISOString(),
      expiresAt:new Date(Date.now()+SESSION_TTL_MS).toISOString()
    }
  };
}

export function hashSessionToken(token){
  return crypto.createHash("sha256").update(String(token||"")).digest("hex");
}

export function isSessionValid(session){
  return Boolean(session && Date.parse(session.expiresAt)>Date.now());
}

export function utcDay(value=Date.now()){
  return new Date(value).toISOString().slice(0,10);
}

export function nextStreak(previousDay,currentStreak,today=utcDay()){
  if(!previousDay) return 1;
  if(previousDay===today) return Math.max(1,Number(currentStreak)||1);
  const prev=new Date(previousDay+"T00:00:00Z");
  const cur=new Date(today+"T00:00:00Z");
  const delta=Math.round((cur-prev)/86400000);
  return delta===1?Math.max(1,Number(currentStreak)||0)+1:1;
}

export function deriveRoles(profile,contributions=[]){
  const roles=new Set(["SIGNALER"]);
  const verified=contributions.filter(x=>x.status==="VERIFIED" && x.profileId===profile.id);
  if(verified.length) roles.add("CONTRIBUTOR");
  if(verified.some(x=>["CODE","SECURITY"].includes(x.type))) roles.add("BUILDER");
  if((profile.trustConnections||[]).length>=3) roles.add("CONNECTOR");
  if((profile.reviewCount||0)>0) roles.add("VERIFIER");
  return [...roles];
}

export function trustScore(profile){
  const trusted=Math.min(MAX_TRUST_CONNECTIONS,(profile.trustConnections||[]).length);
  const sessionComponent=Math.min(30,Number(profile.activeDays||0));
  const streakComponent=Math.min(20,Number(profile.streak||0)*2);
  const trustComponent=trusted*10;
  return sessionComponent+streakComponent+trustComponent;
}
