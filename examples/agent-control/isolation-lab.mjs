import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import readline from 'node:readline';
import {createAgentControlGateway} from './gateway.mjs';
import {fixture} from '../independent-verifier/fixture.mjs';
import {signProof,publicKeyBase64} from '../../sdk/human-signal-node.mjs';
import {proofDigest,statusBytes,sha256} from '../../packages/authority-verifier/index.mjs';
const exec=promisify(execFile);
// Trusted controller. The guest never receives owner/issuer keys, pool, policy methods or host environment.
export async function runIsolationLab({pool,image='node:22-bookworm-slim',timeoutMs=30000}){
 if(typeof image!=='string'||!/^[a-zA-Z0-9_./:@-]+$/.test(image)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('INVALID_LAB_CONFIG');
 const imageInfo=JSON.parse((await exec('docker',['image','inspect',image],{timeout:5000,maxBuffer:65536})).stdout)[0];
 const name='hs-control-lab-'+crypto.randomBytes(8).toString('hex'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hs-isolation-'));
 const guest=path.join(dir,'adversary.mjs');fs.copyFileSync(fileURLToPath(new URL('./adversary.mjs',import.meta.url)),guest);
 const canaryPath=path.join(dir,'host-canary');fs.writeFileSync(canaryPath,crypto.randomBytes(32),{mode:0o600});
 const keys=Object.fromEntries(['human','agent','issuer'].map(k=>[k,crypto.generateKeyPairSync('ed25519').privateKey]));
 const audience='https://lab-'+crypto.randomBytes(6).toString('hex')+'.example',issuer='lab-'+crypto.randomBytes(6).toString('hex'),principalId='HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase();
 const principalKey=publicKeyBase64(keys.human),agentKey=publicKeyBase64(keys.agent);
 const gateway=await createAgentControlGateway({pool,audience,trust:{[issuer]:{publicKey:publicKeyBase64(keys.issuer),acceptedAssurances:['PHONE_VERIFIED']}}});
 const policy={issuer,principalId,agentKey,enabled:true,maxCalls:2,maxBytes:100,allowedTools:['draft.create'],requireApproval:false};
 await gateway.configurePolicy(policy);
 const requests=[];
 for(let i=0;i<8;i++){
  const f=fixture(),b=f.bundle.binding,d=f.bundle.delegation,a=f.bundle.proof,challenge=await gateway.challenge('draft.create'),bytes=Buffer.from('SYNTHETIC DRAFT');
  for(const record of [b,d,a])Object.assign(record.payload,{principalId,audience,nonce:crypto.randomBytes(24).toString('base64url')});
  Object.assign(b.payload,{principalKey,agentKey});b.id='AGENT-'+proofDigest('AGENT_BINDING',b.payload);b.principalSignature=signProof('AGENT_BINDING',b.payload,keys.human);b.agentSignature=signProof('AGENT_BINDING',b.payload,keys.agent);
  Object.assign(d.payload,{principalKey,agentKey,bindingId:b.id});d.id='DELEGATION-'+proofDigest('DELEGATION',d.payload);d.signature=signProof('DELEGATION',d.payload,keys.human);
  Object.assign(a.payload,{signerKey:agentKey,delegationId:d.id,payloadHash:sha256(bytes)});a.signature=signProof('ACTION',a.payload,keys.agent);
  Object.assign(f.bundle.status.payload,{issuer,principalId,principalKey,audience,challenge:challenge.challenge,actionDigest:proofDigest('ACTION',a.payload),records:[{id:b.id,revoked:false},{id:d.id,revoked:false}].sort((x,y)=>x.id.localeCompare(y.id))});
  f.bundle.status.signature=crypto.sign(null,statusBytes(f.bundle.status.payload),keys.issuer).toString('base64');
  requests.push({bundle:{proof:a,binding:b,delegation:d,status:f.bundle.status},challenge:challenge.challenge,tool:'draft.create',payloadBase64:bytes.toString('base64')});
 }
 // Timers below bound guest process and RPC output. Docker daemon is trusted; never mount its socket into guest.
 let child,timer,rl;
 try{
  const spec=['run','--name',name,'--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','32','--memory','128m','--cpus','0.5','--user','65534:65534','--mount',`type=bind,src=${guest},dst=/app/adversary.mjs,readonly`,imageInfo.Id,'node','/app/adversary.mjs'];
  child=spawn('docker',spec,{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH}});
  let stderr='';child.stderr.on('data',chunk=>{if(stderr.length<2048)stderr+=String(chunk).slice(0,2048-stderr.length);});
  rl=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  const hostOutcomes=[];
  const report=await new Promise((resolve,reject)=>{
   let total=0,count=0,finished=false,tail=Promise.resolve();
   const fail=()=>{if(!finished){finished=true;reject(Error('ISOLATION_LAB_FAILED'));}};
   timer=setTimeout(fail,timeoutMs);
   child.once('error',fail);child.once('close',()=>{tail.then(()=>{if(!finished)fail();});});child.stdin.on('error',fail);
   rl.on('line',line=>{
    total+=Buffer.byteLength(line);if(total>262144||Buffer.byteLength(line)>24576||++count>40){fail();return;}
    tail=tail.then(async()=>{
     if(finished)return;
     const m=JSON.parse(line);
     if(m.command==='finished'){
      if(!Array.isArray(m.outcomes)||m.outcomes.length!==17||hostOutcomes.length!==17)throw Error('INCOMPLETE_RUN');
      // Guest self-reports are not the only evidence: host reads actual budgets/jobs/drafts below.
      finished=true;resolve(m);return;
     }
     if(!Number.isSafeInteger(m.id)||m.id!==count)throw Error('INVALID_RPC');
     const result=m.command==='submit'?await gateway.submit(m.input):{decision:'DENY',reasonCodes:['RPC_COMMAND_NOT_ALLOWED'],queued:false};
     hostOutcomes.push({label:m.label,result});
     child.stdin.write(JSON.stringify({id:m.id,result})+'\n');
    }).catch(fail);
   });
   child.stdin.write(JSON.stringify({requests,canaryPath})+'\n');
  });
  const inspect=JSON.parse((await exec('docker',['inspect',name],{timeout:5000,maxBuffer:65536})).stdout)[0];
  // Execute one admitted job, then suspend before remaining execution.
  const first=await gateway.executeOne();await gateway.suspend(policy);const second=await gateway.executeOne();
  const counters=(await pool.query('SELECT used_calls,used_bytes FROM hs_control_policy WHERE audience=$1',[audience])).rows[0];
  const drafts=Number((await pool.query('SELECT count(*) AS count FROM hs_control_drafts WHERE audience=$1',[audience])).rows[0].count);
  return {schemaVersion:'HS_ISOLATION_LAB_1',actor:'SCRIPTED_ADVERSARY',liveModel:false,synthetic:true,sourceCommit:process.env.GITHUB_SHA||null,imageId:imageInfo.Id,isolation:{networkMode:inspect.HostConfig.NetworkMode,readOnlyRootfs:inspect.HostConfig.ReadonlyRootfs,capDrop:inspect.HostConfig.CapDrop,securityOpt:inspect.HostConfig.SecurityOpt,pidsLimit:inspect.HostConfig.PidsLimit,memory:inspect.HostConfig.Memory,bindCount:inspect.Mounts.length},probes:report.probes,outcomes:hostOutcomes,hostEvidence:{admittedCalls:Number(counters.used_calls),reservedBytes:Number(counters.used_bytes),drafts,first:first.state,afterSuspension:second.state},claim:'Synthetic scripted experiment; not an independent audit, live-model evaluation, public testing or SI containment proof.'};
 }finally{
  clearTimeout(timer);rl?.close();child?.stdin.destroy();child?.kill('SIGKILL');await exec('docker',['rm','-f',name],{timeout:5000}).catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});
 }
}
