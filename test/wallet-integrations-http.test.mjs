import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import net from 'node:net';
test('wallet HTTP routes enforce origin, bounded bodies and Pi registration', {timeout:20000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cohiba-wallet-http-'));const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['web-server.mjs'],{env:{...process.env,PORT:String(port),COHIBA_DATA_DIR:dir,HUMAN_SIGNAL_DATABASE_URL:'',PI_APP_ENABLED:'false',INFOBIP_API_KEY:'',ALLOW_MAINNET:'false',AUTO_MAINNET_LAUNCH:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('startup timeout')),10000);child.stdout.on('data',c=>{output+=c;if(output.includes('COHIBA web listening')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('server exited'));});});
  const base='http://127.0.0.1:'+port;
  const config=await fetch(base+'/api/integrations/config').then(r=>r.json());assert.equal(config.pi.enabled,false);assert.equal(config.pi.paymentsEnabled,false);assert.equal(config.ousd.network,'solana-mainnet');
  const readiness=await fetch(base+'/api/integrations/checkout/config').then(r=>r.json());assert.equal(readiness.pi.enabled,false);assert.equal(readiness.ousd.enabled,false);assert.equal(readiness.agentExecutionEnabled,false);assert.ok(readiness.pi.blockers.includes('POSTGRES_ACCOUNT_STORAGE_REQUIRED'));
  const checkoutPost=(body,origin='https://cohibameme.site')=>fetch(base+'/api/integrations/checkout/order',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await checkoutPost({},'https://evil.example')).status,403);
  assert.equal((await checkoutPost({sku:'fake',asset:'PI'})).status,503);
  assert.equal((await checkoutPost({payload:'x'.repeat(9000)})).status,413);
  const post=(body,origin='https://cohibameme.site')=>fetch(base+'/api/integrations/pi/link',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({},'https://evil.example')).status,403);
  assert.equal((await post({accessToken:'token'})).status,409);
  assert.equal((await post({accessToken:'x'.repeat(9000)})).status,413);
  const spec=await fetch(base+'/api/v1/openapi.json').then(r=>r.json());assert.equal(spec.openapi,'3.1.1');assert.ok(spec.paths['/api/v1/protocol']);
 }finally{child.kill();await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});
