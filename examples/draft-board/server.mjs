import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {serviceSigningBytes} from '../../lib/poha-postgres.mjs';
import {publicKeyBase64} from '../../sdk/human-signal-node.mjs';
const directory=process.env.DRAFT_BOARD_DATA_DIR||'/data';fs.mkdirSync(directory,{recursive:true,mode:0o700});
const keyFile=path.join(directory,'service-key.pem');
if(!fs.existsSync(keyFile)){const key=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});fs.writeFileSync(keyFile,key,{flag:'wx',mode:0o600});}
const key=crypto.createPrivateKey(fs.readFileSync(keyFile));
const publicKey=publicKeyBase64(key),serviceId='draft-board';
const api=process.env.HUMAN_SIGNAL_API_URL||'https://cohibameme.site';

async function authorization(request){
 const raw=Buffer.from(JSON.stringify(request)),time=new Date().toISOString(),nonce=crypto.randomBytes(24).toString('base64url');
 const signature=crypto.sign(null,serviceSigningBytes(serviceId,time,nonce,raw),key).toString('base64');
 const response=await fetch(api+'/api/v1/actions/commit-draft',{method:'POST',headers:{'content-type':'application/json','x-hs-service-id':serviceId,'x-hs-time':time,'x-hs-nonce':nonce,'x-hs-signature':signature},body:raw,signal:AbortSignal.timeout(10000)});
 const data=await response.json();
 if(!response.ok){
  if(['APPROVAL_REPLAY','PRINCIPAL_REVOKED','INVALID_PRINCIPAL','IDENTITY_CHANGED_RETRY','PROOF_EXPIRED_RETRY','PROOF_EXPIRED_AT_COMMIT'].includes(data.error))return {version:'1',mode:'AUTHORIZE',actorClass:'UNVERIFIED',decision:'DENY',executionAuthorized:false,reasonCodes:[data.error]};
  throw Error('HUMAN_SIGNAL_UNAVAILABLE');
 }
 return data.result;
}
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health'){const readiness=await fetch(api+'/api/v1/sovereignty/status',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());if(readiness.localDraftCommitEnabled!==true)throw Error('HUMAN_SIGNAL_UNAVAILABLE');json(res,200,{ok:true,application:'Signed Draft Board',commitMode:'ATOMIC_LOCAL_DRAFT',servicePublicKey:publicKey,serviceId,humanSignalOrigin:new URL(api).origin});return;}
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'"});res.end(fs.readFileSync(new URL('./index.html',import.meta.url)));return;}
  if(req.method==='GET'&&url.pathname==='/app.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(fs.readFileSync(new URL('./app.js',import.meta.url)));return;}
  if(req.method==='POST'&&url.pathname==='/drafts'){
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>20000)throw Error('REQUEST_TOO_LARGE');}
   const input=JSON.parse(body);if(typeof input.text!=='string'||Buffer.byteLength(input.text)>6000||!input.text.length||typeof input.resource!=='string'||!/^draft:[a-zA-Z0-9_-]{1,80}$/.test(input.resource))throw Error('INVALID_DRAFT');
   // Context comes from the application's actual operation and bytes; client cannot weaken policy.
   const request={action:'DRAFT_APP_ACTION',resource:input.resource,payloadBase64:Buffer.from(input.text,'utf8').toString('base64'),proof:input.proof};
   const result=await authorization(request);
   if(result.decision!=='ALLOW'||result.effectCommitted!==true){json(res,result.decision==='REQUIRE_APPROVAL'?202:403,{ok:false,result});return;}
   if(result.serviceId!==serviceId||result.principalId!==input.proof.payload.principalId||result.resource!==input.resource||result.payloadHash!==crypto.createHash('sha256').update(input.text,'utf8').digest('hex')||result.effectAtomicity!=='POSTGRES_TRANSACTION')throw Error('STALE_RECEIPT');
   json(res,result.idempotentReplay?200:201,{ok:true,result,saved:true});return;
  }
  json(res,404,{ok:false,error:'NOT_FOUND'});
 }catch(e){const allowed=['INVALID_DRAFT','REQUEST_TOO_LARGE','STALE_RECEIPT','SERVICE_AUTH_INVALID','SERVICE_REQUEST_REPLAY'];json(res,allowed.includes(e.message)?400:503,{ok:false,error:allowed.includes(e.message)?e.message:'HUMAN_SIGNAL_UNAVAILABLE'});}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=30;
server.listen(Number(process.env.PORT||8081),'0.0.0.0',()=>console.log('Independent Draft Board listening'));
