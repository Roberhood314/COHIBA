import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson,writeJson,backupJsonDirectory,restoreJsonDirectory} from '../lib/durable-json.mjs';
import {trustStateRoot} from '../lib/human-signal-core.mjs';
test('storage rejects stale snapshots and corruption; backup restore verifies hashes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hs-store-'));
 try{
  const file=path.join(dir,'state.json');writeJson(file,{records:[]});
  const a=readJson(file,{}),b=readJson(file,{});a.records.push('first');writeJson(file,a);
  b.records.push('lost');assert.throws(()=>writeJson(file,b),/STORAGE_WRITE_CONFLICT/);
  const backup=path.join(dir,'snapshot');assert.equal(backupJsonDirectory(dir,backup),1);
  const restored=path.join(dir,'restored');restoreJsonDirectory(backup,restored);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored,'state.json'))),{records:['first']});
  fs.writeFileSync(path.join(backup,'state.json'),'{}');assert.throws(()=>restoreJsonDirectory(backup,path.join(dir,'badrestore')),/BACKUP_HASH_MISMATCH/);
  fs.writeFileSync(file,'broken');assert.throws(()=>writeJson(file,readJson(file,{records:[]})),/STORAGE_UNAVAILABLE/);assert.equal(fs.readFileSync(file,'utf8'),'broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('trust root ignores economics and commits human verification, keys and revocation',()=>{
 const s={profiles:[{id:'HUMAN-AAAAAAAAAAAA',wallet:'key',signalPoints:1,pendingCoh:2,streak:3,humanProofs:{phone:{verified:false,identityHash:'hash'}}}],events:[]};
 const before=trustStateRoot(s).stateRoot;s.profiles[0].signalPoints=100000;s.profiles[0].pendingCoh=999;s.profiles[0].streak=999;s.events.push({type:'MINING_CLAIMED',eventHash:'economic'});assert.equal(trustStateRoot(s).stateRoot,before);
 s.profiles[0].humanProofs.phone.verified=true;const verified=trustStateRoot(s).stateRoot;assert.notEqual(verified,before);
 s.profiles[0].humanProofs.phone.revokedAt='2026-10-04';assert.notEqual(trustStateRoot(s).stateRoot,verified);
});
