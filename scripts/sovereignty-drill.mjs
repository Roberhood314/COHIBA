import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {hashObject} from '../lib/human-signal-core.mjs';
import {createAuthorityEnvelope,commitProtectedAction} from '../lib/human-signal-core-v1-alpha.mjs';
import {signSovereignStatement,verifySovereignQuorum} from '../lib/sovereign-quorum.mjs';
import {prepareContinuityCheckpoint,restoreContinuityCheckpoint} from '../lib/sovereign-continuity.mjs';

const now=new Date(),signers=Array.from({length:4},(_,i)=>({id:'synthetic-si-'+i,...crypto.generateKeyPairSync('ed25519')}));
const committee={faults:1,threshold:3,nodes:signers.map(s=>({id:s.id,publicKey:s.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}))};
const store={},envelope=createAuthorityEnvelope({rootId:'HUMAN-ABCDEF123456',subject:'synthetic-agent',actions:['APP_REGISTER'],effects:['APP_REGISTRY_WRITE'],expiresAt:new Date(now.getTime()+60000).toISOString(),nonce:'synthetic-once'});
const request={envelope,action:'APP_REGISTER',subject:envelope.subject,now};
assert.equal(commitProtectedAction(store,request).verdict,'ALLOW');
const checkpoint=prepareContinuityCheckpoint(store,{network:'LOCAL_RESEARCH_ONLY',sequence:1,policyHash:hashObject({localResearch:true}),now});
checkpoint.votes=signers.slice(1).map(s=>signSovereignStatement(checkpoint.statement,s)); // signer 0 unavailable
assert.equal(verifySovereignQuorum(checkpoint.votes,{committee,expected:checkpoint.statement,now}).accepted,true);
const recovered={};restoreContinuityCheckpoint(recovered,checkpoint,{committee,expected:checkpoint.statement,minimumSequence:1,now});
assert.equal(commitProtectedAction(recovered,request).reason,'RECOVERY_FENCED');
assert.deepEqual(recovered.hsAuthorityState.usedNonces,['synthetic-once']);
console.log(JSON.stringify({version:'HS_SI_DRILL_V1_ALPHA',ok:true,environment:'LOCAL_SYNTHETIC_KEYS',independentOperators:false,oneSignerUnavailable:true,quorum:'3_OF_4',ledgerRestored:true,noncePreserved:true,restoredEpoch:recovered.hsAuthorityState.epoch,executionFenced:true,byzantineConsensus:false,productionFailoverVerified:false},null,2));
