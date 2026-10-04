// Independent application: no COHIBA API, core or SDK import.
import http from 'node:http';
import crypto from 'node:crypto';
import {authorizeAuthority,publicDecision,sha256} from '../../packages/authority-verifier/index.mjs';
import {createPostgresReplayStore} from '../../packages/authority-verifier/postgres-adapter.mjs';
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
export async function createExternalService({pool,audience,trust,requireApproval=false}){
 if(!audience.startsWith('https://')||new URL(audience).origin!==audience)throw Error('HTTPS_AUDIENCE_REQUIRED');
 const pinnedTrust=structuredClone(trust),consume=await createPostgresReplayStore(pool);
 await pool.query('CREATE TABLE IF NOT EXISTS hs_external_challenges(audience text NOT NULL,nonce text NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(audience,nonce)); CREATE TABLE IF NOT EXISTS hs_external_outbox(action_digest text PRIMARY KEY,payload bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now())');
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.method==='GET'&&req.url==='/challenge'){
    const challenge=crypto.randomBytes(24).toString('base64url'),expiresAt=new Date(Date.now()+30000).toISOString();
    await pool.query('INSERT INTO hs_external_challenges(audience,nonce,expires_at) VALUES($1,$2,$3)',[audience,challenge,expiresAt]);
    reply(res,200,{challenge,expiresAt,audience,action:'DRAFT_APP_ACTION',resource:'draft:external-note',requireApproval});return;
   }
   if(req.method!=='POST'||req.url!=='/actions'){reply(res,404,{error:'NOT_FOUND'});return;}
   let body='';for await(const b of req){body+=b;if(Buffer.byteLength(body)>24576)throw Error('REQUEST_TOO_LARGE');}
   const input=JSON.parse(body);
   if(Object.keys(input).sort().join(',')!=='bundle,challenge,payloadBase64'||typeof input.payloadBase64!=='string'||input.payloadBase64.length>8000||typeof input.challenge!=='string'||!/^[A-Za-z0-9_-]{22,128}$/.test(input.challenge))throw Error('INVALID_REQUEST');
   const bytes=Buffer.from(input.payloadBase64,'base64');if(bytes.toString('base64')!==input.payloadBase64||!bytes.length)throw Error('INVALID_REQUEST');
   const row=(await pool.query('SELECT expires_at FROM hs_external_challenges WHERE audience=$1 AND nonce=$2',[audience,input.challenge])).rows[0];
   if(!row||new Date(row.expires_at).getTime()<=Date.now())throw Error('CHALLENGE_UNAVAILABLE');
   const expected={audience,action:'DRAFT_APP_ACTION',resource:'draft:external-note',payloadHash:sha256(bytes),requireApproval,challenge:input.challenge};
   const result=await authorizeAuthority(input.bundle,{trust:pinnedTrust,expected,consume:x=>consume(x,{onAdmit:async c=>{
    // Durable business intent and replay consumption share ONE transaction.
    const valid=await c.query('DELETE FROM hs_external_challenges WHERE audience=$1 AND nonce=$2 AND expires_at>clock_timestamp() RETURNING nonce',[audience,input.challenge]);
    if(!valid.rows.length)throw Error('CHALLENGE_UNAVAILABLE');
    await c.query('INSERT INTO hs_external_outbox(action_digest,payload) VALUES($1,$2)',[x.actionDigest,bytes]);
   }})});
   reply(res,result.executionAuthorized?201:result.decision==='REQUIRE_APPROVAL'?202:403,{result:publicDecision(result),queued:result.executionAuthorized});
  }catch(e){reply(res,e.message==='REQUEST_TOO_LARGE'?413:['INVALID_REQUEST','CHALLENGE_UNAVAILABLE'].includes(e.message)?400:503,{error:['REQUEST_TOO_LARGE','INVALID_REQUEST','CHALLENGE_UNAVAILABLE'].includes(e.message)?e.message:'VERIFICATION_UNAVAILABLE'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=30;
 return server;
}
