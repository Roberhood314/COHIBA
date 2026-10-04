import {isDeepStrictEqual,types} from 'node:util';
import {verifyDisclosureGrant} from './private-disclosure.mjs';

export const DISCLOSURE_POLICY_VERSION='HS_LOCAL_DISCLOSURE_V1';
function exact(value,keys){
 if(!value||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)||!Object.getOwnPropertyDescriptor(value,k).enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))throw Error('INVALID_DISCLOSURE_METADATA');
}
export function validateDisclosurePolicy(policy){
 exact(policy,['version','endpoint','model','purpose','maxBytes']);
 if(policy.version!==DISCLOSURE_POLICY_VERSION||policy.endpoint!=='mock://wellness/v1'||policy.model!=='mock-wellness-v1'||policy.purpose!=='GENERAL_WELLNESS'||!Number.isInteger(policy.maxBytes)||policy.maxBytes<1||policy.maxBytes>4096)throw Error('INVALID_DISCLOSURE_POLICY');
 return structuredClone(policy);
}
export function disclosureManifest(grant,preview){
 return {version:DISCLOSURE_POLICY_VERSION,grant:structuredClone(grant),fields:Object.keys(preview.request.facts).sort(),requestDigest:preview.requestDigest,byteLength:preview.byteLength};
}
export function inspectDisclosureMetadata(bytes,policy,context,action){
 validateDisclosurePolicy(policy);
 let metadata;try{metadata=JSON.parse(bytes.toString('utf8'));}catch{throw Error('INVALID_DISCLOSURE_METADATA');}
 exact(metadata,['version','grant','fields','requestDigest','byteLength']);
 if(metadata.version!==DISCLOSURE_POLICY_VERSION||!/^[a-f0-9]{64}$/.test(metadata.requestDigest)||typeof metadata.requestDigest!=='string'||!Number.isInteger(metadata.byteLength)||metadata.byteLength<1)throw Error('INVALID_DISCLOSURE_METADATA');
 const {id,payload}=verifyDisclosureGrant(metadata.grant,context.principalKey);
 if(action.performer!=='AGENT'||action.action!=='DRAFT_APP_ACTION'||action.signerKey!==payload.agentKey)throw Error('DISCLOSURE_AGENT_MISMATCH');
 if(payload.endpoint!==policy.endpoint||payload.model!==policy.model||payload.purpose!==policy.purpose||metadata.byteLength>Math.min(payload.maxBytes,policy.maxBytes))throw Error('DISCLOSURE_POLICY_DENIED');
 const fields=metadata.fields;
 if(!Array.isArray(fields)||!fields.length||fields.length>3||fields.some(f=>typeof f!=='string'||!payload.allowedFields.includes(f))||!isDeepStrictEqual(fields,[...new Set(fields)].sort()))throw Error('DISCLOSURE_FIELDS_DENIED');
 return {grantId:id,maxRequests:payload.maxRequests,requireApproval:fields.some(f=>payload.approvalFields.includes(f)),requestDigest:metadata.requestDigest};
}

// Trusted, in-process composition. No network adapter or caller-supplied receipt.
// The authoritative PoHA nonce is consumed before local release. No refunds/retries.
export class PohaDisclosureGateway {
 #local;#database;
 constructor({localGateway,database}){this.#local=localGateway;this.#database=database;}
 preview(grant,proposal){const preview=this.#local.preview(grant,proposal);return {...preview,manifest:disclosureManifest(grant,preview)};}
 async execute({input,auth,raw,request,resolveContext}){
  // Snapshot before the first await: caller mutation must not change released bytes.
  input=structuredClone(input);request=structuredClone(request);auth=structuredClone(auth);raw=Buffer.from(raw);
  const preview=this.preview(input.grant,input.proposal);
  const manifestBytes=Buffer.from(request.payloadBase64,'base64');
  if(manifestBytes.toString('base64')!==request.payloadBase64||!isDeepStrictEqual(JSON.parse(manifestBytes.toString()),preview.manifest)||!Buffer.from(JSON.stringify(request)).equals(raw))throw Error('DISCLOSURE_REQUEST_MISMATCH');
  const a=request.proof.payload;
  if(a.signerKey!==input.grant.payload.agentKey||a.nonce!==input.action.payload.nonce)throw Error('DISCLOSURE_ACTION_MISMATCH');
  if(preview.requiresApproval&&!input.approval)return {disclosureDecision:'HUMAN_APPROVAL_REQUIRED',sent:false};
  // Service must explicitly opt into the policy; a generic draft receipt is insufficient.
  const receipt=await this.#database.authorize(auth,raw,request,resolveContext);
  if(receipt.disclosurePolicyVersion!==DISCLOSURE_POLICY_VERSION||receipt.disclosureRequestDigest!==preview.requestDigest||receipt.decision!=='ALLOW'||!receipt.executionAuthorized)return {sent:false,disclosureDecision:receipt.actorClass==='HUMAN_APPROVAL_REQUIRED'?'HUMAN_APPROVAL_REQUIRED':'DENY',receipt};
  return {...this.#local.execute(input),receipt};
 }
}
