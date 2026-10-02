import crypto from "node:crypto";

export const SIGNAL_MINING_VERSION="0.1";
export const SESSION_MAX_MS=24*60*60*1000;
export const PIONEER_COHORT_SIZE=10_000;
export const MAX_TRUST_CONNECTIONS_FOR_MINING=5;

export function systemBaseRate(profileCount){
  const n=Math.max(0,Number(profileCount)||0);
  // Smooth decline: 1.000 SP/h at launch, ~0.707 at 10k, 0.301 at 100k.
  return 1/Math.sqrt(1+n/10_000);
}

export function pioneerBonus(profile){
  if(!profile?.pioneer) return 0;
  const days=Math.max(0,Number(profile.activeDays)||0);
  // Early contribution boost fades with participation age; never permanent privilege.
  return Math.max(0,0.25*(1-Math.min(days,180)/180));
}

export function trustBoost(profile){
  const c=Math.min(MAX_TRUST_CONNECTIONS_FOR_MINING,Math.max(0,(profile?.trustConnections||[]).length));
  return c*0.08; // max +40%
}

export function streakBoost(profile){
  const streak=Math.max(0,Number(profile?.streak)||0);
  return Math.min(0.20,Math.log2(1+streak)*0.04);
}

export function contributionBoost(verifiedReputation30d){
  const x=Math.max(0,Number(verifiedReputation30d)||0);
  return Math.min(0.75,(Math.log1p(x)/Math.log(101))*0.75);
}

export function utilityBoost(meaningfulActions7d){
  const x=Math.max(0,Number(meaningfulActions7d)||0);
  return Math.min(0.35,(Math.log1p(x)/Math.log(31))*0.35);
}

export function calculateMiningRate({profile,profileCount,verifiedReputation30d=0,meaningfulActions7d=0}){
  const base=systemBaseRate(profileCount);
  const multipliers={
    pioneer:pioneerBonus(profile),
    trust:trustBoost(profile),
    streak:streakBoost(profile),
    contribution:contributionBoost(verifiedReputation30d),
    utility:utilityBoost(meaningfulActions7d)
  };
  const totalMultiplier=1+Object.values(multipliers).reduce((a,b)=>a+b,0);
  return {
    version:SIGNAL_MINING_VERSION,
    unit:"SP_PER_HOUR",
    baseRate:Number(base.toFixed(8)),
    totalMultiplier:Number(totalMultiplier.toFixed(8)),
    rate:Number((base*totalMultiplier).toFixed(8)),
    multipliers
  };
}

export function newMiningSession(profileId,rateSnapshot,now=Date.now()){
  return {
    id:"MINE-"+crypto.randomBytes(10).toString("hex").toUpperCase(),
    profileId,
    version:SIGNAL_MINING_VERSION,
    startedAt:new Date(now).toISOString(),
    endsAt:new Date(now+SESSION_MAX_MS).toISOString(),
    lastClaimAt:new Date(now).toISOString(),
    rateSnapshot,
    claimedPoints:0,
    status:"ACTIVE"
  };
}

export function claimablePoints(session,now=Date.now()){
  if(!session || session.status!=="ACTIVE") return 0;
  const start=Date.parse(session.lastClaimAt||session.startedAt);
  const end=Math.min(now,Date.parse(session.endsAt));
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return 0;
  const hours=(end-start)/3600000;
  return Number((hours*Number(session.rateSnapshot?.rate||0)).toFixed(8));
}

export function applyClaim(session,profile,now=Date.now()){
  const amount=claimablePoints(session,now);
  if(amount<=0) return {amount:0,ended:Date.parse(session.endsAt)<=now};
  session.claimedPoints=Number((Number(session.claimedPoints||0)+amount).toFixed(8));
  session.lastClaimAt=new Date(Math.min(now,Date.parse(session.endsAt))).toISOString();
  const ended=Date.parse(session.endsAt)<=now;
  if(ended) session.status="COMPLETED";
  profile.signalPoints=Number((Number(profile.signalPoints||0)+amount).toFixed(8));
  return {amount,ended};
}

export function publicMiningSession(session,now=Date.now()){
  return {
    id:session.id,
    version:session.version,
    startedAt:session.startedAt,
    endsAt:session.endsAt,
    lastClaimAt:session.lastClaimAt,
    status:session.status,
    claimedPoints:Number(session.claimedPoints||0),
    claimablePoints:claimablePoints(session,now),
    rateSnapshot:session.rateSnapshot
  };
}
