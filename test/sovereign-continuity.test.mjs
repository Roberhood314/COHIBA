import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {hashObject} from '../lib/human-signal-core.mjs';
import {inferSovereignty,inferVerifiedPoha} from '../lib/sovereignty-inference.mjs';
import {createAuthorityEnvelope,commitProtectedAction,commitQuorumProtectedAction,verifyProtectedAction,revokeAuthorityRoot} from '../lib/human-signal-core-v1-alpha.mjs';
import {QUORUM_VERSION,signSovereignStatement,verifySovereignQuorum,validateCommittee} from '../lib/sovereign-quorum.mjs';
import {prepareContinuityCheckpoint,restoreContinuityCheckpoint} from '../lib/sovereign-continuity.mjs';

const now=new Date('2026-10-05T04:00:00Z');
const env=(nonce='one')=>createAuthorityEnvelope({rootId:'HUMAN-ABCDEF123456',subject:'agent',actions:['APP_REGISTER'],effects:['APP_REGISTRY_WRITE'],budget:3,nonce,expiresAt:new Date(now.getTime()+120000).toISOString()});
const input=envelope=>({envelope,action:'APP_REGISTER',subject:'agent',now,receiptData:{app:'one'}});
function fixture(){
 const signers=Array.from({length:4},(_,i)=>({id:'si-'+i,...crypto.generateKeyPairSync('ed25519')}));
 const committee={faults:1,threshold:3,nodes:signers.map(s=>({id:s.id,publicKey:s.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}))};
 const policyHash=hashObject({scope:'APP_REGISTER'});
 const sign=statement=>signers.slice(0,3).map(s=>signSovereignStatement(statement,s));
 return {committee,signers,policyHash,sign};
}
function statement(){return {version:QUORUM_VERSION,kind:'AUTHORITY_DECISION',network:'test-only',epoch:0,sequence:1,stateRoot:hashObject({}),policyHash:hashObject({}),intentHash:hashObject({intent:1}),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+30000).toISOString()};}

test('SI fails closed on malformed authority, time, budget and recovery',()=>{
 const e=env(),base={...input(e),contract:{effects:['APP_REGISTRY_WRITE']}};
 for(const patch of [{envelope:{...e,expiresAt:'invalid'}},{envelope:{...e,budget:NaN}},{envelope:{...e,actions:null}},{spent:NaN},{now:new Date('invalid')},{now:'invalid'},{envelope:{...e,version:'untrusted'}},{storageRecovered:true},{epoch:1}])assert.equal(inferSovereignty({...base,...patch}).verdict,'DENY');
 assert.equal(inferSovereignty(base).executionAuthorized,false);
 for(const action of ['__proto__','constructor','toString'])assert.equal(commitProtectedAction({}, {...input(e),action}).reason,'UNKNOWN_ACTION');
 assert.equal(commitProtectedAction({},input({...e,expiresAt:'invalid'})).verdict,'DENY');
});

test('signed SI requires verified PoHA and binds service context and credential epoch',()=>{
 const proof={payload:{principalId:'human',audience:'https://service.example',action:'DRAFT_APP_ACTION',resource:'draft:one',payloadHash:hashObject('draft'),expiresAt:new Date(now.getTime()+30000).toISOString()}};
 const expected={...proof.payload},inspection={decision:'ALLOW',signatureValid:true,authorityValid:true,actionDigest:hashObject(proof),policyVersion:'test'};
 const args={proof,expected,credentialEpoch:1,now};
 const good=inferVerifiedPoha(inspection,args);assert.equal(good.verdict,'ALLOW');assert.equal(good.executionAuthorized,false);
 assert.notEqual(good.decisionDigest,inferVerifiedPoha(inspection,{...args,credentialEpoch:2}).decisionDigest);
 assert.equal(inferVerifiedPoha({...inspection,authorityValid:false},args).verdict,'DENY');
 assert.equal(inferVerifiedPoha(inspection,{...args,expected:{...expected,payloadHash:hashObject('tamper')}}).verdict,'DENY');
});

test('quorum accepts one failed node but rejects Sybil, duplicates, forged and split votes',()=>{
 const f=fixture(),p=statement(),votes=f.sign(p),check=v=>verifySovereignQuorum(v,{committee:f.committee,expected:p,now});
 assert.equal(check(votes).accepted,true);assert.equal(check(votes).executionAuthorized,false);
 assert.equal(check(votes.slice(0,2)).reason,'QUORUM_UNAVAILABLE');
 assert.equal(check([votes[0],votes[0],votes[1]]).reason,'DUPLICATE_NODE');
 assert.equal(check([{...votes[0],nodeId:'sybil'},...votes.slice(1)]).reason,'UNTRUSTED_NODE');
 assert.equal(check([{...votes[0],signature:crypto.randomBytes(64).toString('base64')},...votes.slice(1)]).reason,'INVALID_NODE_SIGNATURE');
 const split=signSovereignStatement({...p,stateRoot:hashObject('fork')},f.signers[0]);
 assert.equal(check([split,...votes.slice(1)]).reason,'DIVERGENT_STATE');
 assert.equal(verifySovereignQuorum(votes,{committee:f.committee,expected:p,now:new Date(now.getTime()+30000)}).reason,'STALE_QUORUM');
 assert.throws(()=>validateCommittee({...f.committee,threshold:2}),/INVALID_COMMITTEE/);
 assert.throws(()=>validateCommittee({...f.committee,nodes:f.committee.nodes.map(n=>({...n,publicKey:f.committee.nodes[0].publicKey}))}),/INVALID_COMMITTEE/);
});

test('distributed research gate binds effect bytes and live revocation before commit',()=>{
 const f=fixture(),store={},request=input(env());
 const state={spent:{},revoked:[],usedNonces:[],receipts:[],epoch:0};
 const d=verifyProtectedAction({...request,epoch:0});
 const p={...statement(),stateRoot:hashObject(state),policyHash:f.policyHash,intentHash:hashObject({decisionDigest:d.decisionDigest,dataHash:hashObject(request.receiptData)})};
 const config={...f,network:p.network,sequence:p.sequence,statement:p,votes:f.sign(p)};
 assert.equal(commitQuorumProtectedAction(store,{...request,receiptData:{app:'tampered'}},config).verdict,'DENY');
 assert.equal(commitQuorumProtectedAction(store,request,config).verdict,'ALLOW');
 assert.equal(commitQuorumProtectedAction(store,request,config).verdict,'DENY');
 const fresh={};revokeAuthorityRoot(fresh,request.envelope.rootId);
 assert.equal(commitQuorumProtectedAction(fresh,request,config).reason,'REVOKED');
});

test('continuity restores spent/nonces/revocations, advances epoch and fences execution',()=>{
 const f=fixture(),store={};commitProtectedAction(store,input(env()));revokeAuthorityRoot(store,'another-human');
 const checkpoint=prepareContinuityCheckpoint(store,{network:'test-only',sequence:8,policyHash:f.policyHash,now});
 checkpoint.votes=f.sign(checkpoint.statement);
 const recovered={},options={committee:f.committee,expected:checkpoint.statement,minimumSequence:8,now};
 const r=restoreContinuityCheckpoint(recovered,checkpoint,options);
 assert.equal(r.epoch,1);assert.deepEqual(recovered.hsAuthorityState.usedNonces,['one']);assert.deepEqual(recovered.hsAuthorityState.revoked,['another-human']);
 assert.equal(commitProtectedAction(recovered,input(env('fresh'))).reason,'RECOVERY_FENCED');
 // Even after operator revalidation removes the fence, old envelopes stay invalid.
 recovered.storageRecovered=false;assert.equal(commitProtectedAction(recovered,input(env('fresh'))).reason,'AUTHORITY_EPOCH');
 assert.throws(()=>restoreContinuityCheckpoint(recovered,checkpoint,options),/CHECKPOINT_ROLLBACK/);
});

test('continuity refuses rollback, tamper, missing quorum and corrupt receipts without mutation',()=>{
 const f=fixture(),store={};commitProtectedAction(store,input(env()));
 const old=prepareContinuityCheckpoint(store,{network:'test-only',sequence:5,policyHash:f.policyHash,now});old.votes=f.sign(old.statement);
 const options={committee:f.committee,expected:old.statement,minimumSequence:5,now};
 revokeAuthorityRoot(store,'new-revocation');const before=structuredClone(store);
 assert.throws(()=>restoreContinuityCheckpoint(store,old,options),/CHECKPOINT_ROLLBACK/);assert.deepEqual(store,before);
 assert.throws(()=>restoreContinuityCheckpoint({},old,{...options,minimumSequence:6}),/CHECKPOINT_ROLLBACK/);
 const tampered=structuredClone(old);tampered.snapshot.state.usedNonces=[];
 assert.throws(()=>restoreContinuityCheckpoint({},tampered,options),/CHECKPOINT_INTEGRITY/);
 assert.throws(()=>restoreContinuityCheckpoint({},{...old,votes:old.votes.slice(0,2)},options),/QUORUM_UNAVAILABLE/);
 store.hsAuthorityState.receipts[0].dataHash=hashObject('tamper');assert.throws(()=>prepareContinuityCheckpoint(store,{network:'test-only',sequence:6,policyHash:f.policyHash,now}),/INVALID_AUTHORITY_RECEIPT/);
});

test('failed receipt construction cannot consume an authorized nonce or budget',()=>{
 const store={},request=input(env());const cyclic={};cyclic.self=cyclic;
 assert.equal(commitProtectedAction(store,{...request,receiptData:cyclic}).reason,'INVALID_COMMIT_DATA');
 assert.deepEqual(store.hsAuthorityState.usedNonces,[]);assert.deepEqual(store.hsAuthorityState.spent,{});
 assert.equal(commitProtectedAction(store,request).verdict,'ALLOW');
});
