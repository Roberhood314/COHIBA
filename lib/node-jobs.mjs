import crypto from "node:crypto";

export const NODE_PROTOCOL_VERSION="0.1";
export const NODE_JOB_TTL_MS=5*60*1000;
export const NODE_JOB_COOLDOWN_MS=10*60*1000;
export const NODE_JOB_TYPE="DATA_INTEGRITY_V1";

function sha256(value){
  return crypto.createHash("sha256").update(String(value),"utf8").digest("hex");
}

export function canonicalNodePayload(job){
  const p=job?.payload||{};
  const chunks=Array.isArray(p.chunks)?p.chunks.map(x=>String(x)):[];
  return JSON.stringify({
    protocol:"COHIBA_NODE",
    version:NODE_PROTOCOL_VERSION,
    type:NODE_JOB_TYPE,
    nonce:String(p.nonce||""),
    chunks
  });
}

export function expectedNodeResult(job){
  return sha256(canonicalNodePayload(job));
}

export function createNodeJob(profileId,{now=Date.now(),nonce=null}={}){
  const issuedAt=new Date(now).toISOString();
  const expiresAt=new Date(now+NODE_JOB_TTL_MS).toISOString();
  const actualNonce=nonce||crypto.randomBytes(16).toString("hex");
  const job={
    id:"NODE-"+crypto.randomBytes(10).toString("hex").toUpperCase(),
    profileId:String(profileId),
    protocolVersion:NODE_PROTOCOL_VERSION,
    type:NODE_JOB_TYPE,
    issuedAt,
    expiresAt,
    status:"ISSUED",
    payload:{
      nonce:actualNonce,
      chunks:[
        "COHIBA",
        "COH",
        "1000000000",
        "9",
        "HYBRID_HUMAN_RESOURCE_V0.2"
      ]
    }
  };
  job.expectedResult=expectedNodeResult(job);
  return job;
}

export function publicNodeJob(job){
  return {
    id:job.id,
    protocolVersion:job.protocolVersion,
    type:job.type,
    issuedAt:job.issuedAt,
    expiresAt:job.expiresAt,
    payload:job.payload
  };
}

export function verifyNodeJob(job,result,now=Date.now()){
  if(!job || job.status!=="ISSUED") return {ok:false,error:"NODE_JOB_NOT_ACTIVE"};
  if(Date.parse(job.expiresAt)<=now) return {ok:false,error:"NODE_JOB_EXPIRED"};
  const supplied=String(result||"").trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(supplied)) return {ok:false,error:"NODE_JOB_RESULT_INVALID"};
  const a=Buffer.from(supplied,"hex");
  const b=Buffer.from(String(job.expectedResult||""),"hex");
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return {ok:false,error:"NODE_JOB_RESULT_MISMATCH"};
  return {ok:true};
}

export function jobCooldownRemaining(nodeJobs,now=Date.now()){
  const recent=(Array.isArray(nodeJobs)?nodeJobs:[])
    .map(x=>Date.parse(x?.issuedAt||""))
    .filter(Number.isFinite)
    .sort((a,b)=>b-a)[0];
  if(!recent) return 0;
  return Math.max(0,NODE_JOB_COOLDOWN_MS-(now-recent));
}
