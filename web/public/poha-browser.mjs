// Shared browser signing format. Private agent keys are non-extractable and tab-local.
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const base64=bytes=>btoa(String.fromCharCode(...bytes));
export const signingBytes=(kind,payload)=>new TextEncoder().encode('HS/1/'+kind+'\n'+canonical(payload));
export async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export const nonce=()=>base64(crypto.getRandomValues(new Uint8Array(24))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const timing=(lifetime=60000)=>({version:'1',nonce:nonce(),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+lifetime).toISOString()});
export async function createAgent(){
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']);
 const publicKey=base64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)));
 return {publicKey,sign:async(kind,payload)=>base64(new Uint8Array(await crypto.subtle.sign('Ed25519',pair.privateKey,signingBytes(kind,payload))))};
}
