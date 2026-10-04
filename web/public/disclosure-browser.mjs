import {canonical,base64,digest,nonce,timing,signingBytes} from './poha-browser.mjs';
export const VERSION='HS_DISCLOSURE_EXPERIMENT_1',POLICY='HS_LOCAL_DISCLOSURE_V1';
export const disclosureBytes=(kind,payload)=>new TextEncoder().encode('HS/EXPERIMENTAL/DISCLOSURE/1/'+kind+'\n'+canonical(payload));
const plain=v=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))throw Error('INVALID_INPUT');};
export function syntheticRequest(selection){
 plain(selection);if(Object.keys(selection).length!==3||!['18-29','30-44','45-59','60+'].includes(selection.ageBand)||!['low','moderate','high'].includes(selection.activityBand)||!['omit','none','vegetarian','lactose_free'].includes(selection.dietaryNeeds))throw Error('INVALID_SYNTHETIC_SELECTION');
 const facts={ageBand:selection.ageBand,activityBand:selection.activityBand};
 if(selection.dietaryNeeds!=='omit')facts.dietaryNeeds=[selection.dietaryNeeds];
 return {task:'GENERAL_WELLNESS',model:'mock-wellness-v1',facts};
}
async function verify(kind,envelope,key){
 const raw=Uint8Array.from(atob(key),c=>c.charCodeAt(0));
 const publicKey=await crypto.subtle.importKey('raw',raw,'Ed25519',false,['verify']);
 const sig=Uint8Array.from(atob(envelope.signature),c=>c.charCodeAt(0));
 if(!await crypto.subtle.verify('Ed25519',publicKey,sig,disclosureBytes(kind,envelope.payload)))throw Error('LOCAL_SIGNATURE_INVALID');
}
const live=p=>{if(Date.parse(p.expiresAt)<=Date.now()||Date.parse(p.issuedAt)>Date.now())throw Error('LOCAL_PERMISSION_EXPIRED');};
export class BrowserDisclosure {
 #state;#used=false;#busy=false;#revoked=false;
 constructor(state){this.#state=structuredClone(state);}
 snapshot(){return structuredClone(this.#state);}
 revoke(){this.#revoked=true;}
 async approve(signOwner){
  if(this.#busy||this.#revoked||this.#used)throw Error('LOCAL_PERMISSION_UNAVAILABLE');
  this.#busy=true;try{
   const s=this.#state;live(s.action.payload);
   const q={...timing(),version:VERSION,principalKey:s.owner.principalKey,grantId:s.action.payload.grantId,requestDigest:s.action.payload.requestDigest,agentNonce:s.action.payload.nonce};
   const local={payload:q,signature:await signOwner(disclosureBytes('APPROVAL',q))};
   const p={...timing(),principalId:s.owner.principalId,principalKey:s.owner.principalKey,audience:s.audience,actionDigest:await digest(signingBytes('ACTION',s.request.proof.payload))};
   const approval={payload:p,signature:await signOwner(signingBytes('APPROVAL',p))};
   if(this.#revoked)throw Error('LOCAL_PERMISSION_UNAVAILABLE');
   s.approval=local;s.request.proof.approval=approval;
  }finally{this.#busy=false;}
 }
 async execute(authorize){
  if(this.#busy||this.#revoked||this.#used)throw Error('LOCAL_PERMISSION_UNAVAILABLE');
  this.#busy=true;try{
   const s=structuredClone(this.#state);live(s.grant.payload);live(s.action.payload);
   await verify('GRANT',s.grant,s.owner.principalKey);await verify('ACTION',s.action,s.grant.payload.agentKey);
   const bytes=new TextEncoder().encode(canonical(s.outbound));
   if(await digest(bytes)!==s.action.payload.requestDigest||bytes.length>s.grant.payload.maxBytes)throw Error('LOCAL_REQUEST_CHANGED');
   const sensitive=Object.hasOwn(s.outbound.facts,'dietaryNeeds');
   if(sensitive&&!s.approval)return {sent:false,actorClass:'HUMAN_APPROVAL_REQUIRED'};
   if(s.approval){live(s.approval.payload);await verify('APPROVAL',s.approval,s.owner.principalKey);if(s.approval.payload.agentNonce!==s.action.payload.nonce||s.approval.payload.requestDigest!==s.action.payload.requestDigest||s.approval.payload.grantId!==s.action.payload.grantId)throw Error('LOCAL_APPROVAL_MISMATCH');}
   const response=await authorize(structuredClone(s.request));const r=response.result;
   if(r?.decision!=='ALLOW'||!r.executionAuthorized||r.disclosurePolicyVersion!==POLICY||r.disclosureRequestDigest!==s.action.payload.requestDigest)return {sent:false,actorClass:r?.actorClass||'UNVERIFIED',reason:r?.reasonCodes?.join(', ')||'VERIFICATION_DENIED'};
   // Recheck after await; revocation or expiry while checking must prevent local release.
   if(this.#revoked)throw Error('LOCAL_PERMISSION_UNAVAILABLE');live(s.grant.payload);live(s.action.payload);if(s.approval)live(s.approval.payload);
   this.#used=true;
   return {sent:true,actorClass:r.actorClass,transport:'BROWSER_MOCK_ONLY',exactOutbound:JSON.parse(new TextDecoder().decode(bytes)),response:'Mock đã nhận dữ liệu được phép. Không gọi AI bên ngoài.',receiptId:r.receiptId};
  }finally{this.#busy=false;}
 }
}
export async function prepareDisclosure({selection,owner,audience,agent,signOwner,register}){
 const outbound=syntheticRequest(selection),fields=Object.keys(outbound.facts).sort();
 const common={principalId:owner.principalId,audience};
 const b={...timing(3600000),...common,principalKey:owner.principalKey,agentKey:agent.publicKey,name:'Disclosure pilot · tab hiện tại'};
 const binding=await register('agents/register',{payload:b,agentSignature:await agent.sign('AGENT_BINDING',b),principalSignature:await signOwner(signingBytes('AGENT_BINDING',b))});
 const resource='draft:disclosure-'+nonce();
 const d={...timing(3500000),...common,principalKey:owner.principalKey,agentKey:agent.publicKey,bindingId:binding.record.id,scopes:['DRAFT_APP_ACTION'],resource,approvalRequired:false,expiresAt:b.expiresAt};
 const delegation=await register('delegations',{payload:d,signature:await signOwner(signingBytes('DELEGATION',d))});
 const p={...timing(600000),version:VERSION,principalKey:owner.principalKey,agentKey:agent.publicKey,purpose:outbound.task,endpoint:'mock://wellness/v1',model:outbound.model,allowedFields:fields,approvalFields:fields.includes('dietaryNeeds')?['dietaryNeeds']:[],maxBytes:4096,maxRequests:1};
 const grant={payload:p,signature:await signOwner(disclosureBytes('GRANT',p))};
 const id='DISCLOSURE-'+await digest(disclosureBytes('GRANT',p)),requestBytes=new TextEncoder().encode(canonical(outbound));
 const a={...timing(),version:VERSION,grantId:id,agentKey:agent.publicKey,requestDigest:await digest(requestBytes)};
 const action={payload:a,signature:await agent.signBytes(disclosureBytes('ACTION',a))};
 const manifest={version:POLICY,grant,fields,requestDigest:a.requestDigest,byteLength:requestBytes.length};
 const payloadBase64=base64(new TextEncoder().encode(JSON.stringify(manifest)));
 const poha={...timing(),...common,nonce:a.nonce,performer:'AGENT',signerKey:agent.publicKey,delegationId:delegation.record.id,action:'DRAFT_APP_ACTION',resource,payloadHash:await digest(new TextEncoder().encode(JSON.stringify(manifest)))};
 const request={action:poha.action,resource,payloadBase64,proof:{payload:poha,signature:await agent.sign('ACTION',poha)}};
 return new BrowserDisclosure({outbound,grant,action,request,owner,audience});
}
