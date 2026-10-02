#!/usr/bin/env node
import crypto from "node:crypto";

const base=String(process.env.COHIBA_BASE_URL||"https://cohibameme.site").replace(/\/$/,"");
const token=String(process.env.COHIBA_SESSION_TOKEN||"").trim();
const loop=process.argv.includes("--loop");

if(!token){
  console.error("COHIBA_SESSION_TOKEN is required. Sign in to COHIBA and provide a valid session token via your local environment only.");
  process.exit(2);
}

function digest(job){
  const p=job?.payload||{};
  const canonical=JSON.stringify({
    protocol:"COHIBA_NODE",
    version:"0.1",
    type:"DATA_INTEGRITY_V1",
    nonce:String(p.nonce||""),
    chunks:(Array.isArray(p.chunks)?p.chunks:[]).map(x=>String(x))
  });
  return crypto.createHash("sha256").update(canonical,"utf8").digest("hex");
}

async function api(path,body={}){
  const r=await fetch(base+path,{
    method:"POST",
    headers:{authorization:"Bearer "+token,"content-type":"application/json","user-agent":"COHIBA-Node/0.1"},
    body:JSON.stringify(body)
  });
  const x=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(x.error||("HTTP_"+r.status));
  return x;
}

async function runOnce(){
  const issued=await api("/api/node/jobs/request");
  if(!issued.job){
    console.log(JSON.stringify({ok:true,status:issued.status||"NO_JOB",retryAfterMs:issued.retryAfterMs||null}));
    return issued.retryAfterMs||10*60*1000;
  }

  const result=digest(issued.job);
  const submitted=await api("/api/node/jobs/submit",{jobId:issued.job.id,result});
  console.log(JSON.stringify({
    ok:true,
    jobId:issued.job.id,
    verified:submitted.verified===true,
    resourceScore:submitted.resource?.score??null
  }));
  return 10*60*1000;
}

do{
  try{
    const wait=await runOnce();
    if(!loop) break;
    await new Promise(resolve=>setTimeout(resolve,Math.max(60_000,Number(wait)||600_000)));
  }catch(error){
    console.error(String(error?.message||error));
    if(!loop) process.exit(1);
    await new Promise(resolve=>setTimeout(resolve,10*60*1000));
  }
}while(loop);
