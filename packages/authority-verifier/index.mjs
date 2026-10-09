// Independent implementation: Node built-ins only; no COHIBA imports or network calls.
import crypto from 'node:crypto';
import {types} from 'node:util';
const scopes=['READ_PUBLIC_SIGNALS','DRAFT_CONTRIBUTION','DRAFT_APP_ACTION'];
const schemas={
 AGENT_BINDING:['version','principalId','principalKey','agentKey','name','audience','nonce','issuedAt','expiresAt'],
 DELEGATION:['version','principalId','principalKey','bindingId','agentKey','audience','scopes','resource','approvalRequired','nonce','issuedAt','expiresAt'],
 ACTION:['version','performer','principalId','signerKey','delegationId','audience','action','resource','payloadHash','nonce','issuedAt','expiresAt'],
 APPROVAL:['version','principalId','principalKey','actionDigest','audience','nonce','issuedAt','expiresAt']
};
const fail=code=>{throw Error(code);};
function plain(v){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!Object.getOwnPropertyDescriptor(v,k).enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))fail('INVALID_SCHEMA');}
function exact(v,keys){plain(v);if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('INVALID_SCHEMA');}
function list(v){if(!Array.isArray(v)||types.isProxy(v)||Reflect.ownKeys(v).some(k=>k!=='length'&&(typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))||Object.keys(v).length!==v.length)fail('INVALID_ARRAY');}
export function canonical(v){if(Array.isArray(v)){list(v);return '['+v.map(canonical).join(',')+']';}if(v&&typeof v==='object'){plain(v);return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}if(!['string','boolean','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))fail('INVALID_VALUE');return JSON.stringify(v);}
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function b64(v,size){if(typeof v!=='string')fail('INVALID_ENCODING');const bytes=Buffer.from(v,'base64');if(bytes.length!==size||bytes.toString('base64')!==v)fail('INVALID_ENCODING');return bytes;}
function timestamp(v){if(typeof v!=='string'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail('INVALID_TIME');return Date.parse(v);}
function live(p,now,max){const a=timestamp(p.issuedAt),b=timestamp(p.expiresAt);if(a>now||b<=now||b<=a||b-a>max)fail('EXPIRED_OR_INVALID_TIME');}
function audience(v){if(typeof v!=='string'||!v.startsWith('https://')||new URL(v).origin!==v)fail('INVALID_AUDIENCE');}
function schema(kind,p){
 exact(p,schemas[kind]||[]);if(p.version!=='1')fail('UNSUPPORTED_VERSION');
 for(const k of schemas[kind]){
  if(k==='scopes'){list(p[k]);if(!p[k].length||p[k].length>3||p[k].some(s=>!scopes.includes(s))||JSON.stringify(p[k])!==JSON.stringify([...new Set(p[k])].sort()))fail('INVALID_SCOPE');}
  else if(k==='approvalRequired'){if(typeof p[k]!=='boolean')fail('INVALID_SCHEMA');}
  else if(typeof p[k]!=='string'||p[k].length>256||(k!=='delegationId'&&!p[k]))fail('INVALID_SCHEMA');
 }
 if(!/^(HUMAN|COH)-[A-F0-9]{12}$/.test(p.principalId)||!/^[A-Za-z0-9_-]{22,128}$/.test(p.nonce))fail('INVALID_ID_OR_NONCE');
 audience(p.audience);timestamp(p.issuedAt);timestamp(p.expiresAt);
 for(const k of ['principalKey','agentKey','signerKey'])if(k in p)b64(p[k],32);
 if('resource' in p&&!/^[A-Za-z0-9_:/.-]{1,160}$/.test(p.resource))fail('INVALID_RESOURCE');
 if(kind==='DELEGATION'&&!/^AGENT-[a-f0-9]{64}$/.test(p.bindingId))fail('INVALID_BINDING_ID');
 if(kind==='ACTION'&&(!['HUMAN','AGENT'].includes(p.performer)||!scopes.includes(p.action)||!hex(p.payloadHash)||(p.performer==='HUMAN'?p.delegationId!=='':!/^DELEGATION-[a-f0-9]{64}$/.test(p.delegationId))))fail('INVALID_ACTION');
 if(kind==='APPROVAL'&&!hex(p.actionDigest))fail('INVALID_APPROVAL');
}
export function signingBytes(kind,p){schema(kind,p);return Buffer.from('HS/1/'+kind+'\n'+canonical(p));}
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const proofDigest=(kind,p)=>sha256(signingBytes(kind,p));
function signature(bytes,key,sig){const publicKey=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),b64(key,32)]),format:'der',type:'spki'});if(!crypto.verify(null,bytes,publicKey,b64(sig,64)))fail('SIGNATURE_INVALID');}
export const STATUS_VERSION='HS_AUTHORITY_STATUS_EXPERIMENT_1';
export function statusBytes(p){
 exact(p,['version','issuer','audience','challenge','actionDigest','principalId','principalKey','identityAssurance','assuranceExpiresAt','credentialEpoch','principalRevoked','records','issuedAt','expiresAt']);
 if(p.version!==STATUS_VERSION||typeof p.issuer!=='string'||!/^[a-z0-9-]{3,64}$/.test(p.issuer)||typeof p.challenge!=='string'||!/^[A-Za-z0-9_-]{22,128}$/.test(p.challenge)||!hex(p.actionDigest)||!/^(HUMAN|COH)-[A-F0-9]{12}$/.test(p.principalId))fail('INVALID_STATUS');
 audience(p.audience);b64(p.principalKey,32);timestamp(p.assuranceExpiresAt);timestamp(p.issuedAt);timestamp(p.expiresAt);
 if(typeof p.identityAssurance!=='string'||!Number.isSafeInteger(p.credentialEpoch)||p.credentialEpoch<1||typeof p.principalRevoked!=='boolean')fail('INVALID_STATUS');
 list(p.records);if(p.records.length>2)fail('INVALID_STATUS');
 for(const r of p.records){exact(r,['id','revoked']);if(typeof r.id!=='string'||!/^(AGENT|DELEGATION)-[a-f0-9]{64}$/.test(r.id)||typeof r.revoked!=='boolean')fail('INVALID_STATUS');}
 const ids=p.records.map(r=>r.id);if(JSON.stringify(ids)!==JSON.stringify([...new Set(ids)].sort()))fail('INVALID_STATUS');
 return Buffer.from('HS/EXPERIMENTAL/AUTHORITY_STATUS/1\n'+canonical(p));
}
function envelope(v){exact(v,['payload','signature']);}
function principal(p,s){if(p.principalId!==s.principalId||p.principalKey!==s.principalKey||p.audience!==s.audience)fail('PRINCIPAL_OR_AUDIENCE_MISMATCH');}
function active(s,id){const r=s.records.find(r=>r.id===id);if(!r)fail('STATUS_COVERAGE_MISSING');if(r.revoked)fail('AUTHORITY_REVOKED');}
// A status is an issuer statement, NOT a trustless Human proof or ZK credential.
export function inspectAuthority({proof,binding,delegation,status,expected,trust,now=Date.now()}){
 const out={mode:'INSPECT',actorClass:'UNVERIFIED',decision:'DENY',executionAuthorized:false,reasonCodes:[]};
 try{
  if(!Number.isFinite(now))fail('INVALID_CLOCK');
  exact(expected,['audience','action','resource','payloadHash','requireApproval','challenge']);
  if(typeof expected.requireApproval!=='boolean'||!hex(expected.payloadHash))fail('INVALID_POLICY');
  plain(proof);exact(proof,Object.hasOwn(proof,'approval')?['payload','signature','approval']:['payload','signature']);const a=proof.payload;
  // Proof may carry optional fresh owner approval.
  schema('ACTION',a);live(a,now,300000);const digest=proofDigest('ACTION',a);
  plain(status);exact(status,Object.hasOwn(status,'keyId')?['payload','signature','keyId']:['payload','signature']);const s=status.payload;const bytes=statusBytes(s);
  plain(trust);const pinned=trust[s.issuer];if(s.identityAssurance!=='PHONE_VERIFIED'||!pinned||!Array.isArray(pinned.acceptedAssurances)||!pinned.acceptedAssurances.includes(s.identityAssurance))fail('ISSUER_OR_ASSURANCE_NOT_TRUSTED');
  if(pinned.enabled!==undefined&&typeof pinned.enabled!=='boolean'||pinned.minimumEpoch!==undefined&&(!Number.isSafeInteger(pinned.minimumEpoch)||pinned.minimumEpoch<1)||pinned.allowedAudiences!==undefined&&!Array.isArray(pinned.allowedAudiences))fail('INVALID_ISSUER_REGISTRY');
  let issuerKey=pinned.publicKey;
  if(pinned.enabled===false||pinned.allowedAudiences&&!pinned.allowedAudiences.includes(expected.audience)||pinned.minimumEpoch!==undefined&&s.credentialEpoch<pinned.minimumEpoch)fail('ISSUER_POLICY_DENIED');
  if(pinned.keys){
   list(pinned.keys);for(const k of pinned.keys){exact(k,['id','publicKey','notBefore','notAfter','revoked']);if(typeof k.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(k.id)||typeof k.revoked!=='boolean')fail('INVALID_ISSUER_REGISTRY');}
   const ids=pinned.keys.map(k=>k.id),pubs=pinned.keys.map(k=>k.publicKey);
   if(new Set(ids).size!==ids.length||new Set(pubs).size!==pubs.length||pinned.keys.length>8)fail('INVALID_ISSUER_REGISTRY');
   const key=pinned.keys.find(k=>k.id===status.keyId);
   if(!key||key.revoked===true||timestamp(key.notBefore)>now||timestamp(key.notAfter)<=now||timestamp(s.issuedAt)<timestamp(key.notBefore)||timestamp(s.expiresAt)>timestamp(key.notAfter))fail('ISSUER_KEY_UNAVAILABLE');
   issuerKey=key.publicKey;
  }else if(Object.hasOwn(status,'keyId'))fail('ISSUER_KEY_ID_UNEXPECTED');
  signature(bytes,issuerKey,status.signature);live(s,now,30000);
  if(s.challenge!==expected.challenge||s.actionDigest!==digest||s.audience!==expected.audience)fail('STATUS_CONTEXT_MISMATCH');
  if(s.principalRevoked||timestamp(s.assuranceExpiresAt)<=now)fail('PRINCIPAL_OR_ASSURANCE_REVOKED');
  if(a.principalId!==s.principalId||a.audience!==s.audience||a.action!==expected.action||a.resource!==expected.resource||a.payloadHash!==expected.payloadHash)fail('ACTION_CONTEXT_MISMATCH');
  signature(signingBytes('ACTION',a),a.signerKey,proof.signature);
  let approvalRequired=expected.requireApproval,chainExpiry=Infinity;
  if(a.performer==='HUMAN'){if(a.signerKey!==s.principalKey)fail('PRINCIPAL_KEY_MISMATCH');}
  else{
   exact(binding,['id','payload','principalSignature','agentSignature']);exact(delegation,['id','payload','signature']);
   const b=binding.payload,d=delegation.payload;
   schema('AGENT_BINDING',b);schema('DELEGATION',d);live(b,now,2592000000);live(d,now,604800000);principal(b,s);principal(d,s);
   if(binding.id!=='AGENT-'+proofDigest('AGENT_BINDING',b)||delegation.id!=='DELEGATION-'+proofDigest('DELEGATION',d)||a.delegationId!==delegation.id||d.bindingId!==binding.id)fail('CHAIN_DIGEST_MISMATCH');
   active(s,binding.id);active(s,delegation.id);
   if(b.agentKey===s.principalKey||a.signerKey!==b.agentKey||a.signerKey!==d.agentKey||timestamp(d.expiresAt)>timestamp(b.expiresAt))fail('CHAIN_KEY_OR_EXPIRY_MISMATCH');
   signature(signingBytes('AGENT_BINDING',b),s.principalKey,binding.principalSignature);signature(signingBytes('AGENT_BINDING',b),b.agentKey,binding.agentSignature);signature(signingBytes('DELEGATION',d),s.principalKey,delegation.signature);
   chainExpiry=Math.min(timestamp(b.expiresAt),timestamp(d.expiresAt));
   if(!d.scopes.includes(a.action)||d.resource!==a.resource)fail('SCOPE_MISMATCH');approvalRequired ||=d.approvalRequired;
  }
  let approvalExpiry=Infinity;
  if(proof.approval){
   envelope(proof.approval);const p=proof.approval.payload;schema('APPROVAL',p);live(p,now,300000);principal(p,s);
   if(p.actionDigest!==digest)fail('APPROVAL_CONTEXT_MISMATCH');
   signature(signingBytes('APPROVAL',p),s.principalKey,proof.approval.signature);approvalRequired=false;approvalExpiry=timestamp(p.expiresAt);
  }
  out.actionDigest=digest;out.issuer=s.issuer;out.credentialEpoch=s.credentialEpoch;out.validUntil=new Date(Math.min(timestamp(s.expiresAt),timestamp(a.expiresAt),timestamp(s.assuranceExpiresAt),chainExpiry,approvalExpiry)).toISOString();
  out.actorClass=approvalRequired?'HUMAN_APPROVAL_REQUIRED':a.performer==='HUMAN'?'VERIFIED_HUMAN':'AUTHORIZED_AGENT';out.decision=approvalRequired?'REQUIRE_APPROVAL':'ALLOW';out.reasonCodes=['INSPECTION_ONLY'];
 }catch(e){out.reasonCodes=[String(e.message)];}
 return out;
}

// Atomic storage is supplied by the integrating service, never a process-local default.
// It MUST consume action + approval + challenge and epoch-floor checks in one transaction.
async function admitAuthority(input,{consume,trust,expected}={},mode='AUTHORIZE'){
 if(typeof consume!=='function')return {mode:'AUTHORIZE',decision:'DENY',actorClass:'UNVERIFIED',executionAuthorized:false,reasonCodes:['ATOMIC_REPLAY_STORE_REQUIRED']};
 let bundle;try{exact(input,['proof','binding','delegation','status']);bundle=structuredClone({...input,trust,expected});}catch{return {mode:'AUTHORIZE',decision:'DENY',actorClass:'UNVERIFIED',executionAuthorized:false,reasonCodes:['INVALID_ADMISSION_INPUT']};}
 const result=inspectAuthority(bundle);
 if(result.decision!=='ALLOW')return {...result,mode:'AUTHORIZE'};
 const a=bundle.proof.payload,s=bundle.status.payload,q=bundle.proof.approval?.payload;
 const admission={authorityIds:a.performer==='AGENT'?[bundle.binding.id,bundle.delegation.id]:[],action:a.action,resource:a.resource,payloadHash:a.payloadHash,audience:a.audience,issuer:s.issuer,principalId:s.principalId,credentialEpoch:s.credentialEpoch,signerKey:a.signerKey,actionNonce:a.nonce,actionDigest:result.actionDigest,challenge:s.challenge,approval:q?{principalKey:q.principalKey,nonce:q.nonce}:null,validUntil:result.validUntil};
 try{
  if(await consume(admission)!==true)return {...result,mode:'AUTHORIZE',decision:'DENY',actorClass:'UNVERIFIED',reasonCodes:['REPLAY_OR_EPOCH_REJECTED']};
  if(mode==='AUTHORIZE'&&Date.parse(result.validUntil)<=Date.now())throw Error('EXPIRED_DURING_ADMISSION');
  return {...result,mode,executionAuthorized:true,...(mode==='COMMIT'?{operationCommitted:true}:{}),reasonCodes:[mode==='COMMIT'?'EXTERNAL_SERVICE_ATOMIC_COMMIT':'EXTERNAL_SERVICE_ATOMIC_ADMISSION']};
 }catch(e){return {...result,mode:'AUTHORIZE',decision:'DENY',actorClass:'UNVERIFIED',reasonCodes:[e.message==='EXPIRED_DURING_ADMISSION'?e.message:'REPLAY_STORE_UNAVAILABLE']};}
}

// Safe response/log view. It intentionally excludes identity, keys and authority records.
export function publicDecision(result){
 return {actorClass:result.actorClass,decision:result.decision,executionAuthorized:result.executionAuthorized===true,reasonCodes:[...result.reasonCodes],...(result.validUntil?{validUntil:result.validUntil}:{}),...(result.mode==='COMMIT'?{operationCommitted:result.operationCommitted===true}:{})};
}

export async function authorizeAuthority(input,options){return admitAuthority(input,options);}

// commit must validate fresh local revocation and write the exact effect atomically.
export async function commitAuthority(input,{commit,trust,expected}={}){
 const result=await admitAuthority(input,{consume:commit,trust,expected},'COMMIT');
 return {...result,mode:'COMMIT',operationCommitted:result.operationCommitted===true};
}
