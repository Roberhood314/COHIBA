import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'open-review/si/manifest.json'),'utf8'));
const args=process.argv.slice(2);
if(args.some(a=>!a.startsWith('--output='))||args.length>1)throw Error('Usage: npm run review:si -- [--output=/path/to/new-directory]');
if(!/^24\./.test(process.versions.node)||Number(process.versions.node.split('.')[1])<15)throw Error('Node 24.15+ (below 25) is required');
if(!/^[0-9a-f]{40}$/.test(manifest.commit)||manifest.repository!=='https://github.com/Roberhood314/COHIBA.git')throw Error('Invalid review target');
const output=path.resolve(args[0]?.slice('--output='.length)||path.join(root,'operations/evidence/independent-review',`${Date.now()}-${crypto.randomBytes(4).toString('hex')}`));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(output); // Never overwrite an existing report.
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'cohiba-review-'));
// Do not inherit wallet, service, database or issuer credentials. Git/npm may use
// the user's normal configured network access; this is a local runner, not a sandbox.
const env=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','SystemRoot','HTTPS_PROXY','HTTP_PROXY','NO_PROXY','https_proxy','http_proxy','no_proxy','ALL_PROXY','all_proxy','NPM_CONFIG_PROXY','NPM_CONFIG_HTTPS_PROXY','NPM_CONFIG_HTTP_PROXY','npm_config_proxy','npm_config_https_proxy','npm_config_http_proxy','NODE_EXTRA_CA_CERTS','NODE_USE_SYSTEM_CA','SSL_CERT_FILE','SSL_CERT_DIR','NPM_CONFIG_CAFILE','npm_config_cafile'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
env.TEST_DATABASE_URL='';env.CI='true';env.GIT_TERMINAL_PROMPT='0';
const report={schemaVersion:1,commit:manifest.commit,startedAt:new Date().toISOString(),backend:'PGlite serialized test adapter',independentAudit:false,tests:manifest.tests,sourceHashes:{},steps:[],result:'FAILED'};
function run(label,command,argv,cwd=workspace){
 console.log(`[review:si] ${label}`);
 const result=spawnSync(command,argv,{cwd,env,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});
 fs.writeFileSync(path.join(output,`${report.steps.length+1}-${label}.log`),(result.stdout||'')+(result.stderr||'')+(result.error?`\n${result.error.message}`:''));
 report.steps.push({label,command,args:argv,exitCode:result.status});
 if(result.status!==0)throw Error(`${label} failed; see report logs`);
 return result.stdout.trim();
}
try{
 run('init','git',['init','--quiet']);
 run('remote','git',['remote','add','origin',manifest.repository]);
 run('fetch','git',['fetch','--depth=1','origin',manifest.commit]);
 run('checkout','git',['checkout','--detach','FETCH_HEAD']);
 if(run('identity','git',['rev-parse','HEAD'])!==manifest.commit)throw Error('Review target mismatch');
 for(const name of manifest.sources)report.sourceHashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace,name))).digest('hex');
 run('install','npm',['ci','--ignore-scripts','--no-audit','--no-fund']);
 run('tests',process.execPath,['--test',...manifest.tests]);
 report.result='PASSED';
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
 report.finishedAt=new Date().toISOString();
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 fs.rmSync(workspace,{recursive:true,force:true});
 console.log(`[review:si] ${report.result}: ${output}/report.json`);
 console.log('Passing tests are project-generated evidence, not an independent audit or proof of production safety.');
}
