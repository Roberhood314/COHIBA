export const RESOURCE_MINING_VERSION="0.1";
export const RESOURCE_WEIGHTS=Object.freeze({
  uptime:0.30,
  usefulWork:0.25,
  reliability:0.20,
  storage:0.15,
  network:0.10
});

const DAY_MS=24*60*60*1000;
const WEEK_MS=7*DAY_MS;
const BUCKET_MS=10*60*1000;

function clamp01(v){return Math.min(1,Math.max(0,Number(v)||0));}
function validTimes(items,now,windowMs){
  return (Array.isArray(items)?items:[])
    .map(x=>Date.parse(typeof x==="string"?x:x?.at))
    .filter(t=>Number.isFinite(t)&&t<=now&&t>=now-windowMs);
}
function uniqueBuckets(times){
  return new Set(times.map(t=>Math.floor(t/BUCKET_MS))).size;
}
function countVerified(items,now,windowMs,type=null){
  return (Array.isArray(items)?items:[]).filter(x=>{
    const t=Date.parse(x?.verifiedAt||x?.at||"");
    return Number.isFinite(t)&&t<=now&&t>=now-windowMs&&x?.verified===true&&(!type||x?.type===type);
  }).length;
}

export function resourceContributionScore(profile,now=Date.now()){
  const proof=profile?.resourceProof||{};
  const heartbeatTimes=validTimes(proof.heartbeats,now,DAY_MS);
  const buckets=uniqueBuckets(heartbeatTimes);

  // Full browser uptime component at 6 hours of distinct 10-minute availability buckets.
  // This avoids rewarding raw CPU/GPU use and prevents sub-minute heartbeat spam from increasing score.
  const uptime=clamp01(buckets/36);

  const verifiedJobs=countVerified(proof.jobs,now,WEEK_MS);
  const usefulWork=clamp01(verifiedJobs/20);

  // Reliability is based on sustained, server-observed availability plus verified job success.
  // A browser-only miner can earn part of this component; full score requires useful verified work.
  const continuity=clamp01(buckets/24);
  const jobReliability=verifiedJobs>0
    ? clamp01((proof.jobs||[]).filter(x=>x?.verified===true).length/Math.max(1,(proof.jobs||[]).length))
    : 0;
  const reliability=clamp01(0.60*continuity+0.40*jobReliability);

  const storage=clamp01(countVerified(proof.storageProofs,now,WEEK_MS)/24);
  const network=clamp01(countVerified(proof.networkJobs,now,WEEK_MS)/50);

  const components={uptime,usefulWork,reliability,storage,network};
  const score=Object.entries(RESOURCE_WEIGHTS).reduce((sum,[k,w])=>sum+w*components[k],0);

  return {
    version:RESOURCE_MINING_VERSION,
    score:Number(score.toFixed(8)),
    components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Number(v.toFixed(8))])),
    weights:RESOURCE_WEIGHTS,
    evidence:{
      heartbeatBuckets24h:buckets,
      verifiedJobs7d:verifiedJobs,
      verifiedStorageProofs7d:countVerified(proof.storageProofs,now,WEEK_MS),
      verifiedNetworkJobs7d:countVerified(proof.networkJobs,now,WEEK_MS)
    },
    policy:{
      cpuGpuUsageRewarded:false,
      passiveBandwidthRewarded:false,
      clientReportedPerformanceTrusted:false,
      verifiedUsefulWorkRequiredForNodeRewards:true
    }
  };
}

export function recordResourceHeartbeat(profile,now=Date.now()){
  profile.resourceProof=profile.resourceProof&&typeof profile.resourceProof==="object"?profile.resourceProof:{};
  const cutoff=now-2*DAY_MS;
  const heartbeats=(Array.isArray(profile.resourceProof.heartbeats)?profile.resourceProof.heartbeats:[])
    .filter(x=>Date.parse(typeof x==="string"?x:x?.at)>=cutoff);

  const last=heartbeats.length?Date.parse(typeof heartbeats[heartbeats.length-1]==="string"?heartbeats[heartbeats.length-1]:heartbeats[heartbeats.length-1]?.at):0;
  const accepted=!Number.isFinite(last)||now-last>=5*60*1000;
  if(accepted) heartbeats.push({at:new Date(now).toISOString(),source:"WEB_AUTH_SESSION"});
  profile.resourceProof.heartbeats=heartbeats.slice(-600);
  return {accepted,recordedAt:accepted?new Date(now).toISOString():null};
}
