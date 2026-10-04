import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {PublicKey} from '@solana/web3.js';
import {newSession} from '../lib/human-signal-network.mjs';
import {publicKeyBase64} from '../sdk/human-signal-node.mjs';
import {createAgent} from '../web/public/poha-browser.mjs';
import {prepareDisclosure,syntheticRequest} from '../web/public/disclosure-browser.mjs';
import {verifyDisclosureGrant} from '../lib/private-disclosure.mjs';

test('browser disclosure grants match Node verification and keep projection local',async()=>{
 const keys=crypto.generateKeyPairSync('ed25519'),principalKey=publicKeyBase64(keys.privateKey);
 const signOwner=async bytes=>crypto.sign(null,bytes,keys.privateKey).toString('base64');
 const owner={principalId:'HUMAN-AAAAAAAAAAAA',principalKey};
 const state=await prepareDisclosure({selection:{ageBand:'30-44',activityBand:'moderate',dietaryNeeds:'vegetarian'},owner,audience:'https://cohibameme.site',agent:await createAgent(),signOwner,register:async()=>({record:{id:'AGENT-'+'a'.repeat(64)}})});
 const snap=state.snapshot();assert.equal(verifyDisclosureGrant(snap.grant,principalKey).id,snap.action.payload.grantId);
 const text=Buffer.from(snap.request.payloadBase64,'base64').toString();assert.ok(!text.includes('vegetarian'));assert.ok(!text.includes('30-44'));
 assert.equal((await state.execute(()=>{throw Error('must not authorize without consent');})).actorClass,'HUMAN_APPROVAL_REQUIRED');
 await state.approve(signOwner);
 let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const pending=state.execute(async()=>{entered();await gate;return {result:{decision:'ALLOW',executionAuthorized:true,disclosurePolicyVersion:'HS_LOCAL_DISCLOSURE_V1',disclosureRequestDigest:snap.action.payload.requestDigest}};});
 await waiting;state.revoke();release();await assert.rejects(pending,/LOCAL_PERMISSION_UNAVAILABLE/);
 assert.throws(()=>syntheticRequest({ageBand:'30-44',activityBand:'moderate',dietaryNeeds:'omit',email:'leak'}),/INVALID_SYNTHETIC_SELECTION/);
});

test('web pilot session endpoint authorizes browser proofs and rejects cross-owner, replay and revocation',{skip:!process.env.TEST_DATABASE_URL,timeout:60000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hs-disclosure-web-'));let child;
 try{
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
  const keys=crypto.generateKeyPairSync('ed25519'),principalKey=publicKeyBase64(keys.privateKey),principalId='HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase();
  const session=newSession(principalId),otherId='HUMAN-'+crypto.randomBytes(6).toString('hex').toUpperCase(),other=newSession(otherId);
  await fs.writeFile(path.join(dir,'cohiba-human-signal-network.json'),JSON.stringify({profiles:[{id:principalId,wallet:new PublicKey(Buffer.from(principalKey,'base64')).toBase58(),humanProofs:{phone:{verified:true,identityHash:crypto.randomBytes(32).toString('hex'),verifiedAt:new Date().toISOString()}}},{id:otherId}],sessions:[session.record,other.record],challenges:[]}));
  child=spawn(process.execPath,['web-server.mjs'],{env:{...process.env,PORT:String(port),COHIBA_DATA_DIR:dir,PUBLIC_BASE_URL:'https://cohibameme.site',HUMAN_SIGNAL_DATABASE_URL:process.env.TEST_DATABASE_URL,HS_ACCOUNT_STORAGE:'',ALLOW_POHA_AUTHORIZATION:'true',HS_PILOT_PUBLIC_KEY:'',HS_BACKUP_BUCKET:'',AUTO_MAINNET_LAUNCH:'false',ALLOW_MAINNET:'false',INFOBIP_API_KEY:'',SYSTEM_WALLET_SECRET_JSON:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('startup timeout')),20000);child.stdout.on('data',c=>{output+=c;if(output.includes('COHIBA web listening')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('early exit'));});});
  const api=async(endpoint,body,token=session.token,origin='https://cohibameme.site')=>{const r=await fetch('http://127.0.0.1:'+port+'/api/v1/'+endpoint,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
  const discovery=await api('disclosure/pilot');assert.equal(discovery.status,200);assert.ok(!JSON.stringify(discovery.data).includes('PRIVATE KEY'));
  const signOwner=async bytes=>crypto.sign(null,bytes,keys.privateKey).toString('base64');
  const state=await prepareDisclosure({selection:{ageBand:'30-44',activityBand:'moderate',dietaryNeeds:'vegetarian'},owner:{principalId,principalKey},audience:discovery.data.service.audience,agent:await createAgent(),signOwner,register:async(endpoint,body)=>{const r=await api(endpoint,body);assert.equal(r.status,201,JSON.stringify(r));return r.data;}});
  await state.approve(signOwner);const snap=state.snapshot();
  assert.equal((await api('disclosure/pilot',snap.request,'')).status,401);
  assert.equal((await api('disclosure/pilot',snap.request,session.token,'https://evil.example')).status,403);
  assert.equal((await api('disclosure/pilot',snap.request,other.token)).status,403);
  const output=await state.execute(async request=>{const r=await api('disclosure/pilot',request);assert.equal(r.status,200,JSON.stringify(r));return r.data;});
  assert.equal(output.sent,true);assert.equal(output.actorClass,'AUTHORIZED_AGENT');assert.equal(output.exactOutbound.facts.dietaryNeeds[0],'vegetarian');
  assert.equal((await api('disclosure/pilot',snap.request)).data.result.executionAuthorized,false);
  assert.equal((await api('revocations',{type:'DELEGATION',id:snap.request.proof.payload.delegationId})).status,200);
  assert.equal((await api('disclosure/pilot',snap.request)).data.result.reasonCodes[0],'DELEGATION_UNAVAILABLE');
 }finally{if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await fs.rm(dir,{recursive:true,force:true});}
});
