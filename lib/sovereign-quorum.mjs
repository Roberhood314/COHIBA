import crypto from 'node:crypto';
import {hashObject} from './human-signal-core.mjs';

export const QUORUM_VERSION='HS_SOVEREIGN_QUORUM_V1_ALPHA';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bytes=p=>Buffer.from('HS/SOVEREIGN/V1\n'+hashObject(p));
const keyBytes=x=>{const b=Buffer.from(x||'','base64');if(b.length!==32||b.toString('base64')!==x)throw Error('INVALID_NODE_KEY');return b;};
function key(x){return crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),keyBytes(x)]),format:'der',type:'spki'});}
function validStatement(p){
 if(!p||Object.keys(p).sort().join(',')!==['version','kind','network','epoch','sequence','stateRoot','policyHash','intentHash','issuedAt','expiresAt'].sort().join(',')||p.version!==QUORUM_VERSION||!['AUTHORITY_DECISION','CHECKPOINT'].includes(p.kind)||typeof p.network!=='string'||!p.network.length||p.network.length>128||!Number.isSafeInteger(p.epoch)||p.epoch<0||!Number.isSafeInteger(p.sequence)||p.sequence<0||![p.stateRoot,p.policyHash,p.intentHash].every(hex)||![p.issuedAt,p.expiresAt].every(x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x)||Date.parse(p.expiresAt)<=Date.parse(p.issuedAt)||Date.parse(p.expiresAt)-Date.parse(p.issuedAt)>60000)throw Error('INVALID_QUORUM_STATEMENT');
}
export function validateCommittee(c){
 if(!c||Object.keys(c).sort().join(',')!=='faults,nodes,threshold'||!Number.isSafeInteger(c.faults)||c.faults<0||!Array.isArray(c.nodes)||c.nodes.length!==3*c.faults+1||c.threshold!==2*c.faults+1||new Set(c.nodes.map(n=>n.id)).size!==c.nodes.length||new Set(c.nodes.map(n=>n.publicKey)).size!==c.nodes.length)throw Error('INVALID_COMMITTEE');
 for(const n of c.nodes){if(typeof n.id!=='string'||!n.id.length||n.id.length>128||Object.keys(n).sort().join(',')!=='id,publicKey')throw Error('INVALID_COMMITTEE');keyBytes(n.publicKey);}
 return c;
}
export function signSovereignStatement(statement,{id,privateKey}){
 validStatement(statement);
 return {nodeId:id,statement:structuredClone(statement),signature:crypto.sign(null,bytes(statement),privateKey).toString('base64')};
}
// This validates signatures over one pinned snapshot. It is not a consensus engine.
export function verifySovereignQuorum(votes,{committee,expected,now=new Date()}){
 const denied=reason=>({accepted:false,reason,executionAuthorized:false});
 try{
  validateCommittee(committee);validStatement(expected);
  if(!Number.isFinite(now.getTime())||Date.parse(expected.issuedAt)>now.getTime()||Date.parse(expected.expiresAt)<=now.getTime())return denied('STALE_QUORUM');
  if(!Array.isArray(votes)||votes.length>committee.nodes.length)return denied('INVALID_VOTES');
  const seen=new Set();const digest=hashObject(expected);
  for(const vote of votes){
   if(!vote||seen.has(vote.nodeId))return denied('DUPLICATE_NODE');
   const node=committee.nodes.find(n=>n.id===vote.nodeId);if(!node)return denied('UNTRUSTED_NODE');
   if(hashObject(vote.statement)!==digest)return denied('DIVERGENT_STATE');
   const sig=Buffer.from(vote.signature||'','base64');
   if(sig.length!==64||sig.toString('base64')!==vote.signature||!crypto.verify(null,bytes(expected),key(node.publicKey),sig))return denied('INVALID_NODE_SIGNATURE');
   seen.add(node.id);
  }
  if(seen.size<committee.threshold)return denied('QUORUM_UNAVAILABLE');
  return {accepted:true,executionAuthorized:false,statementHash:digest,signers:[...seen].sort(),committeeHash:hashObject(committee),kind:expected.kind};
 }catch{return denied('INVALID_QUORUM');}
}
