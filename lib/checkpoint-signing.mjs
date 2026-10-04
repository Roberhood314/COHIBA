import crypto from 'node:crypto';
import fs from 'node:fs';
import {checkpointBytes} from '../sdk/checkpoint.mjs';
import {publicKeyBase64} from '../sdk/human-signal-node.mjs';
export function loadCheckpointSigner(file){
 let pem;try{pem=fs.readFileSync(file);}catch(e){if(e.code!=='ENOENT')throw e;const pair=crypto.generateKeyPairSync('ed25519');const bytes=pair.privateKey.export({format:'pem',type:'pkcs8'});try{fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}pem=fs.readFileSync(file);}
 const privateKey=crypto.createPrivateKey(pem);if(privateKey.asymmetricKeyType!=='ed25519')throw Error('INVALID_CHECKPOINT_KEY');return {publicKey:publicKeyBase64(privateKey),sign(state){return {...state,signature:{algorithm:'Ed25519',publicKey:publicKeyBase64(privateKey),value:crypto.sign(null,checkpointBytes(state),privateKey).toString('base64')}};}};
}
