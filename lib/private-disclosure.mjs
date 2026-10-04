// Experimental local disclosure permission, separate from PoHA v1/Human verification.
import crypto from 'node:crypto';
import {types} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {readJson,writeJson} from './durable-json.mjs';
const PREFIX=Buffer.from('302a300506032b6570032100','hex');
const VERSION='HS_DISCLOSURE_EXPERIMENT_1';
const ENDPOINT='mock://wellness/v1',MODEL='mock-wellness-v1';
const FIELDS=['activityBand','ageBand','dietaryNeeds'];
const DIETS=['lactose_free','none','vegetarian'];
const schemas={
 GRANT:['version','principalKey','agentKey','purpose','endpoint','model','allowedFields','approvalFields','maxBytes','maxRequests','nonce','issuedAt','expiresAt'],
 ACTION:['version','grantId','agentKey','requestDigest','nonce','issuedAt','expiresAt'],
 APPROVAL:['version','grantId','principalKey','requestDigest','agentNonce','nonce','issuedAt','expiresAt'],
 REVOKE:['version','grantId','principalKey','nonce','issuedAt','expiresAt']
};
const fail=code=>{throw Error(code);};
function object(v){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!Object.getOwnPropertyDescriptor(v,k).enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))fail('INVALID_SCHEMA');}
function exact(v,fields){object(v);if(Object.keys(v).length!==fields.length||fields.some(k=>!Object.hasOwn(v,k)))fail('INVALID_SCHEMA');}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function base64(v,size){if(typeof v!=='string')fail('INVALID_ENCODING');const b=Buffer.from(v,'base64');if(b.length!==size||b.toString('base64')!==v)fail('INVALID_ENCODING');return b;}
function fields(v){if(!Array.isArray(v)||types.isProxy(v)||Reflect.ownKeys(v).some(k=>k!=='length'&&(typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))||Object.keys(v).length!==v.length||v.length>3||Array.from(v).some(x=>!FIELDS.includes(x))||JSON.stringify(v)!==JSON.stringify([...new Set(v)].sort()))fail('INVALID_FIELDS');}
function schema(kind,p){
 exact(p,schemas[kind]||[]);if(p.version!==VERSION)fail('UNSUPPORTED_VERSION');
 for(const k of ['principalKey','agentKey'])if(k in p)base64(p[k],32);
 for(const k of ['nonce','agentNonce'])if(k in p&&(typeof p[k]!=='string'||!/^[A-Za-z0-9_-]{22,128}$/.test(p[k])))fail('INVALID_NONCE');
 for(const k of ['issuedAt','expiresAt'])if(typeof p[k]!=='string'||!Number.isFinite(Date.parse(p[k]))||new Date(p[k]).toISOString()!==p[k])fail('INVALID_TIME');
 if('grantId' in p&&!/^DISCLOSURE-[a-f0-9]{64}$/.test(p.grantId))fail('INVALID_GRANT_ID');
 if('requestDigest' in p&&!/^[a-f0-9]{64}$/.test(p.requestDigest))fail('INVALID_REQUEST_DIGEST');
 if(kind==='GRANT'){
  if(p.purpose!=='GENERAL_WELLNESS'||p.endpoint!==ENDPOINT||p.model!==MODEL)fail('UNSUPPORTED_DESTINATION_OR_PURPOSE');
  fields(p.allowedFields);fields(p.approvalFields);
  if(!p.allowedFields.length||p.approvalFields.some(f=>!p.allowedFields.includes(f)))fail('INVALID_FIELDS');
  // The prototype always requires exact-byte consent for dietary data.
  if(p.allowedFields.includes('dietaryNeeds')&&!p.approvalFields.includes('dietaryNeeds'))fail('SENSITIVE_APPROVAL_REQUIRED');
  if(!Number.isInteger(p.maxBytes)||p.maxBytes<1||p.maxBytes>4096||!Number.isInteger(p.maxRequests)||p.maxRequests<1||p.maxRequests>10)fail('INVALID_BUDGET');
 }
}
export function disclosureBytes(kind,p){schema(kind,p);return Buffer.from('HS/EXPERIMENTAL/DISCLOSURE/1/'+kind+'\n'+canonical(p));}
export function signDisclosure(kind,p,key){if(key.asymmetricKeyType!=='ed25519')fail('ED25519_REQUIRED');return crypto.sign(null,disclosureBytes(kind,p),key).toString('base64');}
export function disclosurePublicKey(key){const k=key.type==='public'?key:crypto.createPublicKey(key);if(k.asymmetricKeyType!=='ed25519')fail('ED25519_REQUIRED');return k.export({format:'der',type:'spki'}).subarray(-32).toString('base64');}
export function grantId(p){return 'DISCLOSURE-'+hash(disclosureBytes('GRANT',p));}
export function nonce(){return crypto.randomBytes(24).toString('base64url');}
export function interval(lifetimeMs=60000){const now=Date.now();return {issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+lifetimeMs).toISOString()};}
export const DISCLOSURE_VERSION=VERSION;
function signed(kind,envelope,key){exact(envelope,['payload','signature']);const k=crypto.createPublicKey({key:Buffer.concat([PREFIX,base64(key,32)]),format:'der',type:'spki'});if(!crypto.verify(null,disclosureBytes(kind,envelope.payload),k,base64(envelope.signature,64)))fail('SIGNATURE_INVALID');}
function live(p,max){const now=Date.now(),start=Date.parse(p.issuedAt),end=Date.parse(p.expiresAt);if(start>now||end<=now||end<=start||end-start>max)fail('PERMISSION_EXPIRED_OR_INVALID');}
function stateValid(s){
 return s?.version===VERSION&&Array.isArray(s.revoked)&&s.revoked.every(x=>/^DISCLOSURE-[a-f0-9]{64}$/.test(x))&&s.used&&Object.getPrototypeOf(s.used)===Object.prototype&&Object.values(s.used).every(x=>x===true)&&s.counts&&Object.getPrototypeOf(s.counts)===Object.prototype&&Object.values(s.counts).every(n=>Number.isInteger(n)&&n>=0);
}
// Fixed vocabulary only. This removes direct/free-text identifiers, not all inference/covert channels.
export function projectVault(vault,requested){
 fields(requested);if(!requested.length)fail('EMPTY_REQUEST');const facts={};
 for(const f of requested){
  if(f==='ageBand'){const age=vault.ageYears;if(!Number.isInteger(age)||age<18||age>110)fail('INVALID_VAULT_VALUE');facts.ageBand=age<30?'18-29':age<45?'30-44':age<60?'45-59':'60+';}
  if(f==='activityBand'){if(!['low','moderate','high'].includes(vault.activityBand))fail('INVALID_VAULT_VALUE');facts.activityBand=vault.activityBand;}
  if(f==='dietaryNeeds'){const v=vault.dietaryNeeds;if(!Array.isArray(v)||!v.length||v.length>3||v.some(x=>!DIETS.includes(x))||new Set(v).size!==v.length)fail('INVALID_VAULT_VALUE');facts.dietaryNeeds=[...v].sort();}
 }
 return facts;
}
export class LocalDisclosureGateway {
 #principalKey;#vault;#ledgerFile;#captured=[];#mockResponse;
 constructor({principalKey,vault,ledgerFile,mockResponse='Synthetic wellness response. Remote output is inert data; no tool execution.'}){base64(principalKey,32);if(!path.isAbsolute(ledgerFile))fail('ABSOLUTE_LEDGER_PATH_REQUIRED');this.#principalKey=principalKey;this.#vault=structuredClone(vault);this.#ledgerFile=ledgerFile;if(typeof mockResponse!=='string'||mockResponse.length>8192)fail('INVALID_MOCK_RESPONSE');this.#mockResponse=mockResponse;}
 #state(){const s=readJson(this.#ledgerFile,{version:VERSION,revoked:[],used:{},counts:{}},stateValid);if(s.storageRecovered)fail('LEDGER_UNAVAILABLE');return s;}
 #transaction(fn){
  fs.mkdirSync(path.dirname(this.#ledgerFile),{recursive:true,mode:0o700});let lock;
  try{lock=fs.openSync(this.#ledgerFile+'.lock','wx',0o600);}catch(e){if(e.code==='EEXIST')fail('GATEWAY_BUSY');throw e;}
  try{const state=this.#state(),out=fn(state);writeJson(this.#ledgerFile,state);return out;}finally{fs.closeSync(lock);fs.unlinkSync(this.#ledgerFile+'.lock');}
 }
 #grant(envelope,state){signed('GRANT',envelope,this.#principalKey);const p=envelope.payload;live(p,3600000);if(p.principalKey!==this.#principalKey)fail('PRINCIPAL_MISMATCH');const id=grantId(p);if(state.revoked.includes(id))fail('GRANT_REVOKED');return {p,id};}
 #preview(envelope,proposal,state){
  exact(proposal,['fields']);fields(proposal.fields);const {p,id}=this.#grant(envelope,state);
  if(proposal.fields.some(f=>!p.allowedFields.includes(f)))fail('FIELD_NOT_AUTHORIZED');
  const facts=projectVault(this.#vault,proposal.fields),request={task:p.purpose,model:p.model,facts};
  const bytes=Buffer.from(canonical(request));if(bytes.length>p.maxBytes)fail('BYTE_BUDGET_EXCEEDED');
  if((state.counts[id]||0)>=p.maxRequests)fail('REQUEST_BUDGET_EXCEEDED');
  return {grantId:id,endpoint:p.endpoint,model:p.model,request,requestDigest:hash(bytes),byteLength:bytes.length,requiresApproval:proposal.fields.some(f=>p.approvalFields.includes(f)),bytes};
 }
 preview(grant,proposal){const {bytes,...out}=this.#preview(grant,proposal,this.#state());return out;}
 execute(input){
  exact(input,Object.hasOwn(input,'approval')?['grant','proposal','action','approval']:['grant','proposal','action']);
  const {grant,proposal,action,approval}=input;
  const result=this.#transaction(state=>{
   const preview=this.#preview(grant,proposal,state),p=grant.payload;
   signed('ACTION',action,p.agentKey);live(action.payload,60000);
   const a=action.payload;
   if(a.grantId!==preview.grantId||a.agentKey!==p.agentKey||a.requestDigest!==preview.requestDigest)fail('ACTION_CONTEXT_MISMATCH');
   const used=hash(Buffer.from('action:'+p.agentKey+':'+a.nonce));if(state.used[used])fail('ACTION_REPLAY');
   if(preview.requiresApproval&&!approval)return {disclosureDecision:'HUMAN_APPROVAL_REQUIRED',reason:'EXACT_DISCLOSURE_APPROVAL_REQUIRED',sent:false};
   let approvalNonce;
   if(approval){
    signed('APPROVAL',approval,this.#principalKey);live(approval.payload,60000);const q=approval.payload;
    if(q.principalKey!==this.#principalKey||q.grantId!==preview.grantId||q.requestDigest!==preview.requestDigest||q.agentNonce!==a.nonce)fail('APPROVAL_CONTEXT_MISMATCH');
    approvalNonce=hash(Buffer.from('approval:'+q.principalKey+':'+q.nonce));if(state.used[approvalNonce])fail('APPROVAL_REPLAY');
   }
   state.used[used]=true;if(approvalNonce)state.used[approvalNonce]=true;state.counts[preview.grantId]=(state.counts[preview.grantId]||0)+1;
   return {preview};
  });
  if(!result.preview)return result;
  // NO networking or configurable callback: only this byte capture is reachable in the MVP.
  // Consent is consumed durably before mock execution; failures never refund a nonce.
  const preview=result.preview;this.#captured.push(Buffer.from(preview.bytes));
  return {disclosureDecision:'ALLOW',sent:true,transport:'IN_PROCESS_MOCK_ONLY',requestDigest:preview.requestDigest,byteLength:preview.byteLength,response:{text:this.#mockResponse}};
 }
 revoke(envelope){
  signed('REVOKE',envelope,this.#principalKey);live(envelope.payload,60000);
  if(envelope.payload.principalKey!==this.#principalKey)fail('PRINCIPAL_MISMATCH');
  return this.#transaction(state=>{if(!state.revoked.includes(envelope.payload.grantId))state.revoked.push(envelope.payload.grantId);return {revoked:true};});
 }
 capturedRequests(){return this.#captured.map(b=>b.toString('utf8'));}
}

// Verifier receives consent metadata only, never the private vault or model facts.
export function verifyDisclosureGrant(envelope,principalKey){
 signed('GRANT',envelope,principalKey);live(envelope.payload,3600000);
 if(envelope.payload.principalKey!==principalKey)fail('PRINCIPAL_MISMATCH');
 return {id:grantId(envelope.payload),payload:envelope.payload};
}
