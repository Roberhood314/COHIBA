// Usage: agent-proof.mjs binding|action input.json key.pem. Key never leaves the local file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {agentBindingPayload,actionPayload,signProof,publicKeyBase64} from '../sdk/human-signal-node.mjs';
const [mode,inputFile,keyFile]=process.argv.slice(2);if(!['binding','action'].includes(mode)||!inputFile||!keyFile)throw Error('Usage: agent-proof.mjs binding|action input.json key.pem');
if(!fs.existsSync(keyFile)){const key=crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});fs.writeFileSync(keyFile,key,{mode:0o600,flag:'wx'});}
const key=crypto.createPrivateKey(fs.readFileSync(keyFile)),input=JSON.parse(fs.readFileSync(inputFile));
if(mode==='binding'){
 const payload=agentBindingPayload({...input,agentKey:publicKeyBase64(key)});console.log(JSON.stringify({payload,agentSignature:signProof('AGENT_BINDING',payload,key)},null,2));
}else{
 if(typeof input.text!=='string')throw Error('TEXT_REQUIRED');
 const payload=actionPayload({...input,signerKey:publicKeyBase64(key),payloadBytes:Buffer.from(input.text,'utf8')});console.log(JSON.stringify({payload,signature:signProof('ACTION',payload,key)},null,2));
}
