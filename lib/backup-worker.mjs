import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
export class BackupWorker{
 constructor({directory,database,bucket,endpoint,region='auto',accessKeyId,secretAccessKey,client,excludeFiles=[]}){
  this.excludeFiles=new Set(excludeFiles);this.directory=directory;this.database=database;this.bucket=bucket;this.client=client||new S3Client({endpoint,region,forcePathStyle:false,credentials:{accessKeyId,secretAccessKey}});this.status={enabled:true,lastSuccess:null,lastError:null};this.running=false;
 }
 async run(){
  if(this.running)return;this.running=true;
  try{
   const files={};for(const name of (await fs.readdir(this.directory)).filter(n=>!this.excludeFiles.has(n)&&n.endsWith('.json')&&!n.includes('secret')&&!n.includes('keypair')).sort()){
    const text=await fs.readFile(path.join(this.directory,name),'utf8');JSON.parse(text);files[name]=text;
   }
   const postgres=await this.database.exportBackup();
   const body=JSON.stringify({version:'HS_BACKUP_BUNDLE_V1',createdAt:new Date().toISOString(),files,postgres});
   const sha=crypto.createHash('sha256').update(body).digest('hex'),key='human-signal/'+new Date().toISOString().replace(/:/g,'-')+'.json';
   await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:body,ContentType:'application/json',Metadata:{sha256:sha}}));
   // Verify stored bytes before recording success; private bucket, no public URL.
   const restored=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
   const bytes=await restored.Body.transformToByteArray();if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('BACKUP_READBACK_HASH_MISMATCH');
   this.status={enabled:true,lastSuccess:new Date().toISOString(),lastError:null,key};
  }catch{this.status.lastError='BACKUP_FAILED';}finally{this.running=false;}
 }
 start(){this.run();this.timer=setInterval(()=>this.run(),6*60*60*1000);this.timer.unref();}
 stop(){clearInterval(this.timer);}
}
