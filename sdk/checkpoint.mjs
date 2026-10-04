import crypto from 'node:crypto';
const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'):JSON.stringify(v);
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
const domainNames=['identities','trustEdges','contributions','agents','delegations','principals','authorizations'];
export function checkpointBytes(s){
 if(s.version!=='HS_TRUST_STATE_V1'||s.economicStateIncluded!==false||!s.domains||Object.keys(s.domains).length!==7||domainNames.some(k=>!Object.hasOwn(s.domains,k)||!/^[a-f0-9]{64}$/.test(s.domains[k]))||hash({version:s.version,domains:s.domains})!==s.stateRoot||!Number.isFinite(Date.parse(s.createdAt))||new Date(s.createdAt).toISOString()!==s.createdAt||typeof s.issuer!=='string'||new URL(s.issuer).origin!==s.issuer||!s.issuer.startsWith('https://'))throw Error('INVALID_CHECKPOINT');
 return Buffer.from('HS/1/CHECKPOINT\n'+canonical({version:s.version,economicStateIncluded:false,domains:s.domains,stateRoot:s.stateRoot,createdAt:s.createdAt,issuer:s.issuer}));
}
export function verifyCheckpoint(s,{publicKey,issuer}){
 try{
  if(s.issuer!==issuer||s.signature?.algorithm!=='Ed25519'||s.signature.publicKey!==publicKey)return false;
  const raw=Buffer.from(publicKey,'base64'),sig=Buffer.from(s.signature.value,'base64');if(raw.length!==32||raw.toString('base64')!==publicKey||sig.length!==64||sig.toString('base64')!==s.signature.value)return false;
  const key=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
  return crypto.verify(null,checkpointBytes(s),key,sig);
 }catch{return false;}
}
