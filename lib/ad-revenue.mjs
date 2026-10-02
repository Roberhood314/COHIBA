import crypto from "node:crypto";

export const AD_REWARD_VERSION="0.1";
export const AD_SESSION_TTL_MS=15*60*1000;
export const AD_DAILY_LIMIT=8;

export function newAdRewardSession(profileId,provider,placementId,now=Date.now()){
  return {
    id:"AD-"+crypto.randomBytes(10).toString("hex").toUpperCase(),
    profileId,
    provider:String(provider||"unconfigured"),
    placementId:String(placementId||"cohiba-rewarded"),
    createdAt:new Date(now).toISOString(),
    expiresAt:new Date(now+AD_SESSION_TTL_MS).toISOString(),
    completedAt:null,
    status:"CREATED",
    rewardApplied:false,
    providerEventId:null,
    estimatedRevenueMicros:0
  };
}

export function isAdSessionActive(session,now=Date.now()){
  return Boolean(session && session.status==="CREATED" && Date.parse(session.expiresAt)>now);
}

export function completedAdsForDay(sessions,profileId,day){
  return (sessions||[]).filter(x=>x.profileId===profileId && x.status==="COMPLETED" && String(x.completedAt||"").slice(0,10)===day).length;
}

export function canStartRewardedAd(sessions,profileId,now=Date.now()){
  const day=new Date(now).toISOString().slice(0,10);
  return completedAdsForDay(sessions,profileId,day)<AD_DAILY_LIMIT;
}

export function applyRewardedAdCompletion(session,profile,{providerEventId,estimatedRevenueMicros=0,rewardSp=0.25},now=Date.now()){
  if(!session) throw new Error("AD_SESSION_NOT_FOUND");
  if(session.status==="COMPLETED") return {duplicate:true,rewardSp:0};
  if(Date.parse(session.expiresAt)<=now) throw new Error("AD_SESSION_EXPIRED");
  session.status="COMPLETED";
  session.completedAt=new Date(now).toISOString();
  session.providerEventId=String(providerEventId||"");
  session.estimatedRevenueMicros=Math.max(0,Math.trunc(Number(estimatedRevenueMicros)||0));
  if(!session.rewardApplied){
    const reward=Math.max(0,Math.min(1,Number(rewardSp)||0));
    profile.signalPoints=Number((Number(profile.signalPoints||0)+reward).toFixed(8));
    profile.adRewardSp=Number((Number(profile.adRewardSp||0)+reward).toFixed(8));
    session.rewardApplied=true;
    return {duplicate:false,rewardSp:reward};
  }
  return {duplicate:false,rewardSp:0};
}

export function publicAdSummary(store,profileId=null){
  const sessions=Array.isArray(store?.sessions)?store.sessions:[];
  const completed=sessions.filter(x=>x.status==="COMPLETED");
  const mine=profileId?completed.filter(x=>x.profileId===profileId):completed;
  return {
    completedViews:mine.length,
    estimatedRevenueMicros:mine.reduce((n,x)=>n+Math.max(0,Number(x.estimatedRevenueMicros)||0),0),
    rewardedSp:Number(mine.reduce((n,x)=>n+Number(x.rewardApplied?0.25:0),0).toFixed(8))
  };
}
