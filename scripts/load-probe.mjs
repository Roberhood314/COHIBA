// Bounded read-only load probe; default is localhost. Never exercise user login/OTP.
import {performance} from 'node:perf_hooks';
const origin=new URL(process.env.HS_LOAD_ORIGIN||'http://127.0.0.1:8080');
if(!['localhost','127.0.0.1'].includes(origin.hostname)&&process.env.HS_LOAD_REMOTE_APPROVED!=='true')throw Error('REMOTE_LOAD_REQUIRES_EXPLICIT_OPERATOR_OPT_IN');
const count=Number(process.env.HS_LOAD_REQUESTS||40),concurrency=Number(process.env.HS_LOAD_CONCURRENCY||4);
if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw Error('INVALID_LOAD_BOUNDS');
const times=[],codes={};let next=0;
await Promise.all(Array.from({length:concurrency},async()=>{while(next++<count){const start=performance.now();try{const r=await fetch(origin.origin+'/api/v1/protocol',{signal:AbortSignal.timeout(10000)});await r.arrayBuffer();codes[r.status]=(codes[r.status]||0)+1;}catch{codes.network_error=(codes.network_error||0)+1;}times.push(performance.now()-start);}}));
times.sort((a,b)=>a-b);console.log(JSON.stringify({requests:count,concurrency,codes,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))]},null,2));if(codes.network_error||Object.keys(codes).some(k=>Number(k)>=500))process.exitCode=1;
