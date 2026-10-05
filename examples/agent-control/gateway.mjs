// Local research pilot. No shell, arbitrary HTTP, filesystem tools or production imports.
import crypto from 'node:crypto';
import {authorizeAuthority,inspectAuthority,publicDecision,sha256} from '../../packages/authority-verifier/index.mjs';
import {createPostgresReplayStore} from '../../packages/authority-verifier/postgres-adapter.mjs';
const tools=Object.freeze({
 'dataset.read':{action:'READ_PUBLIC_SIGNALS',resource:'dataset:synthetic'},
 'draft.create':{action:'DRAFT_APP_ACTION',resource:'draft:independent'}
});
const denied=reason=>({actorClass:'UNVERIFIED',decision:'DENY',executionAuthorized:false,reasonCodes:[reason],queued:false});
const policyKey=x=>[x.issuer,x.principalId,x.agentKey];
export async function createAgentControlGateway({pool,audience,trust}){
 if(typeof audience!=='string'||!audience.startsWith('https://')||new URL(audience).origin!==audience)throw Error('INVALID_AUDIENCE');
 const pinnedTrust=structuredClone(trust),consume=await createPostgresReplayStore(pool);
 await pool.query(`
 CREATE TABLE IF NOT EXISTS hs_control_policy(audience text NOT NULL,issuer text NOT NULL,principal_id text NOT NULL,agent_key text NOT NULL,enabled boolean NOT NULL,revision bigint NOT NULL DEFAULT 1,max_calls bigint NOT NULL,max_bytes bigint NOT NULL,used_calls bigint NOT NULL DEFAULT 0,used_bytes bigint NOT NULL DEFAULT 0,allowed_tools jsonb NOT NULL,require_approval boolean NOT NULL,PRIMARY KEY(audience,issuer,principal_id,agent_key));
 CREATE TABLE IF NOT EXISTS hs_control_challenges(audience text NOT NULL,nonce text NOT NULL,tool text NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(audience,nonce));
 CREATE TABLE IF NOT EXISTS hs_control_jobs(audience text NOT NULL,id text NOT NULL,issuer text NOT NULL,principal_id text NOT NULL,agent_key text NOT NULL,revision bigint NOT NULL,tool text NOT NULL,payload bytea NOT NULL,bundle jsonb NOT NULL,expected jsonb NOT NULL,deadline timestamptz NOT NULL,state text NOT NULL DEFAULT 'QUEUED',PRIMARY KEY(audience,id));
 CREATE TABLE IF NOT EXISTS hs_control_drafts(audience text NOT NULL,id text NOT NULL,content bytea NOT NULL,PRIMARY KEY(audience,id));`);
 const selectPolicy=async(c,key,lock=false)=>(await c.query(`SELECT * FROM hs_control_policy WHERE audience=$1 AND issuer=$2 AND principal_id=$3 AND agent_key=$4${lock?' FOR UPDATE':''}`,[audience,...key])).rows[0];
 const transaction=async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}};
 return {
  // Trusted operator methods: NEVER expose as tools or unauthenticated routes.
  async configurePolicy(p){
   if(!p||['issuer','principalId','agentKey'].some(k=>typeof p[k]!=='string'||!p[k])||typeof p.enabled!=='boolean'||typeof p.requireApproval!=='boolean'||!Number.isSafeInteger(p.maxCalls)||p.maxCalls<0||!Number.isSafeInteger(p.maxBytes)||p.maxBytes<0||!Array.isArray(p.allowedTools)||p.allowedTools.some(t=>!Object.hasOwn(tools,t))||new Set(p.allowedTools).size!==p.allowedTools.length)throw Error('INVALID_CONTROL_POLICY');
   await pool.query(`INSERT INTO hs_control_policy(audience,issuer,principal_id,agent_key,enabled,max_calls,max_bytes,allowed_tools,require_approval) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(audience,issuer,principal_id,agent_key) DO UPDATE SET enabled=EXCLUDED.enabled,max_calls=EXCLUDED.max_calls,max_bytes=EXCLUDED.max_bytes,allowed_tools=EXCLUDED.allowed_tools,require_approval=EXCLUDED.require_approval,revision=hs_control_policy.revision+1`,[audience,...policyKey(p),p.enabled,p.maxCalls,p.maxBytes,JSON.stringify(p.allowedTools),p.requireApproval]);
   // Reconfiguration NEVER resets spent/reserved budgets; revision invalidates pending jobs.
  },
  async suspend(p){await pool.query('UPDATE hs_control_policy SET enabled=false,revision=revision+1 WHERE audience=$1 AND issuer=$2 AND principal_id=$3 AND agent_key=$4',[audience,...policyKey(p)]);},
  async challenge(tool){
   if(!Object.hasOwn(tools,tool))throw Error('TOOL_NOT_ALLOWED');
   const nonce=crypto.randomBytes(24).toString('base64url'),expiresAt=new Date(Date.now()+30000).toISOString();
   await pool.query('INSERT INTO hs_control_challenges(audience,nonce,tool,expires_at) VALUES($1,$2,$3,$4)',[audience,nonce,tool,expiresAt]);
   return {challenge:nonce,expiresAt,audience,...tools[tool]};
  },
  async submit(input){
   try{
    if(!input||Object.keys(input).sort().join(',')!=='bundle,challenge,payloadBase64,tool'||!Object.hasOwn(tools,input.tool)||typeof input.payloadBase64!=='string'||input.payloadBase64.length>8000||typeof input.challenge!=='string'||!/^[A-Za-z0-9_-]{22,128}$/.test(input.challenge))return denied('INVALID_CONTROL_REQUEST');
    const {tool,challenge}=input,bundle=structuredClone(input.bundle),bytes=Buffer.from(input.payloadBase64,'base64');
    if(bundle?.proof?.payload?.performer!=='AGENT')return denied('AGENT_REQUIRED');
    if(bytes.toString('base64')!==input.payloadBase64||!bytes.length)return denied('INVALID_CONTROL_REQUEST');
    const key=[bundle.status?.payload?.issuer,bundle.proof?.payload?.principalId,bundle.proof?.payload?.signerKey];
    const p=await selectPolicy(pool,key);if(!p||!p.enabled||!p.allowed_tools.includes(tool))return denied('CONTROL_POLICY_DENIED');
    // Caller cannot choose audience/resource/action/approval policy or payload hash.
    const expected={audience,...tools[tool],challenge,payloadHash:sha256(bytes),requireApproval:p.require_approval};
    const result=await authorizeAuthority(bundle,{trust:pinnedTrust,expected,consume:x=>consume(x,{onAdmit:async c=>{
     const live=await selectPolicy(c,key,true);
     if(!live||!live.enabled||String(live.revision)!==String(p.revision)||!live.allowed_tools.includes(tool))throw Error('POLICY_CHANGED');
     const budget=await c.query('UPDATE hs_control_policy SET used_calls=used_calls+1,used_bytes=used_bytes+$5 WHERE audience=$1 AND issuer=$2 AND principal_id=$3 AND agent_key=$4 AND used_calls<max_calls AND used_bytes+$5<=max_bytes RETURNING revision',[audience,...key,bytes.length]);
     if(!budget.rows.length)throw Error('BUDGET_EXHAUSTED');
     const valid=await c.query('DELETE FROM hs_control_challenges WHERE audience=$1 AND nonce=$2 AND tool=$3 AND expires_at>clock_timestamp() RETURNING nonce',[audience,challenge,tool]);
     if(!valid.rows.length)throw Error('CHALLENGE_UNAVAILABLE');
     await c.query('INSERT INTO hs_control_jobs(audience,id,issuer,principal_id,agent_key,revision,tool,payload,bundle,expected,deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[audience,x.actionDigest,...key,live.revision,tool,bytes,JSON.stringify(bundle),JSON.stringify(expected),x.validUntil]);
    }})});
    return {...publicDecision(result),queued:result.executionAuthorized,executed:false};
   }catch{return denied('CONTROL_UNAVAILABLE');}
  },
  async executeOne(){
   return transaction(async c=>{
    // Lock policy before job everywhere; suspension uses the same policy row.
    const candidate=(await c.query("SELECT * FROM hs_control_jobs WHERE audience=$1 AND state='QUEUED' ORDER BY id LIMIT 1",[audience])).rows[0];
    if(!candidate)return {state:'EMPTY'};
    const key=[candidate.issuer,candidate.principal_id,candidate.agent_key],p=await selectPolicy(c,key,true);
    const job=(await c.query("SELECT *,deadline>clock_timestamp() AS fresh FROM hs_control_jobs WHERE audience=$1 AND id=$2 AND state='QUEUED' FOR UPDATE",[audience,candidate.id])).rows[0];
    if(!job)return {state:'EMPTY'};
    // Re-derive intent from actual stored bytes/tool, not a cached expected decision.
    const expected={audience,...tools[job.tool],challenge:job.expected.challenge,payloadHash:sha256(Buffer.from(job.payload)),requireApproval:p?.require_approval};
    const verified=inspectAuthority({...job.bundle,trust:pinnedTrust,expected});
    const identityMatches=job.bundle.proof?.payload?.performer==='AGENT'&&job.bundle.proof.payload.principalId===job.principal_id&&job.bundle.proof.payload.signerKey===job.agent_key&&job.bundle.status?.payload?.issuer===job.issuer&&verified.actionDigest===job.id;
    if(!p||!p.enabled||String(p.revision)!==String(job.revision)||!p.allowed_tools.includes(job.tool)||!job.fresh||!identityMatches||verified.decision!=='ALLOW'){
     await c.query("UPDATE hs_control_jobs SET state='CANCELLED' WHERE audience=$1 AND id=$2",[audience,job.id]);return {state:'CANCELLED'};
    }
    // Only harmless built-in tools. No adapter can be supplied by Agent input.
    if(job.tool==='draft.create')await c.query('INSERT INTO hs_control_drafts(audience,id,content) VALUES($1,$2,$3)',[audience,job.id,job.payload]);
    else if(job.tool!=='dataset.read')throw Error('TOOL_NOT_ALLOWED');
    const done=await c.query("UPDATE hs_control_jobs SET state='DONE' WHERE audience=$1 AND id=$2 AND deadline>clock_timestamp() RETURNING id",[audience,job.id]);
    if(!done.rows.length)throw Error('EXPIRED_DURING_EXECUTION');
    return {state:'DONE',tool:job.tool,...(job.tool==='dataset.read'?{data:[{name:'SYNTHETIC SAMPLE',value:42}]}:{draftStored:true})};
   });
  }
 };
}
