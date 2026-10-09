// All fixture secrets are PUBLIC synthetic keys. Never enroll them in real policy.
import crypto from 'node:crypto';
import {slh_dsa_sha2_128f as slh} from '@noble/post-quantum/slh-dsa.js';
import {fixture} from '../independent-verifier/fixture.mjs';
import {signatureContexts,HS2_VERSION,HS2_SUITE} from '../../packages/hs2-verifier/index.mjs';
import {encode64,signAttestation} from '../../packages/hs2-verifier/wire.mjs';
import {signProof} from '../../sdk/human-signal-node.mjs';
import {proofDigest} from '../../packages/authority-verifier/index.mjs';
export function hybridFixture({now=Date.now(),performer='AGENT',approvalRequired=true,approve=true,unique=false}={}){
 const f=fixture({now,performer,approvalRequired,approve});
 if(unique){
  const issuer='hs2-'+crypto.randomBytes(12).toString('hex');f.bundle.trust[issuer]=f.bundle.trust['synthetic-issuer'];delete f.bundle.trust['synthetic-issuer'];f.bundle.status.payload.issuer=issuer;
  const a=f.bundle.proof.payload;a.nonce=crypto.randomBytes(24).toString('base64url');f.bundle.proof.signature=signProof('ACTION',a,performer==='HUMAN'?f.keys.human:f.keys.agent);
  if(f.bundle.proof.approval){const q=f.bundle.proof.approval.payload;q.nonce=crypto.randomBytes(24).toString('base64url');q.actionDigest=proofDigest('ACTION',a);f.bundle.proof.approval.signature=signProof('APPROVAL',q,f.keys.human);}
  f.bundle.expected.challenge=crypto.randomBytes(24).toString('base64url');f.bundle.status.payload.challenge=f.bundle.expected.challenge;f.resignStatus();
 }
 const {proof,binding,delegation,status}=f.bundle,bundle={proof,binding,delegation,status};
 const keyRegistry={},keys={},attestations={},contexts=signatureContexts(bundle);
 const issuerKey=f.bundle.trust[status.payload.issuer].publicKey;
 const roles=new Map([[binding.payload.principalKey,'owner'],[binding.payload.agentKey,'agent'],[issuerKey,'issuer']]);
 for(const [ed25519Key,id] of roles){
  const pair=slh.keygen(crypto.createHash('sha384').update('PUBLIC HS2 SYNTHETIC KEY '+id).digest());keys[id]=pair;
  keyRegistry[id]={ed25519Key,slhDsaKey:encode64(pair.publicKey),notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2030-01-01T00:00:00.000Z',revoked:false};
 }
 for(const c of contexts){const edPublicKey=c.edPublicKey||issuerKey,keyId=roles.get(edPublicKey);attestations[c.id]=signAttestation({...c,edPublicKey,keyId},keys[keyId].secretKey,{extraEntropy:false});}
 return {input:{version:HS2_VERSION,suite:HS2_SUITE,bundle,attestations},options:{trust:f.bundle.trust,expected:f.bundle.expected,keyRegistry},contexts,keys,f};
}
