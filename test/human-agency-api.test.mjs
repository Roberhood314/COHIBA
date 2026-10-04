import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {hashIdentity} from '../lib/human-proof.mjs';
import {once} from 'node:events';
import {newSession} from '../lib/human-signal-network.mjs';
import {verifyEventChain} from '../lib/human-signal-core.mjs';

test('agency HTTP API enforces sessions, origin, isolation and persistence', {timeout:20000}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'cohiba-agency-'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const alice='HUMAN-AAAAAAAAAAAA',bob='COH-BBBBBBBBBBBB',phone='HUMAN-CCCCCCCCCCCC';
  const sessions=[alice,bob,phone].map(newSession);
  const salt=crypto.randomBytes(16), password='TestPassword123';
  const credential={scheme:'scrypt-v1',salt:salt.toString('base64'),hash:crypto.scryptSync(password,salt,64).toString('base64')};
  const phoneHash=hashIdentity('phone','+84901234567','test-identity-pepper');
  await writeFile(path.join(dir,'cohiba-human-signal-network.json'),JSON.stringify({profiles:[{id:alice,wallet:'wallet-a'},{id:bob,wallet:'wallet-b',humanProofs:{phone:{verified:true,identityHash:phoneHash}},passwordCredential:credential},{id:phone}],challenges:[],sessions:sessions.map(s=>s.record)}));
  const child=spawn(process.execPath,['web-server.mjs'],{env:{...process.env,HUMAN_SIGNAL_DATABASE_URL:'',ALLOW_POHA_AUTHORIZATION:'false',HS_PILOT_PUBLIC_KEY:'',HS_PILOT_AUDIENCE:'',HS_BACKUP_BUCKET:'',HUMAN_IDENTITY_PEPPER:'test-identity-pepper',PORT:String(port),PUBLIC_BASE_URL:'https://cohibameme.site',COHIBA_DATA_DIR:dir,AUTO_MAINNET_LAUNCH:'false',ALLOW_MAINNET:'false',ALLOW_HSC_DEVNET_ANCHOR:'false',INFOBIP_API_KEY:'',SYSTEM_WALLET_SECRET_JSON:''},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('server start timeout')),10000);
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('COHIBA web listening')){clearTimeout(timer);resolve();}});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('server exited before ready'));});
    });
    const api=async(endpoint,{token=sessions[0].token,method='GET',body,origin='https://cohibameme.site'}={})=>{
      const res=await fetch(`http://127.0.0.1:${port}/api/hsc/agency${endpoint}`,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:res.status,data:await res.json()};
    };
    assert.equal((await api('',{token:''})).status,401);
    assert.equal((await api('',{token:sessions[2].token})).status,403);
    assert.equal((await api('/agents',{method:'POST',origin:'https://evil.example',body:{name:'Bad Agent'}})).status,403);
    assert.equal((await api('/agents',{method:'POST',body:{name:'x'.repeat(5000)}})).status,413);
    const registered=await api('/agents',{method:'POST',body:{name:'Research Assistant',ownerProfileId:bob}});
    assert.equal(registered.status,201);assert.equal(registered.data.record.ownerProfileId,alice);
    const agentId=registered.data.record.id;
    const grant={agentId,scopes:['DRAFT_CONTRIBUTION'],expiresAt:new Date(Date.now()+3600000).toISOString()};
    assert.equal((await api('/grant',{token:sessions[1].token,method:'POST',body:grant})).status,404);
    assert.equal((await api('/grant',{method:'POST',body:{...grant,scopes:['TOKEN_TRANSFER']}})).status,400);
    const granted=await api('/grant',{method:'POST',body:grant});assert.equal(granted.status,201);
    const id=granted.data.record.id;
    assert.deepEqual((await api('',{token:sessions[1].token})).data.delegations,[]);
    assert.equal((await api('/revoke',{token:sessions[1].token,method:'POST',body:{delegationId:id}})).status,404);
    for(let i=0;i<2;i++)assert.equal((await api('/revoke',{method:'POST',body:{delegationId:id}})).status,200);
    assert.equal((await api('')).data.delegations[0].status,'REVOKED');
    const file=path.join(dir,'cohiba-human-signal-core.json');
    const stored=JSON.parse(await readFile(file,'utf8'));
    assert.equal(stored.events.length,3);assert.equal(verifyEventChain(stored.events).valid,true);
    // Regression: correct credentials used to save a session then fail with INVALID_CORE_EVENT_TYPE.
    const account=async(endpoint,body,token='')=>{
      const res=await fetch(`http://127.0.0.1:${port}/api/account/${endpoint}`,{method:'POST',headers:{origin:'https://cohibameme.site','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
      return {status:res.status,data:await res.json()};
    };
    assert.equal((await account('login',{phone:'0901234567',password:'wrong'})).status,401);
    const loggedIn=await account('login',{phone:'0901234567',password});
    assert.equal(loggedIn.status,200);assert.ok(loggedIn.data.token);
    const dashboard=await fetch(`http://127.0.0.1:${port}/api/human-signal/dashboard`,{headers:{authorization:'Bearer '+loggedIn.data.token}});
    assert.equal(dashboard.status,200);
    const rotated=await account('password',{password:'NewPassword123'},loggedIn.data.token);
    assert.equal(rotated.status,200);assert.ok(rotated.data.token);
    assert.equal((await api('',{token:loggedIn.data.token})).status,401);
    assert.equal((await account('login',{phone:'0901234567',password})).status,401);
    const relogged=await account('login',{phone:'+84901234567',password:'NewPassword123'});
    assert.equal(relogged.status,200);
    assert.equal((await account('logout',{},relogged.data.token)).status,200);
    assert.equal((await api('',{token:relogged.data.token})).status,401);
    // Verified OTP recovery must revoke every previous session for this account only.
    const recoveryToken='fixture-approved-otp-token';
    const onboardingFile=path.join(dir,'cohiba-account-onboarding.json');
    await writeFile(onboardingFile,JSON.stringify({records:[{status:'PHONE_VERIFIED',tokenHash:crypto.createHash('sha256').update(recoveryToken).digest('hex'),tokenExpiresAt:new Date(Date.now()+60000).toISOString(),phoneHash,existingProfileId:bob}]}));
    const recovered=await account('onboarding/profile',{onboardingToken:recoveryToken,password:'RecoveredPassword123'});
    assert.equal(recovered.status,200);assert.equal(recovered.data.created,false);
    assert.equal((await api('',{token:sessions[1].token})).status,401);
    assert.equal((await api('',{token:sessions[0].token})).status,200);
    assert.equal((await api('',{token:recovered.data.token})).status,200);
    assert.equal((await account('login',{phone:'0901234567',password:'NewPassword123'})).status,401);
    assert.equal((await account('onboarding/profile',{onboardingToken:recoveryToken,password:'RecoveredPassword123'})).status,400);
    const persisted=JSON.parse(await readFile(path.join(dir,'cohiba-human-signal-network.json'),'utf8'));
    assert.equal(persisted.sessions.filter(s=>s.profileId===bob).length,1);
    const signupToken='fixture-new-account-otp';
    await writeFile(onboardingFile,JSON.stringify({records:[{status:'PHONE_VERIFIED',tokenHash:crypto.createHash('sha256').update(signupToken).digest('hex'),tokenExpiresAt:new Date(Date.now()+60000).toISOString(),phoneHash:hashIdentity('phone','+84907654321','test-identity-pepper')}]}));
    const signup=await account('onboarding/profile',{onboardingToken:signupToken,displayName:'New Human',password:'SignupPassword123'});
    assert.equal(signup.status,200);assert.equal(signup.data.created,true);
    assert.equal((await account('login',{phone:'0907654321',password:'SignupPassword123'})).status,200);
    const audited=JSON.parse(await readFile(file,'utf8'));
    assert.equal(verifyEventChain(audited.events).valid,true);
    assert.deepEqual(audited.events.slice(3).map(e=>e.type),['ACCOUNT_LOGIN','ACCOUNT_PASSWORD_UPDATED','ACCOUNT_LOGIN','ACCOUNT_LOGOUT','PROFILE_VERIFIED','PROFILE_VERIFIED','ACCOUNT_LOGIN']);
    await writeFile(file,'invalid JSON');
    assert.equal((await api('/agents',{method:'POST',body:{name:'Another Agent'}})).status,503);
    assert.equal(await readFile(file,'utf8'),'invalid JSON');
  }finally{
    child.kill();await once(child,'exit');await rm(dir,{recursive:true,force:true});
  }
});
