import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {BackupWorker} from '../lib/backup-worker.mjs';
test('offsite backup success requires exact read-back and invalid JSON fails closed',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hs-backup-'));let body;
 try{
  await fs.writeFile(path.join(directory,'accounts.json'),JSON.stringify({profiles:[]}));
  const worker=new BackupWorker({directory,bucket:'private',database:{exportBackup:async()=>({version:'HS_PG_BACKUP_V1',tables:{}})},client:{send:async command=>{if(command.input.Body){body=command.input.Body;return {};}return {Body:{transformToByteArray:async()=>Buffer.from(body)}};}}});
  await worker.run();assert.ok(worker.status.lastSuccess);assert.equal(worker.status.lastError,null);assert.equal(JSON.parse(body).files['accounts.json'],'{"profiles":[]}');
  await fs.writeFile(path.join(directory,'accounts.json'),'broken');worker.status.lastSuccess=null;await worker.run();assert.equal(worker.status.lastSuccess,null);assert.equal(worker.status.lastError,'BACKUP_FAILED');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
