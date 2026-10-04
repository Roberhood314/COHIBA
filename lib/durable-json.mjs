import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const revision=Symbol('storageRevision');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
export function readJson(file,fallback,validate=()=>true){
  try{
    const exists=fs.existsSync(file),raw=exists?fs.readFileSync(file):null;
    const value=exists?JSON.parse(raw):structuredClone(fallback);
    if(!value || typeof value!=='object' || Array.isArray(value) || !validate(value))throw Error('INVALID_STORE');
    Object.defineProperty(value,revision,{value:raw?digest(raw):null,writable:true});return value;
  }catch{return {...structuredClone(fallback),storageRecovered:true};}
}
export function writeJson(file,value){
  if(value?.storageRecovered)throw Error('STORAGE_UNAVAILABLE');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const old=fs.existsSync(file)?fs.readFileSync(file):null;
  if(old){try{JSON.parse(old);}catch{throw Error('STORAGE_UNAVAILABLE');}}
  if(Object.hasOwn(value,revision) && value[revision]!== (old?digest(old):null))throw Error('STORAGE_WRITE_CONFLICT');
  if(old){
    const backup=path.join(path.dirname(file),'backups');fs.mkdirSync(backup,{recursive:true,mode:0o700});
    const name=path.basename(file)+'.'+Date.now()+'.'+crypto.randomUUID()+'.'+digest(old)+'.bak';
    fs.writeFileSync(path.join(backup,name),old,{mode:0o600,flag:'wx'});
    const versions=fs.readdirSync(backup).filter(n=>n.startsWith(path.basename(file)+'.') && n.endsWith('.bak')).sort();
    for(const name of versions.slice(0,-8))fs.unlinkSync(path.join(backup,name));
  }
  const raw=Buffer.from(JSON.stringify(value,null,2)),tmp=file+'.tmp-'+crypto.randomUUID();
  try{
    const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(tmp,file);
    const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
    if(Object.hasOwn(value,revision))value[revision]=digest(raw);
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
export function backupJsonDirectory(directory,destination){
  if(fs.existsSync(destination))throw Error('BACKUP_DESTINATION_EXISTS');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});const entries=[];
  for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.json')).sort()){
    const raw=fs.readFileSync(path.join(directory,name));JSON.parse(raw);
    fs.writeFileSync(path.join(destination,name),raw,{mode:0o600});entries.push({name,sha256:digest(raw),bytes:raw.length});
  }
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({version:'1',createdAt:new Date().toISOString(),entries},null,2),{mode:0o600});return entries.length;
}
export function restoreJsonDirectory(source,destination){
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
  if(manifest.version!=='1' || !Array.isArray(manifest.entries))throw Error('INVALID_BACKUP');
  const contents=manifest.entries.map(e=>{
    if(path.basename(e.name)!==e.name || !e.name.endsWith('.json') || e.name==='manifest.json')throw Error('INVALID_BACKUP_PATH');
    const raw=fs.readFileSync(path.join(source,e.name));if(digest(raw)!==e.sha256 || raw.length!==e.bytes)throw Error('BACKUP_HASH_MISMATCH');JSON.parse(raw);return {name:e.name,raw};
  });
  if(fs.existsSync(destination) && fs.readdirSync(destination).length)throw Error('RESTORE_DESTINATION_NOT_EMPTY');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});for(const e of contents)fs.writeFileSync(path.join(destination,e.name),e.raw,{mode:0o600});return contents.length;
}
