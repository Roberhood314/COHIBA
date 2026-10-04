import fs from 'node:fs';
import crypto from 'node:crypto';
import {PohaDatabase} from '../lib/poha-postgres.mjs';
const [mode,file]=process.argv.slice(2);if(!['backup','restore'].includes(mode)||!file)throw Error('Usage: postgres-backup.mjs backup|restore file');
const db=new PohaDatabase({connectionString:process.env.HUMAN_SIGNAL_DATABASE_URL});
try{
 await db.initialize();
 if(mode==='backup'){
  const payload=JSON.stringify(await db.exportBackup());const sha256=crypto.createHash('sha256').update(payload).digest('hex');fs.writeFileSync(file,JSON.stringify({sha256,payload}),{mode:0o600,flag:'wx'});console.log('PostgreSQL backup completed.');
 }else{
  const {sha256,payload}=JSON.parse(fs.readFileSync(file));if(crypto.createHash('sha256').update(payload).digest('hex')!==sha256)throw Error('BACKUP_HASH_MISMATCH');await db.restoreBackup(JSON.parse(payload));console.log('Restored into empty database.');
 }
}finally{await db.close();}
