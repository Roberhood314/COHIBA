// Restore only into an explicitly selected empty, separate PostgreSQL database.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {PohaDatabase} from '../lib/poha-postgres.mjs';
const [file]=process.argv.slice(2),target=process.env.HS_RESTORE_DATABASE_URL;
if(!file||!target)throw Error('BACKUP_FILE_AND_HS_RESTORE_DATABASE_URL_REQUIRED');
const targetUrl=new URL(target),source=process.env.HUMAN_SIGNAL_DATABASE_URL;
if(source){const a=new URL(source);if(a.hostname===targetUrl.hostname&&a.port===targetUrl.port&&a.pathname===targetUrl.pathname)throw Error('RESTORE_TARGET_IS_SOURCE');}
const input=JSON.parse(fs.readFileSync(file));
let backup=input;
if(input.payload){if(crypto.createHash('sha256').update(input.payload).digest('hex')!==input.sha256)throw Error('BACKUP_HASH_MISMATCH');backup=JSON.parse(input.payload);}
if(backup.version==='HS_BACKUP_BUNDLE_V1')backup=backup.postgres;
const db=new PohaDatabase({connectionString:target});
try{
 await db.initialize();await db.restoreBackup(backup);
 const restored=await db.exportBackup();assert.deepEqual(JSON.parse(JSON.stringify(restored.tables)),JSON.parse(JSON.stringify(backup.tables)));
 const evidence={version:'HS_RESTORE_DRILL_V1',completedAt:new Date().toISOString(),tablesMatch:true,revokedRecords:backup.tables.hs_delegations.filter(r=>r.document.revokedAt).length+backup.tables.hs_agents.filter(r=>r.document.revokedAt).length+backup.tables.hs_principals.filter(r=>r.document.revokedAt).length,actionNonces:backup.tables.hs_actions.length,serviceNonces:backup.tables.hs_service_nonces.length,approvalNonces:backup.tables.hs_approvals.length};
 // Attempt duplicate writes in rolled-back transactions: replay constraints must survive restore.
 for(const [table,keys] of [['hs_actions',['digest','principal_id','signer_key','nonce','receipt']],['hs_service_nonces',['service_id','nonce','expires_at']],['hs_approvals',['principal_id','nonce','action_digest']]]){
  const row=backup.tables[table][0];if(!row)continue;
  await assert.rejects(db.transaction('restore-drill',c=>c.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>row[k]))),e=>e.code==='23505');
 }
 console.log(JSON.stringify({...evidence,replayConstraintsVerified:true,coverage:backup.tables.hs_actions.length?'POPULATED_LEDGER':'EMPTY_LEDGER_NOT_FULL_EXERCISE'},null,2));
}finally{await db.close();}
