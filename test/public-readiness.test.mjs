import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {loadCheckpointSigner} from '../lib/checkpoint-signing.mjs';
import {verifyCheckpoint} from '../sdk/checkpoint.mjs';
import {trustStateRoot} from '../lib/human-signal-core.mjs';
import {DatabaseRateLimiter} from '../lib/distributed-rate-limit.mjs';
import {publicKeyBase64} from '../sdk/human-signal-node.mjs';
test('checkpoint signature pins issuer and key, detects altered trust domains, persists through restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hs-checkpoint-'));
 try{const file=path.join(dir,'checkpoint.secret.pem'),signer=loadCheckpointSigner(file),issuer='https://cohibameme.site';
 const s=signer.sign({...trustStateRoot({}),createdAt:new Date().toISOString(),issuer,anchoredOnSolana:false});
 assert.equal(verifyCheckpoint(s,{issuer,publicKey:signer.publicKey}),true);
 assert.equal(loadCheckpointSigner(file).publicKey,signer.publicKey);
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.equal(verifyCheckpoint({...s,createdAt:new Date(0).toISOString()},{issuer,publicKey:signer.publicKey}),false);
 assert.equal(verifyCheckpoint({...s,domains:{...s.domains,identities:'a'.repeat(64)}},{issuer,publicKey:signer.publicKey}),false);
 assert.equal(verifyCheckpoint(s,{issuer:'https://evil.example',publicKey:signer.publicKey}),false);
 assert.equal(verifyCheckpoint(s,{issuer,publicKey:publicKeyBase64(crypto.generateKeyPairSync('ed25519').privateKey)}),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('database rate limiter shares counters across workers and denies database failures',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE hs_rate_windows(key text,window_id bigint,count integer,PRIMARY KEY(key,window_id));');
 const a=new DatabaseRateLimiter(db,{limit:3}),b=new DatabaseRateLimiter(db,{limit:3});
 assert.equal(await a.allow('test-client'),true);assert.equal(await b.allow('test-client'),true);assert.equal(await a.allow('test-client'),true);assert.equal(await b.allow('test-client'),false);assert.equal(await b.allow('another-client'),true);
 const rows=await db.query('SELECT key FROM hs_rate_windows');assert.ok(rows.rows.every(r=>/^[a-f0-9]{64}$/.test(r.key)));
 await assert.rejects(new DatabaseRateLimiter({query:()=>Promise.reject(Error('offline'))}).allow('client'),/offline/);
 }finally{await db.close();}
});
