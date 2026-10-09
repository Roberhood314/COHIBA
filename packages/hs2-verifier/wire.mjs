// Portable signature checks shared by Node verifier and browser Worker.
import {ed25519} from '@noble/curves/ed25519.js';
import {slh_dsa_sha2_128f as slh} from '@noble/post-quantum/slh-dsa.js';

export const HS2_VERSION='HS/2-EXPERIMENT-1';
export const HS2_SUITE='Ed25519+SLH-DSA-SHA2-128f-AND';
export const HS2_KINDS=Object.freeze(['ACTION','BINDING_OWNER','BINDING_AGENT','DELEGATION','APPROVAL','STATUS']);
const fail=code=>{throw Error(code);};
export function exact(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))fail('HS2_INVALID_SCHEMA');
}
export function encode64(bytes){let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);}
export function decode64(value,size){
 if(typeof value!=='string'||value.length>24000)fail('HS2_INVALID_ENCODING');
 let bytes;try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{fail('HS2_INVALID_ENCODING');}
 if(bytes.length!==size||encode64(bytes)!==value)fail('HS2_INVALID_ENCODING');return bytes;
}
function time(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('HS2_INVALID_TIME');return Date.parse(value);}
export function signatureMessage({kind,classicalBytes,edPublicKey,edSignature,keyId}){
 if(!HS2_KINDS.includes(kind)||!(classicalBytes instanceof Uint8Array)||classicalBytes.length>16384||typeof keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId))fail('HS2_INVALID_CONTEXT');
 decode64(edPublicKey,32);decode64(edSignature,64);
 // Fixed ordered string fields, not a client-specified algorithm negotiation.
 return new TextEncoder().encode(HS2_VERSION+'\n'+JSON.stringify([HS2_SUITE,kind,keyId,edPublicKey,edSignature,encode64(classicalBytes)]));
}
export function validateRegistry(registry){
 if(!registry||Object.getPrototypeOf(registry)!==Object.prototype||Object.keys(registry).length>64)fail('HS2_INVALID_KEY_REGISTRY');
 const owners=new Map();
 for(const [id,key] of Object.entries(registry)){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))fail('HS2_INVALID_KEY_REGISTRY');
  exact(key,['ed25519Key','slhDsaKey','notBefore','notAfter','revoked']);
  decode64(key.ed25519Key,32);decode64(key.slhDsaKey,slh.lengths.publicKey);
  if(typeof key.revoked!=='boolean'||time(key.notAfter)<=time(key.notBefore))fail('HS2_INVALID_KEY_REGISTRY');
  const owner=owners.get(key.slhDsaKey);if(owner&&owner!==key.ed25519Key)fail('HS2_KEY_REUSE');owners.set(key.slhDsaKey,key.ed25519Key);
 }
}
export function verifyDualSignature({version,suite,kind,classicalBytes,edPublicKey,edSignature,attestation,registry,now=Date.now()}){
 if(version!==HS2_VERSION||suite!==HS2_SUITE)fail('HS2_DOWNGRADE_OR_SUITE_REJECTED');
 if(!Number.isFinite(now))fail('HS2_INVALID_CLOCK');
 exact(attestation,['keyId','signature']);validateRegistry(registry);
 if(typeof attestation.keyId!=='string'||!Object.hasOwn(registry,attestation.keyId))fail('HS2_PQ_KEY_NOT_PINNED');
 const key=registry[attestation.keyId];
 if(key.revoked||time(key.notBefore)>now||time(key.notAfter)<=now||key.ed25519Key!==edPublicKey)fail('HS2_PQ_KEY_UNAVAILABLE');
 const message=signatureMessage({kind,classicalBytes,edPublicKey,edSignature,keyId:attestation.keyId});
 if(!ed25519.verify(decode64(edSignature,64),classicalBytes,decode64(edPublicKey,32),{zip215:false}))fail('HS2_ED25519_INVALID');
 if(!slh.verify(decode64(attestation.signature,slh.lengths.signature),message,decode64(key.slhDsaKey,slh.lengths.publicKey)))fail('HS2_SLH_DSA_INVALID');
 return {valid:true,validUntil:key.notAfter};
}
// Signing helper for offline operator tooling, never a public signing endpoint.
export function signAttestation(context,secretKey,options){
 return {keyId:context.keyId,signature:encode64(slh.sign(signatureMessage(context),secretKey,options))};
}
export const HS2_LENGTHS=Object.freeze({...slh.lengths});
