import crypto from 'node:crypto';
import {inspectAuthority,proofDigest,statusBytes,STATUS_VERSION} from './index.mjs';
// resolveSnapshot is a trusted operator adapter, never client-controlled claims.
export function createAuthorityIssuer({issuer,keyId,privateKey,signer,resolveSnapshot,allowedAudiences,ttlMs=10000,signingTimeoutMs=5000}){
 if(!Number.isInteger(signingTimeoutMs)||signingTimeoutMs<1||signingTimeoutMs>30000)throw Error('INVALID_ISSUER_CONFIG');
 if(Boolean(privateKey)===Boolean(signer)||privateKey&&privateKey.asymmetricKeyType!=='ed25519'||signer&&(typeof signer.sign!=='function'||typeof signer.publicKey!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(signer.publicKey)||Buffer.from(signer.publicKey,'base64').toString('base64')!==signer.publicKey)||typeof resolveSnapshot!=='function'||!Array.isArray(allowedAudiences)||!allowedAudiences.length||allowedAudiences.some(a=>typeof a!=='string'||!a.startsWith('https://'))||!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>30000||typeof keyId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId))throw Error('INVALID_ISSUER_CONFIG');
 const publicKey=signer?signer.publicKey:crypto.createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 // Capture operator configuration; no client-controlled signer, key discovery or fallback.
 const sign=signer?signer.sign.bind(signer):bytes=>crypto.sign(null,bytes,privateKey).toString('base64');
 allowedAudiences=[...allowedAudiences];
 return {async issue({proof,challenge,audience}){
  proof=structuredClone(proof);
  if(!allowedAudiences.includes(audience)||proof?.payload?.audience!==audience)throw Error('ISSUER_AUDIENCE_DENIED');
  const digest=proofDigest('ACTION',proof.payload);
  // Snapshot must cover principal key/epoch, Human assurance and record revocation atomically.
  const raw=await resolveSnapshot(proof.payload.principalId,{performer:proof.payload.performer,delegationId:proof.payload.delegationId,audience});if(!raw)throw Error('ISSUER_SUBJECT_UNAVAILABLE');
  const snapshot=structuredClone(raw),now=Date.now(),binding=snapshot.binding,delegation=snapshot.delegation;
  if(snapshot.principalId!==proof.payload.principalId||typeof snapshot.principalRevoked!=='boolean'||proof.payload.performer==='AGENT'&&(typeof snapshot.bindingRevoked!=='boolean'||typeof snapshot.delegationRevoked!=='boolean'))throw Error('INCOMPLETE_AUTHORITY_SNAPSHOT');
  const records=proof.payload.performer==='HUMAN'?[]:[{id:binding?.id,revoked:snapshot.bindingRevoked===true},{id:delegation?.id,revoked:snapshot.delegationRevoked===true}].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const payload={version:STATUS_VERSION,issuer,audience,challenge,actionDigest:digest,principalId:proof.payload.principalId,principalKey:snapshot.principalKey,identityAssurance:snapshot.identityAssurance,assuranceExpiresAt:snapshot.assuranceExpiresAt,credentialEpoch:snapshot.credentialEpoch,principalRevoked:snapshot.principalRevoked===true,records,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+ttlMs).toISOString()};
  let signature;
  let timer;
  try{signature=await Promise.race([Promise.resolve().then(()=>sign(Buffer.from(statusBytes(payload)))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SIGN_TIMEOUT')),signingTimeoutMs);})]);}catch{throw Error('ISSUER_SIGNER_UNAVAILABLE');}finally{clearTimeout(timer);}
  const status={payload,signature,keyId};
  const trust={[issuer]:{acceptedAssurances:['PHONE_VERIFIED'],keys:[{id:keyId,publicKey,notBefore:new Date(now-1).toISOString(),notAfter:new Date(now+ttlMs+1).toISOString(),revoked:false}]}};
  const result=inspectAuthority({proof,binding,delegation,status,trust,expected:{audience,challenge,action:proof.payload.action,resource:proof.payload.resource,payloadHash:proof.payload.payloadHash,requireApproval:false},now:Date.now()});
  if(result.decision==='DENY')throw Error('ISSUER_AUTHORITY_DENIED');
  // No raw identity evidence or private subject attributes are returned.
  return {proof,binding:binding||null,delegation:delegation||null,status};
 }};
}
