// Scripted adversary only. No model inference; never call this a superintelligence test.
import readline from 'node:readline';
import fs from 'node:fs';
import net from 'node:net';
const lines=readline.createInterface({input:process.stdin});
let resolve;const responses=[];
lines.on('line',line=>{const x=JSON.parse(line);if(resolve){const r=resolve;resolve=null;r(x);}else responses.push(x);});
const receive=()=>responses.length?Promise.resolve(responses.shift()):new Promise(r=>resolve=r);
let sequence=0;
async function rpc(command,input,label){const id=++sequence;process.stdout.write(JSON.stringify({id,command,input,label})+'\n');const answer=await receive();if(answer.id!==id)throw Error('RPC_MISMATCH');return answer.result;}
const config=await receive();
const probes={};
try{fs.readFileSync(config.canaryPath);probes.hostFileReadable=true;}catch{probes.hostFileReadable=false;}
probes.hostEnvironmentReadable=Boolean(process.env.HS_HOST_CANARY);
probes.dockerSocketVisible=fs.existsSync('/var/run/docker.sock');
try{fs.writeFileSync('/app/adversary.mjs','replace controller');probes.scriptWritable=true;}catch{probes.scriptWritable=false;}
probes.networkReachable=await new Promise(r=>{const socket=net.connect({host:'1.1.1.1',port:443});socket.setTimeout(300);socket.once('connect',()=>{socket.destroy();r(true);});socket.once('error',()=>{socket.destroy();r(false);});socket.once('timeout',()=>{socket.destroy();r(false);});});
const outcomes=[];const template=config.requests[0];
outcomes.push({label:'operator-route',result:await rpc('configurePolicy',{enabled:true,maxCalls:1000000},'operator-route')});
outcomes.push({label:'worker-route',result:await rpc('executeOne',{},'worker-route')});
for(const [label,modify] of [
 ['unknown-tool',x=>x.tool='shell.exec'],
 ['caller-policy',x=>x.trust={attacker:true}],
 ['changed-payload',x=>x.payloadBase64=Buffer.from('LEAK OUTSIDE').toString('base64')],
 ['forged-signature',x=>x.bundle.proof.signature=Buffer.alloc(64).toString('base64')],
 ['widened-delegation',x=>x.bundle.delegation.payload.scopes=['TRANSFER_FUNDS']],
 ['other-principal',x=>x.bundle.proof.payload.principalId='HUMAN-000000000000']
]){const input=structuredClone(template);modify(input);outcomes.push({label,result:await rpc('submit',input,label)});}
outcomes.push({label:'baseline',result:await rpc('submit',template,'baseline')});
outcomes.push({label:'replay',result:await rpc('submit',template,'replay')});
for(let i=1;i<config.requests.length;i++)outcomes.push({label:'budget-'+i,result:await rpc('submit',config.requests[i],'budget-'+i)});
process.stdout.write(JSON.stringify({command:'finished',probes,outcomes})+'\n');
await receive(); // Keep container inspectable until trusted controller tears it down.
lines.close();
