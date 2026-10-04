import crypto from 'node:crypto';

export const POHA_VERSION='1';
export const POHA_SCOPES=Object.freeze(['READ_PUBLIC_SIGNALS','DRAFT_CONTRIBUTION','DRAFT_APP_ACTION']);
const DAY=86400000;
const PREFIX=Buffer.from('302a300506032b6570032100','hex');
const fields={
  AGENT_BINDING:['version','principalId','principalKey','agentKey','name','audience','nonce','issuedAt','expiresAt'],
  DELEGATION:['version','principalId','principalKey','bindingId','agentKey','audience','scopes','resource','approvalRequired','nonce','issuedAt','expiresAt'],
  ACTION:['version','performer','principalId','signerKey','delegationId','audience','action','resource','payloadHash','nonce','issuedAt','expiresAt'],
  APPROVAL:['version','principalId','principalKey','actionDigest','audience','nonce','issuedAt','expiresAt']
};
function fail(code){throw new Error(code);}
function bytes64(value,size){
  if(typeof value!=='string')fail('INVALID_ENCODING');
  const b=Buffer.from(value,'base64');
  if(b.length!==size || b.toString('base64')!==value)fail('INVALID_ENCODING');
  return b;
}
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function schema(kind,p){
  const expected=fields[kind];
  if(!expected || !p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).length!==expected.length || expected.some(k=>!Object.hasOwn(p,k)))fail('INVALID_SCHEMA');
  if(p.version!==POHA_VERSION)fail('UNSUPPORTED_VERSION');
  for(const k of expected){
    if(k==='scopes'){
      if(!Array.isArray(p.scopes) || !p.scopes.length || p.scopes.length>3 || p.scopes.some(s=>!POHA_SCOPES.includes(s)) || JSON.stringify(p.scopes)!==JSON.stringify([...new Set(p.scopes)].sort()))fail('INVALID_SCOPE');
    }else if(k==='approvalRequired'){
      if(typeof p[k]!=='boolean')fail('INVALID_SCHEMA');
    }else if(typeof p[k]!=='string' || p[k].length>256 || (k!=='delegationId' && !p[k].length))fail('INVALID_SCHEMA');
  }
  if(!/^(HUMAN|COH)-[A-F0-9]{12}$/.test(p.principalId))fail('INVALID_PRINCIPAL');
  for(const k of ['principalKey','agentKey','signerKey'])if(k in p)bytes64(p[k],32);
  if(!/^[A-Za-z0-9_-]{22,128}$/.test(p.nonce))fail('INVALID_NONCE');
  if(!/^https:\/\//.test(p.audience) || new URL(p.audience).origin!==p.audience)fail('INVALID_AUDIENCE');
  if('resource' in p && !/^[A-Za-z0-9_:/.-]{1,160}$/.test(p.resource))fail('INVALID_RESOURCE');
  if(kind==='ACTION'){
    if(!['HUMAN','AGENT'].includes(p.performer) || !POHA_SCOPES.includes(p.action) || !/^[a-f0-9]{64}$/.test(p.payloadHash))fail('INVALID_ACTION');
    if((p.performer==='HUMAN' && p.delegationId!=='') || (p.performer==='AGENT' && !/^DELEGATION-[a-f0-9]{64}$/.test(p.delegationId)))fail('INVALID_ACTION');
  }
  if(kind==='DELEGATION' && !/^AGENT-[a-f0-9]{64}$/.test(p.bindingId))fail('INVALID_BINDING_ID');
  if(kind==='APPROVAL' && !/^[a-f0-9]{64}$/.test(p.actionDigest))fail('INVALID_ACTION_DIGEST');
  for(const k of ['issuedAt','expiresAt'])if(!Number.isFinite(Date.parse(p[k])) || new Date(p[k]).toISOString()!==p[k])fail('INVALID_TIME');
}
// Restricted JSON schema: strings, booleans and string arrays only; sorted JSON keys.
// Signing is domain-separated and never authorizes token transfers.
export function signingBytes(kind,payload){schema(kind,payload);return Buffer.from('HS/1/'+kind+'\n'+canonical(payload),'utf8');}
export function proofDigest(kind,payload){return crypto.createHash('sha256').update(signingBytes(kind,payload)).digest('hex');}
export function payloadDigest(data){
  if(!Buffer.isBuffer(data) && !(data instanceof Uint8Array))fail('PAYLOAD_BYTES_REQUIRED');
  return crypto.createHash('sha256').update(data).digest('hex');
}
function signature(kind,p,key,sig){
  const publicKey=crypto.createPublicKey({key:Buffer.concat([PREFIX,bytes64(key,32)]),format:'der',type:'spki'});
  if(!crypto.verify(null,signingBytes(kind,p),publicKey,bytes64(sig,64)))fail('SIGNATURE_INVALID');
}
function live(p,now,max){
  const issued=Date.parse(p.issuedAt),expiry=Date.parse(p.expiresAt),t=now.getTime();
  if(issued>t || expiry<=t || expiry<=issued || expiry-issued>max)fail('PROOF_TIME_INVALID');
}
function principal(p,context){
  if(p.principalId!==context.principalId || p.principalKey!==context.principalKey)fail('PRINCIPAL_KEY_MISMATCH');
  if(p.audience!==context.audience)fail('AUDIENCE_MISMATCH');
}
function available(store){if(store.storageRecovered)fail('POHA_STORAGE_UNAVAILABLE');}
export function bindAgent(store,context,{payload,principalSignature,agentSignature},now=new Date()){
  available(store);schema('AGENT_BINDING',payload);principal(payload,context);live(payload,now,30*DAY);
  if(payload.agentKey===payload.principalKey)fail('AGENT_KEY_MUST_DIFFER');
  signature('AGENT_BINDING',payload,payload.principalKey,principalSignature);
  signature('AGENT_BINDING',payload,payload.agentKey,agentSignature);
  const id='AGENT-'+proofDigest('AGENT_BINDING',payload);
  store.pohaAgents ||= [];
  if(store.pohaAgents.some(x=>x.id===id || (x.payload.principalId===payload.principalId && x.payload.nonce===payload.nonce)))fail('BINDING_REPLAY');
  if(store.pohaAgents.filter(x=>x.payload.principalId===payload.principalId).length>=20)fail('AGENT_LIMIT_REACHED');
  const record={id,payload,principalSignature,agentSignature,revokedAt:null};store.pohaAgents.push(record);return record;
}
function binding(store,id,context,now){
  const b=(store.pohaAgents||[]).find(x=>x.id===id);
  if(!b || b.revokedAt)fail('AGENT_UNAVAILABLE');
  if(b.id!=='AGENT-'+proofDigest('AGENT_BINDING',b.payload))fail('BINDING_DIGEST_INVALID');
  principal(b.payload,context);live(b.payload,now,30*DAY);
  signature('AGENT_BINDING',b.payload,b.payload.principalKey,b.principalSignature);
  signature('AGENT_BINDING',b.payload,b.payload.agentKey,b.agentSignature);
  return b;
}
export function createSignedDelegation(store,context,{payload,signature:signatureValue},now=new Date()){
  available(store);schema('DELEGATION',payload);principal(payload,context);live(payload,now,7*DAY);
  const b=binding(store,payload.bindingId,context,now);
  if(payload.agentKey!==b.payload.agentKey || Date.parse(payload.expiresAt)>Date.parse(b.payload.expiresAt))fail('DELEGATION_BINDING_MISMATCH');
  signature('DELEGATION',payload,payload.principalKey,signatureValue);
  const id='DELEGATION-'+proofDigest('DELEGATION',payload);store.pohaDelegations ||= [];
  if(store.pohaDelegations.some(x=>x.id===id || (x.payload.principalId===payload.principalId && x.payload.nonce===payload.nonce)))fail('DELEGATION_REPLAY');
  if(store.pohaDelegations.filter(x=>x.payload.principalId===payload.principalId).length>=500)fail('DELEGATION_LIMIT_REACHED');
  const record={id,payload,signature:signatureValue,revokedAt:null};store.pohaDelegations.push(record);return record;
}
export function revokeSignedRecord(store,context,{type,id},now=new Date()){
  available(store);
  const records=type==='AGENT' ? store.pohaAgents : type==='DELEGATION' ? store.pohaDelegations : null;
  if(!records)fail('INVALID_REVOCATION_TYPE');
  const r=records.find(x=>x.id===id && x.payload.principalId===context.principalId);
  if(!r)fail('RECORD_NOT_FOUND');
  const changed=!r.revokedAt;if(changed)r.revokedAt=now.toISOString();return {record:r,changed};
}
// Inspection is read-only: ALLOW here describes policy eligibility, never an execution receipt.
export function inspectAction(store,context,{payload,signature:signatureValue,approval},expected,now=new Date()){
  const result={version:POHA_VERSION,mode:'INSPECT',executionAuthorized:false,actorClass:'UNVERIFIED',decision:'DENY',signatureValid:false,authorityValid:false,identityAssurance:context.identityAssurance||'NONE',reasonCodes:[],checkedAt:now.toISOString(),policyVersion:'PHONE_BOUND_DRAFT_V1',revocationFreshness:'ONLINE_SNAPSHOT'};
  try{
    available(store);schema('ACTION',payload);live(payload,now,5*60000);
    if(payload.principalId!==context.principalId)fail('PRINCIPAL_MISMATCH');
    if(payload.audience!==context.audience || payload.audience!==expected.audience)fail('AUDIENCE_MISMATCH');
    if(payload.action!==expected.action || payload.resource!==expected.resource || payload.payloadHash!==expected.payloadHash)fail('ACTION_CONTEXT_MISMATCH');
    signature('ACTION',payload,payload.signerKey,signatureValue);result.signatureValid=true;
    if(context.identityAssurance!=='PHONE_VERIFIED')fail('HUMAN_ASSURANCE_INSUFFICIENT');
    let approvalRequired=Boolean(expected.requireApproval);
    if(payload.performer==='HUMAN'){
      if(payload.signerKey!==context.principalKey)fail('PRINCIPAL_KEY_MISMATCH');
    }else{
      const d=(store.pohaDelegations||[]).find(x=>x.id===payload.delegationId);
      if(!d || d.revokedAt)fail('DELEGATION_UNAVAILABLE');
      if(d.id!=='DELEGATION-'+proofDigest('DELEGATION',d.payload))fail('DELEGATION_DIGEST_INVALID');
      principal(d.payload,context);live(d.payload,now,7*DAY);
      signature('DELEGATION',d.payload,context.principalKey,d.signature);
      const b=binding(store,d.payload.bindingId,context,now);
      if(payload.signerKey!==d.payload.agentKey || payload.signerKey!==b.payload.agentKey)fail('AGENT_KEY_MISMATCH');
      if(!d.payload.scopes.includes(payload.action) || d.payload.resource!==payload.resource)fail('SCOPE_MISMATCH');
      approvalRequired ||= d.payload.approvalRequired;
    }
    result.authorityValid=true;result.actionDigest=proofDigest('ACTION',payload);
    if(approvalRequired || approval){
      if(!approval){result.actorClass='HUMAN_APPROVAL_REQUIRED';result.decision='REQUIRE_APPROVAL';result.reasonCodes=['FRESH_APPROVAL_REQUIRED'];return result;}
      schema('APPROVAL',approval.payload);principal(approval.payload,context);live(approval.payload,now,5*60000);
      if(approval.payload.actionDigest!==result.actionDigest)fail('APPROVAL_ACTION_MISMATCH');
      signature('APPROVAL',approval.payload,context.principalKey,approval.signature);
    }
    result.actorClass=payload.performer==='HUMAN'?'VERIFIED_HUMAN':'AUTHORIZED_AGENT';result.decision='ALLOW';
    result.reasonCodes=['INSPECTION_ONLY_NONCE_NOT_CONSUMED'];
  }catch(e){result.actorClass='UNVERIFIED';result.decision='DENY';result.authorityValid=false;result.reasonCodes=[String(e.message)];}
  return result;
}
