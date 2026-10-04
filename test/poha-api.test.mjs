import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {PublicKey} from '@solana/web3.js';
import {newSession} from '../lib/human-signal-network.mjs';
import {signProof,publicKeyBase64,payloadDigest} from '../sdk/human-signal-node.mjs';
import {verifyEventChain} from '../lib/human-signal-core.mjs';

test('PoHA HTTP chain isolates owners, persists signed records and denies revoked proofs',{timeout:20000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'cohiba-poha-'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
  const human=crypto.generateKeyPairSync('ed25519'),agent=crypto.generateKeyPairSync('ed25519');
  const principalKey=publicKeyBase64(human.privateKey),agentKey=publicKeyBase64(agent.privateKey);
  const alice='HUMAN-AAAAAAAAAAAA',bob='HUMAN-BBBBBBBBBBBB',sessions=[alice,bob].map(newSession);
  const networkFile=path.join(dir,'cohiba-human-signal-network.json');
  const profiles=[{id:alice,wallet:new PublicKey(Buffer.from(principalKey,'base64')).toBase58(),humanProofs:{phone:{verified:true,identityHash:'a'.repeat(64),verifiedAt:new Date().toISOString()}}},{id:bob,wallet:PublicKey.default.toBase58()}];
  await writeFile(networkFile,JSON.stringify({profiles,challenges:[],sessions:sessions.map(s=>s.record)}));
  let child;
  const start=async()=>{
    child=spawn(process.execPath,['web-server.mjs'],{env:{...process.env,HUMAN_SIGNAL_DATABASE_URL:'',ALLOW_POHA_AUTHORIZATION:'false',HS_PILOT_PUBLIC_KEY:'',HS_PILOT_AUDIENCE:'',HS_BACKUP_BUCKET:'',PORT:String(port),PUBLIC_BASE_URL:'https://pilot.example',COHIBA_DATA_DIR:dir,AUTO_MAINNET_LAUNCH:'false',ALLOW_MAINNET:'false',ALLOW_HSC_DEVNET_ANCHOR:'false',INFOBIP_API_KEY:'',SYSTEM_WALLET_SECRET_JSON:''},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('startup timeout')),10000);child.stdout.on('data',c=>{output+=c;if(output.includes('COHIBA web listening')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('early exit'));});});
  };
  const stop=async()=>{child.kill();await once(child,'exit');};
  const api=async(endpoint,body,{token=sessions[0].token,origin='https://pilot.example'}={})=>{
    const r=await fetch(`http://127.0.0.1:${port}/api/v1/${endpoint}`,{method:body===undefined?'GET':'POST',headers:{origin,authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};
  };
  try{
    await start();
    const discovery=await api('protocol',undefined,{token:''});assert.equal(discovery.status,200);assert.equal(discovery.data.executionEnabled,false);assert.equal(discovery.data.actionNonceConsumption,false);
    assert.equal((await api('agency',undefined,{token:''})).status,401);
    assert.equal((await api('agents/register',{}, {origin:'https://evil.example'})).status,403);
    const common={version:'1',principalId:alice,audience:'https://pilot.example',nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
    const b={...common,principalKey,agentKey,name:'API Pilot'};
    const input={payload:b,principalSignature:signProof('AGENT_BINDING',b,human.privateKey),agentSignature:signProof('AGENT_BINDING',b,agent.privateKey)};
    assert.equal((await api('agents/register',input,{token:sessions[1].token})).status,400);
    const registered=await api('agents/register',input);assert.equal(registered.status,201);
    assert.equal((await api('agents/register',input)).data.error,'BINDING_REPLAY');
    const d={...common,nonce:crypto.randomBytes(24).toString('base64url'),principalKey,bindingId:registered.data.record.id,agentKey,scopes:['DRAFT_CONTRIBUTION'],resource:'draft:one',approvalRequired:false};
    const granted=await api('delegations',{payload:d,signature:signProof('DELEGATION',d,human.privateKey)});assert.equal(granted.status,201);
    const a={...common,nonce:crypto.randomBytes(24).toString('base64url'),performer:'AGENT',signerKey:agentKey,delegationId:granted.data.record.id,action:'DRAFT_CONTRIBUTION',resource:'draft:one',payloadHash:payloadDigest(Buffer.from('Draft body'))};
    const request={proof:{payload:a,signature:signProof('ACTION',a,agent.privateKey)},expected:{audience:common.audience,action:a.action,resource:a.resource,payloadHash:a.payloadHash,requireApproval:false}};
    assert.equal((await api('actions/inspect',request)).data.result.actorClass,'AUTHORIZED_AGENT');
    assert.deepEqual((await api('agency',undefined,{token:sessions[1].token})).data.agents,[]);
    assert.equal((await api('actions/inspect',request,{token:sessions[1].token})).data.result.decision,'DENY');
    // Same-phone claims and stale verification cannot be promoted to human assurance.
    const original=JSON.parse(await readFile(networkFile,'utf8'));
    const duplicate=structuredClone(original);duplicate.profiles[1].humanProofs=duplicate.profiles[0].humanProofs;
    await writeFile(networkFile,JSON.stringify(duplicate));assert.equal((await api('actions/inspect',request)).data.result.reasonCodes[0],'HUMAN_ASSURANCE_INSUFFICIENT');
    await writeFile(networkFile,JSON.stringify(original));
    await stop();await start();assert.equal((await api('actions/inspect',request)).data.result.actorClass,'AUTHORIZED_AGENT');
    const revocation={type:'DELEGATION',id:granted.data.record.id};
    assert.equal((await api('revocations',revocation,{token:sessions[1].token})).status,400);
    assert.equal((await api('revocations',revocation)).status,200);
    assert.equal((await api('actions/inspect',request)).data.result.reasonCodes[0],'DELEGATION_UNAVAILABLE');
    const coreFile=path.join(dir,'cohiba-human-signal-core.json'),core=JSON.parse(await readFile(coreFile,'utf8'));
    assert.equal(verifyEventChain(core.events).valid,true);assert.equal(core.pohaDelegations.length,1);
    await writeFile(coreFile,'broken');assert.equal((await api('actions/inspect',request)).status,503);assert.equal(await readFile(coreFile,'utf8'),'broken');
  }finally{if(child && child.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
