// Node SDK v0.1: signed proof construction and diagnostics. Private keys stay local.
import crypto from 'node:crypto';
import {signingBytes,payloadDigest} from '../lib/poha-v1.mjs';
export {signingBytes,proofDigest,payloadDigest,POHA_SCOPES} from '../lib/poha-v1.mjs';
export function signProof(kind,payload,privateKey){
  if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('ED25519_KEY_REQUIRED');
  return crypto.sign(null,signingBytes(kind,payload),privateKey).toString('base64');
}
export function publicKeyBase64(key){
  const publicKey=key.type==='public'?key:crypto.createPublicKey(key);
  if(publicKey.asymmetricKeyType!=='ed25519')throw new Error('ED25519_KEY_REQUIRED');
  return publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
}

export class HumanSignalClient {
  constructor({baseUrl,token}){
    this.baseUrl=new URL(baseUrl).origin;
    if(!this.baseUrl.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(this.baseUrl))throw new Error('HTTPS_REQUIRED');
    this.token=token;
  }
  async request(path,body){
    const response=await fetch(this.baseUrl+'/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+this.token,origin:this.baseUrl,'content-type':'application/json'},signal:AbortSignal.timeout(10000),...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'HUMAN_SIGNAL_REQUEST_FAILED');return result;
  }
  agency(){return this.request('agency');}
  registerAgent(binding){return this.request('agents/register',binding);}
  delegate(grant){return this.request('delegations',grant);}
  revoke(type,id){return this.request('revocations',{type,id});}
  inspect(proof,expected){return this.request('actions/inspect',{proof,expected});}
}

// Exact immutable bytes are signed locally. No Human bearer session is used by the service.
export function agentBindingPayload({principalId,principalKey,agentKey,audience,name,lifetimeMs=3600000}){
 const now=new Date();return {version:'1',principalId,principalKey,agentKey,audience,name,nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+lifetimeMs).toISOString()};
}
export function delegationPayload({principalId,principalKey,bindingId,agentKey,audience,scopes,resource,approvalRequired=false,expiresAt}){
 return {version:'1',principalId,principalKey,bindingId,agentKey,audience,scopes:[...new Set(scopes)].sort(),resource,approvalRequired,nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:new Date().toISOString(),expiresAt};
}
export function actionPayload({principalId,signerKey,delegationId,audience,action,resource,payloadBytes,performer='AGENT'}){
 const now=new Date();return {version:'1',performer,principalId,signerKey,delegationId,audience,action,resource,payloadHash:payloadDigest(payloadBytes),nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+60000).toISOString()};
}
