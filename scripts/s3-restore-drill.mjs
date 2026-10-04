import pg from 'pg';
import {nativeRecoveryExercise} from './native-recovery-exercise.mjs';
// Runs in an isolated Railway drill service; does not modify source database or bucket.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {S3Client,ListObjectsV2Command,GetObjectCommand} from '@aws-sdk/client-s3';
if(!process.env.HS_RESTORE_DATABASE_URL)throw Error('ISOLATED_RESTORE_DATABASE_REQUIRED');
const client=new S3Client({endpoint:process.env.HS_BACKUP_ENDPOINT,region:process.env.HS_BACKUP_REGION||'auto',credentials:{accessKeyId:process.env.HS_BACKUP_ACCESS_KEY,secretAccessKey:process.env.HS_BACKUP_SECRET_KEY}});
let objects=[],token;
for(let i=0;i<20;i++){
 const r=await client.send(new ListObjectsV2Command({Bucket:process.env.HS_BACKUP_BUCKET,Prefix:'human-signal/',ContinuationToken:token}));objects.push(...(r.Contents||[]));if(!r.IsTruncated){token=null;break;}token=r.NextContinuationToken;
}
if(token)throw Error('BACKUP_LIST_INCOMPLETE');
objects=objects.filter(o=>o.Key.endsWith('.json')).sort((a,b)=>b.LastModified-a.LastModified);
if(!objects.length)throw Error('BACKUP_NOT_FOUND');
const r=await client.send(new GetObjectCommand({Bucket:process.env.HS_BACKUP_BUCKET,Key:objects[0].Key})),bytes=Buffer.from(await r.Body.transformToByteArray());
if(!r.Metadata?.sha256||crypto.createHash('sha256').update(bytes).digest('hex')!==r.Metadata.sha256)throw Error('BACKUP_HASH_MISMATCH');
const admin=new pg.Pool({connectionString:process.env.HS_RESTORE_DATABASE_URL}),databaseName='hs_snapshot_'+crypto.randomBytes(6).toString('hex');
await admin.query('CREATE DATABASE '+databaseName);const isolatedUrl=new URL(process.env.HS_RESTORE_DATABASE_URL);isolatedUrl.pathname='/'+databaseName;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hs-private-drill-')),file=path.join(dir,'backup.json');
try{
 fs.writeFileSync(file,bytes,{mode:0o600});
 const result=spawnSync(process.execPath,[new URL('./restore-verification.mjs',import.meta.url).pathname,file],{encoding:'utf8',timeout:120000,env:{...process.env,HS_RESTORE_DATABASE_URL:isolatedUrl.toString()}});
 if(result.status!==0){console.error('HS_PRODUCTION_RESTORE_DRILL_FAILED');process.exitCode=1;}else{console.log('HS_PRODUCTION_RESTORE_DRILL_PASSED');console.log(result.stdout);await nativeRecoveryExercise();}
}finally{fs.rmSync(dir,{recursive:true,force:true});await admin.query('DROP DATABASE '+databaseName);await admin.end();}
