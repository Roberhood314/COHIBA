import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {checkAuthorityModel} from './si-model-check.mjs';
import {benchmarkSI} from './si-benchmark.mjs';

// Full suite is intentional: preserve TAP as evidence, including skips; never call a partial run complete.
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const output=path.resolve(process.argv[2]||'operations/evidence/si-due-diligence');fs.mkdirSync(output,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const files=git('ls-files','-z').split('\0').filter(Boolean).sort();
const sources=files.filter(f=>!f.startsWith('operations/evidence/')&&!f.endsWith('security-evidence.json')).map(f=>({path:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}));
const sourceDigest=crypto.createHash('sha256').update(JSON.stringify(sources)).digest('hex');
fs.writeFileSync(path.join(output,'source-files.json'),JSON.stringify(sources,null,2)+'\n');
const model=checkAuthorityModel();fs.writeFileSync(path.join(output,'model.json'),JSON.stringify(model,null,2)+'\n');
const benchmark=benchmarkSI();fs.writeFileSync(path.join(output,'benchmark.json'),JSON.stringify(benchmark,null,2)+'\n');
const tests=files.filter(f=>/^test\/.*\.test\.mjs$/.test(f));
const child=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:300000});
const tap=child.stdout||'';fs.writeFileSync(path.join(output,'tests.tap'),tap);fs.writeFileSync(path.join(output,'tests.stderr.txt'),child.stderr||'');
if(child.status!==0){const lines=tap.split('\n');for(let i=0;i<lines.length;i++)if(/^not ok /.test(lines[i]))console.error(lines.slice(i,i+35).join('\n'));if(child.error)console.error(child.error.message);}
const totals=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(tap.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??-1)]));
const checks={};
for(const name of ['verify:security','verify:evolution','typecheck']){const check=spawnSync('npm',['run',name],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});checks[name]={exitCode:check.status,error:check.error?.message??null};fs.writeFileSync(path.join(output,name.replace(':','-')+'.log'),(check.stdout||'')+(check.stderr||''));}
const checksPassed=Object.values(checks).every(c=>c.exitCode===0);
const full=process.env.SI_REQUIRE_FULL_EVIDENCE==='1';
const result={version:'HS_SI_DD_EVIDENCE_1',generatedAt:new Date().toISOString(),commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedWorktreeDirty:!!git('status','--porcelain','--untracked-files=no'),sourceDigest,lockfileSha256:sources.find(x=>x.path==='package-lock.json')?.sha256,environment:benchmark.environment,capabilities:{nativePostgres:!!process.env.TEST_DATABASE_URL,containerIsolation:process.env.TEST_AGENT_CONTAINER==='1'},tests:{...totals,exitCode:child.status,error:child.error?.message??null},checks,model:{states:model.states,transitions:model.transitions,universalImplementationProof:false},fullEvidenceRequired:full,completeSuiteEvidence:checksPassed&&child.status===0&&totals.fail===0&&totals.skipped===0&&totals.tests>0&&!!process.env.TEST_DATABASE_URL&&process.env.TEST_AGENT_CONTAINER==='1'};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(!checksPassed||child.status!==0||totals.fail!==0||totals.tests<1||(full&&!result.completeSuiteEvidence))process.exitCode=1;
