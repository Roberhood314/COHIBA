import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {amountBaseUnits,createOpenUsdPaymentRequest,verifyOpenUsdPayment,OUSD_MINT} from '../integrations/open-standard/ousd-wallet-payments.mjs';
import {verifyPiAccessToken,bindPiIdentity} from '../lib/pi-network-link.mjs';
const address=()=>Keypair.generate().publicKey.toBase58();
function fixture(){
 const recipient=address(),payer=address(),reference=address();
 const request=createOpenUsdPaymentRequest({recipient,reference,amount:'1.25',decimals:6,message:'A & B'});
 const row=(owner,amount)=>({mint:OUSD_MINT,owner,uiTokenAmount:{decimals:6,amount}});
 const tx={slot:123,transaction:{message:{accountKeys:[{pubkey:payer,signer:true},{pubkey:reference,signer:false}]}},meta:{err:null,preTokenBalances:[row(payer,'2000000')],postTokenBalances:[row(payer,'750000'),row(recipient,'1250000')]}};
 const connection={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getSignatureStatuses:async()=>({value:[{err:null,confirmationStatus:'finalized'}]}),getParsedTransaction:async()=>tx};
 return {connection,request,payer,signature:'2'.repeat(88),tx};
}
test('OUSD request preserves exact integer amounts and encodes Solana Pay identity',()=>{
 const f=fixture(),url=new URL(f.request.url);assert.equal(url.searchParams.get('spl-token'),OUSD_MINT);assert.equal(url.searchParams.get('message'),'A & B');assert.equal(f.request.amountBaseUnits,'1250000');assert.equal(f.request.executionAuthorized,false);
 for(const amount of ['0','-1','1e6','01','1x25','0.0000001',1.25])assert.throws(()=>amountBaseUnits(amount,6));
 assert.equal(amountBaseUnits('9007199254.740993',6),9007199254740993n);
 assert.throws(()=>createOpenUsdPaymentRequest({...f.request,recipient:'1'}),/INVALID_SOLANA_ADDRESS/);
});
test('OUSD settlement accepts finalized exact payment and never consumes invoice',async()=>{const f=fixture();const result=await verifyOpenUsdPayment(f);assert.equal(result.settled,true);assert.equal(result.invoiceConsumed,false);assert.equal(result.executionAuthorized,false);});
test('OUSD settlement rejects wrong chain, pending, failed, wrong asset, amount, signer and reference',async()=>{
 for(const mutate of [f=>f.connection.getGenesisHash=async()=> 'devnet',f=>f.connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'confirmed'}]}),f=>f.tx.meta.err={InstructionError:[]},f=>f.tx.meta.postTokenBalances[1].mint=address(),f=>f.tx.meta.postTokenBalances[1].uiTokenAmount.amount='1250001',f=>f.tx.transaction.message.accountKeys[0].signer=false,f=>f.tx.transaction.message.accountKeys.pop(),f=>f.request={...f.request,amountBaseUnits:'1'}]){const f=fixture();mutate(f);await assert.rejects(verifyOpenUsdPayment(f));}
});
test('Pi verification uses fixed API, rejects forged/expired/provider failure, omits access token',async()=>{
 const until=new Date(Date.now()+60000).toISOString();let headers;
 const fake=async(url,opts)=>{assert.equal(url,'https://api.minepi.com/v2/me');headers=opts.headers;return {ok:true,json:async()=>({uid:'pi-user',credentials:{scopes:[],valid_until:{iso8601:until}}})};};
 assert.deepEqual(await verifyPiAccessToken('a'.repeat(32),fake),{uid:'pi-user',validUntil:until,scopes:[]});assert.equal(headers.authorization,'Bearer '+'a'.repeat(32));
 await assert.rejects(verifyPiAccessToken('a'.repeat(32),async()=>({ok:false,status:401})),/PI_TOKEN_INVALID/);
 await assert.rejects(verifyPiAccessToken('a'.repeat(32),async()=>({ok:true,json:async()=>({uid:'forged'})})),/INVALID_RESPONSE/);
 await assert.rejects(verifyPiAccessToken('a'.repeat(32),async()=>{throw Error('secret-token');}),/PI_PROVIDER_UNAVAILABLE/);
});
test('Pi identity binding requires wallet, isolates accounts, refuses silent replacement',()=>{
 const store={profiles:[{id:'alice',wallet:address()},{id:'bob',wallet:address()},{id:'no-wallet'}]};const binding={store,profileId:'alice',identityHash:'hash-a',validUntil:new Date(Date.now()+60000).toISOString()};
 assert.equal(bindPiIdentity(binding).linked,true);assert.throws(()=>bindPiIdentity({...binding,profileId:'bob'}),/ALREADY_LINKED/);assert.throws(()=>bindPiIdentity({...binding,identityHash:'hash-b'}),/UNLINK_REQUIRED/);assert.throws(()=>bindPiIdentity({...binding,profileId:'no-wallet'}),/SOLANA_IDENTITY_REQUIRED/);
 assert.equal(JSON.stringify(store).includes('accessToken'),false);
});

test('unsigned OUSD transaction binds Token-2022, exact amount, recipient and reference',async()=>{
 const {prepareOpenUsdTransfer}=await import('../integrations/open-standard/ousd-transaction.mjs');
 const {PublicKey,Transaction}=await import('@solana/web3.js');
 const {AccountLayout,TOKEN_2022_PROGRAM_ID,decodeTransferCheckedInstruction,getAssociatedTokenAddressSync}=await import('@solana/spl-token');
 const f=fixture(),owner=new PublicKey(f.payer),mintKey=new PublicKey(OUSD_MINT),buffer=Buffer.alloc(165);
 AccountLayout.encode({mint:mintKey,owner,amount:2000000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},buffer);
 const connection={getAccountInfo:async()=>({owner:TOKEN_2022_PROGRAM_ID,data:buffer}),getLatestBlockhash:async()=>({blockhash:address(),lastValidBlockHeight:100})};
 const mint={mint:OUSD_MINT,decimals:6,tokenProgram:TOKEN_2022_PROGRAM_ID.toBase58(),paused:false,transferHook:null,transferFeeConfigured:false};
 const prepared=await prepareOpenUsdTransfer({connection,mint,request:f.request,payer:f.payer});
 const transaction=Transaction.from(Buffer.from(prepared.transaction,'base64'));
 assert.equal(transaction.instructions.length,2);assert.equal(transaction.signatures[0].signature,null);
 const ix=transaction.instructions[1],decoded=decodeTransferCheckedInstruction(ix,TOKEN_2022_PROGRAM_ID);
 assert.equal(decoded.data.amount,1250000n);assert.equal(decoded.data.decimals,6);assert.equal(ix.keys.at(-1).pubkey.toBase58(),f.request.reference);
 assert.equal(decoded.keys.destination.pubkey.toBase58(),getAssociatedTokenAddressSync(mintKey,new PublicKey(f.request.recipient),false,TOKEN_2022_PROGRAM_ID).toBase58());
 await assert.rejects(prepareOpenUsdTransfer({connection,mint:{...mint,paused:true},request:f.request,payer:f.payer}),/EXTENSION_REVIEW/);
 await assert.rejects(prepareOpenUsdTransfer({connection,mint,request:{...f.request,amount:'2'},payer:f.payer}),/REQUEST_MISMATCH/);
});

test('official OUSD mint inspector distinguishes disabled zero-key hook from active hook',async()=>{
 const {inspectOpenUsdSolana}=await import('../integrations/open-standard/ousd-solana.mjs');
 const {PublicKey}=await import('@solana/web3.js');const {MintLayout,ExtensionType,TOKEN_2022_PROGRAM_ID}=await import('@solana/spl-token');
 const data=Buffer.alloc(166+4+64);MintLayout.encode({mintAuthorityOption:1,mintAuthority:PublicKey.default,supply:1000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},data);data[165]=1;data.writeUInt16LE(ExtensionType.TransferHook,166);data.writeUInt16LE(64,168);
 const connection={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getAccountInfo:async()=>({owner:TOKEN_2022_PROGRAM_ID,data})};
 assert.equal((await inspectOpenUsdSolana(connection)).transferHook,null);
 const active=new PublicKey(address());active.toBuffer().copy(data,202);assert.equal((await inspectOpenUsdSolana(connection)).transferHook,active.toBase58());
});
