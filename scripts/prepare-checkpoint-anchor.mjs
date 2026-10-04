// Prepare an unsigned Solana memo transaction. No private key and no send operation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Connection,PublicKey,Transaction,TransactionInstruction,clusterApiUrl} from '@solana/web3.js';
import {verifyCheckpoint,checkpointBytes} from '../sdk/checkpoint.mjs';
const [file,out]=process.argv.slice(2),publicKey=process.env.HS_CHECKPOINT_PUBLIC_KEY,issuer=process.env.HS_CHECKPOINT_ISSUER,payer=process.env.HS_ANCHOR_PAYER;
if(!file||!out||!publicKey||!issuer||!payer)throw Error('CHECKPOINT_OUTPUT_PINNED_KEY_ISSUER_AND_PUBLIC_PAYER_REQUIRED');
const checkpoint=JSON.parse(fs.readFileSync(file));if(!verifyCheckpoint(checkpoint,{publicKey,issuer}))throw Error('CHECKPOINT_VERIFICATION_FAILED');
const network=process.env.HS_ANCHOR_NETWORK||'devnet';if(!['devnet','mainnet-beta'].includes(network))throw Error('INVALID_NETWORK');
const rpc=process.env.HS_ANCHOR_RPC||clusterApiUrl(network),connection=new Connection(rpc,'finalized');
const message='HS/1/ANCHOR '+JSON.stringify({issuer,stateRoot:checkpoint.stateRoot,checkpointHash:crypto.createHash('sha256').update(checkpointBytes(checkpoint)).digest('hex'),publicKey});
const {blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash();
const tx=new Transaction({feePayer:new PublicKey(payer),recentBlockhash:blockhash}).add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[],data:Buffer.from(message)}));
fs.writeFileSync(out,JSON.stringify({version:'HS_UNSIGNED_ANCHOR_V1',network,rpc,blockhash,lastValidBlockHeight,memo:message,transactionBase64:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),sent:false},null,2),{flag:'wx',mode:0o600});console.log('Unsigned anchor prepared. Verify cluster and memo in your signing tool; blockhash expires.');
