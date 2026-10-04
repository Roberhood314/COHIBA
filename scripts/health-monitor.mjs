// Scheduler-compatible monitor: nonzero exit triggers the operator's alerting system.
const origin=new URL(process.env.HS_MONITOR_ORIGIN||'https://cohibameme.site').origin;
const maxCheckpointMs=15*60*1000,maxBackupMs=8*60*60*1000;
try{
 const r=await fetch(origin+'/api/v1/status',{signal:AbortSignal.timeout(10000)}),s=await r.json(),now=Date.now();
 const fresh=(date,limit)=>Number.isFinite(Date.parse(date))&&now-Date.parse(date)<=limit&&Date.parse(date)<=now+60000;
 const reasons=[];
 if(!r.ok||!s.ready||s.accountStorage!=='POSTGRESQL')reasons.push('STORAGE_UNAVAILABLE');
 if(s.checkpoint?.lastError||!fresh(s.checkpoint?.lastSuccess,maxCheckpointMs))reasons.push('CHECKPOINT_STALE_OR_FAILED');
 if(!s.backup?.enabled||s.backup?.lastError||!fresh(s.backup?.lastSuccess,maxBackupMs))reasons.push('BACKUP_STALE_OR_FAILED');
 console.log(JSON.stringify({version:'HS_MONITOR_V1',checkedAt:new Date().toISOString(),ok:!reasons.length,reasons}));if(reasons.length)process.exitCode=1;
}catch{console.log(JSON.stringify({ok:false,reasons:['MONITOR_REQUEST_FAILED']}));process.exitCode=1;}
