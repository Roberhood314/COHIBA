import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createAgent,digest,signingBytes,timing} from '../web/public/poha-browser.mjs';
import {proofDigest,signingBytes as coreBytes} from '../lib/poha-v1.mjs';
test('non-extractable browser agent signs the exact Node protocol bytes',async()=>{
 const agent=await createAgent();const payload={...timing(),principalId:'HUMAN-AAAAAAAAAAAA',audience:'https://draft.example',performer:'AGENT',signerKey:agent.publicKey,delegationId:'DELEGATION-'+'a'.repeat(64),action:'DRAFT_APP_ACTION',resource:'draft:browser',payloadHash:await digest(new TextEncoder().encode('Nội dung'))};
 assert.deepEqual(Buffer.from(signingBytes('ACTION',payload)),coreBytes('ACTION',payload));
 assert.equal(await digest(signingBytes('ACTION',payload)),proofDigest('ACTION',payload));
 const key=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(agent.publicKey,'base64')]),format:'der',type:'spki'});
 const signature=Buffer.from(await agent.sign('ACTION',payload),'base64');assert.equal(crypto.verify(null,coreBytes('ACTION',payload),key,signature),true);
 assert.equal(crypto.verify(null,coreBytes('ACTION',{...payload,resource:'draft:changed'}),key,signature),false);
 assert.equal(Object.hasOwn(agent,'privateKey'),false);
});
