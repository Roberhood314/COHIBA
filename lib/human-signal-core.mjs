import crypto from "node:crypto";

export const HSC_VERSION="0.1";
export const CORE_EVENT_TYPES=new Set([
  "PROFILE_VERIFIED","DAILY_SIGNAL","TRUST_EDGE_ADDED","TRUST_EDGE_REMOVED",
  "CONTRIBUTION_SUBMITTED","CONTRIBUTION_VERIFIED","CONTRIBUTION_REJECTED",
  "APP_REGISTERED","APP_ACTION_RECORDED","MINING_STARTED","MINING_CLAIMED",
  "HUMAN_PROOF_UPDATED","STATE_ROOT_ANCHORED",
  "AGENT_REGISTERED","AGENT_REVOKED","DELEGATION_GRANTED","DELEGATION_REVOKED",
  "ACCOUNT_LOGIN","ACCOUNT_PASSWORD_UPDATED","ACCOUNT_LOGOUT",
  "COH_WALLET_ACTIVATED","MAINNET_PROFILE_REVIEWED","RESOURCE_JOB_VERIFIED"
]);

function canonical(value){
  if(value===null || typeof value!=="object") return JSON.stringify(value);
  if(Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
}

export function hashObject(value){
  return crypto.createHash("sha256").update(canonical(value),"utf8").digest("hex");
}

export function appendCoreEvent(store,{type,actor="SYSTEM",subject=null,data={}},now=new Date()){
  if(!CORE_EVENT_TYPES.has(type)) throw new Error("INVALID_CORE_EVENT_TYPE");
  store.events=Array.isArray(store.events)?store.events:[];
  const previousHash=store.events.length?store.events.at(-1).eventHash:null;
  const event={
    sequence:store.events.length+1,
    type,
    actor:String(actor||"SYSTEM").slice(0,120),
    subject:subject?String(subject).slice(0,160):null,
    data,
    createdAt:now.toISOString(),
    previousHash
  };
  event.eventHash=hashObject(event);
  store.events.push(event);
  return event;
}

export function verifyEventChain(events=[]){
  let prev=null;
  for(let i=0;i<events.length;i++){
    const e=events[i];
    if(e.sequence!==i+1 || e.previousHash!==prev) return {valid:false,index:i,reason:"CHAIN_LINK_INVALID"};
    const copy={...e}; delete copy.eventHash;
    if(hashObject(copy)!==e.eventHash) return {valid:false,index:i,reason:"EVENT_HASH_INVALID"};
    prev=e.eventHash;
  }
  return {valid:true,count:events.length,head:prev};
}

export function merkleRoot(hashes=[]){
  if(!hashes.length) return null;
  let level=hashes.map(h=>Buffer.from(h,"hex"));
  while(level.length>1){
    const next=[];
    for(let i=0;i<level.length;i+=2){
      const a=level[i],b=level[i+1]||a;
      next.push(crypto.createHash("sha256").update(Buffer.concat([a,b])).digest());
    }
    level=next;
  }
  return level[0].toString("hex");
}

export function coreStateRoot(store){
  const domains={
    profiles:hashObject((store.profiles||[]).map(p=>({
      id:p.id,activeDays:p.activeDays||0,streak:p.streak||0,
      trustConnections:[...(p.trustConnections||[])].sort(),
      signalPoints:p.signalPoints||0,pioneer:Boolean(p.pioneer)
    })).sort((a,b)=>a.id.localeCompare(b.id))),
    contributions:hashObject((store.contributions||[]).map(c=>({
      id:c.id,proofHash:c.proofHash,status:c.status,profileId:c.profileId||null,type:c.type
    })).sort((a,b)=>a.id.localeCompare(b.id))),
    apps:hashObject((store.apps||[]).map(a=>({
      id:a.id,name:a.name,status:a.status,developerProfileId:a.developerProfileId,
      utilityActions:a.utilityActions||0
    })).sort((a,b)=>a.id.localeCompare(b.id))),
    events:merkleRoot((store.events||[]).map(e=>e.eventHash))
  };
  // Preserve historical roots until agency records exist; bind permissions once introduced.
  if ((store.agents||[]).length || (store.delegations||[]).length) {
    domains.agency=hashObject({
      agents:[...(store.agents||[])].sort((a,b)=>a.id.localeCompare(b.id)),
      delegations:[...(store.delegations||[])].sort((a,b)=>a.id.localeCompare(b.id))
    });
  }
  if((store.pohaAgents||[]).length || (store.pohaDelegations||[]).length){
    domains.poha=hashObject({
      agents:[...(store.pohaAgents||[])].sort((a,b)=>a.id.localeCompare(b.id)),
      delegations:[...(store.pohaDelegations||[])].sort((a,b)=>a.id.localeCompare(b.id))
    });
  }
  return {domains,stateRoot:hashObject(domains),version:HSC_VERSION};
}

export function registerCoreApp(store,{name,description,developerProfileId,homepage}){
  store.apps=Array.isArray(store.apps)?store.apps:[];
  const cleanName=String(name||"").trim().slice(0,80);
  const cleanDesc=String(description||"").trim().slice(0,500);
  const dev=String(developerProfileId||"").trim();
  if(cleanName.length<3) throw new Error("APP_NAME_TOO_SHORT");
  if(cleanDesc.length<20) throw new Error("APP_DESCRIPTION_TOO_SHORT");
  if(!/^HUMAN-[A-F0-9]{12}$/.test(dev)) throw new Error("INVALID_DEVELOPER_PROFILE");
  const url=new URL(String(homepage||""));
  if(!["https:","http:"].includes(url.protocol)) throw new Error("INVALID_APP_HOMEPAGE");
  const id="APP-"+hashObject({cleanName,dev,homepage:url.toString()}).slice(0,12).toUpperCase();
  if(store.apps.some(a=>a.id===id)) throw new Error("APP_ALREADY_REGISTERED");
  const app={id,name:cleanName,description:cleanDesc,developerProfileId:dev,homepage:url.toString(),status:"CANDIDATE",utilityActions:0,createdAt:new Date().toISOString()};
  store.apps.push(app);
  return app;
}

export function recordAppUtility(store,{appId,profileId,action,proofRef=null}){
  const app=(store.apps||[]).find(a=>a.id===appId);
  if(!app) throw new Error("APP_NOT_FOUND");
  const act=String(action||"").trim().toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,64);
  if(!act) throw new Error("INVALID_APP_ACTION");
  store.appUtility=Array.isArray(store.appUtility)?store.appUtility:[];
  const day=new Date().toISOString().slice(0,10);
  const dedupe=hashObject({appId,profileId,act,day,proofRef});
  if(store.appUtility.some(x=>x.dedupe===dedupe)) return {duplicate:true};
  const rec={id:"UTIL-"+dedupe.slice(0,16).toUpperCase(),appId,profileId,action:act,proofRef,day,dedupe,createdAt:new Date().toISOString()};
  store.appUtility.push(rec); app.utilityActions=Number(app.utilityActions||0)+1;
  return {duplicate:false,record:rec};
}

export function networkHealth(store){
  const profiles=store.profiles||[], apps=store.apps||[], events=store.events||[];
  const verifiedProfiles=profiles.length;
  const activeProfiles=profiles.filter(p=>p.lastActiveDay===new Date().toISOString().slice(0,10)).length;
  const trustEdges=profiles.reduce((n,p)=>n+(p.trustConnections||[]).length,0);
  const activeApps=apps.filter(a=>a.status==="ACTIVE"||a.status==="VERIFIED").length;
  return {
    version:HSC_VERSION,
    verifiedProfiles,activeProfiles,trustEdges,
    registeredApps:apps.length,activeApps,
    coreEvents:events.length,
    eventChain:verifyEventChain(events),
    state:coreStateRoot(store)
  };
}
