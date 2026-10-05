import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from '../examples/independent-verifier/fixture.mjs';
import {createAuthorityIssuer} from '../packages/authority-verifier/issuer.mjs';
const publicKeyBase64=key=>crypto.createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64');

function config(f,signer){return {issuer:'external-issuer',keyId:'kms-version-1',signer,allowedAudiences:[f.bundle.expected.audience],resolveSnapshot:async()=>({...f.context,assuranceExpiresAt:new Date(Date.now()+60000).toISOString(),credentialEpoch:1,principalRevoked:false,binding:f.bundle.binding,delegation:f.bundle.delegation,bindingRevoked:false,delegationRevoked:false})};}
function request(f){return {proof:f.bundle.proof,challenge:f.bundle.expected.challenge,audience:f.bundle.expected.audience};}
test('operator signing provider signs exact bytes without exporting private key',async()=>{
 const f=fixture();let calls=0;
 const signer={publicKey:publicKeyBase64(f.keys.issuer),async sign(bytes){calls++;assert.ok(Buffer.isBuffer(bytes));assert.ok(bytes.toString().startsWith('HS/EXPERIMENTAL/AUTHORITY_STATUS/1\n'));return crypto.sign(null,bytes,f.keys.issuer).toString('base64');}};
 const c=config(f,signer),issuer=createAuthorityIssuer(c);c.allowedAudiences.push('https://unapproved.example');
 const bundle=await issuer.issue(request(f));assert.equal(calls,1);assert.equal(bundle.status.keyId,'kms-version-1');
 await assert.rejects(issuer.issue({...request(f),audience:'https://unapproved.example'}),/ISSUER_AUDIENCE_DENIED/);
});
test('wrong signatures, unavailable providers and stale asynchronous signatures fail closed',async()=>{
 const f=fixture(),publicKey=publicKeyBase64(f.keys.issuer);
 assert.throws(()=>createAuthorityIssuer({...config(f,{publicKey,sign:()=>''}),privateKey:f.keys.issuer}),/INVALID_ISSUER_CONFIG/);
 for(const sign of [()=>'',()=>crypto.randomBytes(64).toString('base64'),()=>crypto.sign(null,Buffer.from('wrong domain'),f.keys.issuer).toString('base64')])await assert.rejects(createAuthorityIssuer(config(f,{publicKey,sign})).issue(request(f)),/ISSUER_AUTHORITY_DENIED/);
 await assert.rejects(createAuthorityIssuer(config(f,{publicKey,sign(){throw Error('secret provider diagnostic');}})).issue(request(f)),/^Error: ISSUER_SIGNER_UNAVAILABLE$/);
 await assert.rejects(createAuthorityIssuer({...config(f,{publicKey,sign:()=>new Promise(()=>{})}),signingTimeoutMs:5}).issue(request(f)),/^Error: ISSUER_SIGNER_UNAVAILABLE$/);
 await assert.rejects(createAuthorityIssuer({...config(f,{publicKey,async sign(bytes){await new Promise(r=>setTimeout(r,25));return crypto.sign(null,bytes,f.keys.issuer).toString('base64');}}),ttlMs:1}).issue(request(f)),/ISSUER_AUTHORITY_DENIED/);
});
