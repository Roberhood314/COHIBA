import {PublicKey,Transaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction,getAccount} from '@solana/spl-token';
import {createOpenUsdPaymentRequest} from './ousd-wallet-payments.mjs';
// Constructs unsigned wallet transaction only. There is no server signing key.
export async function prepareOpenUsdTransfer({connection,mint,request,payer}){
 if(mint.paused||mint.transferHook||mint.transferFeeConfigured)throw Error('OUSD_WALLET_EXTENSION_REVIEW_REQUIRED');
 const canonical=createOpenUsdPaymentRequest({recipient:request.recipient,reference:request.reference,amount:request.amount,decimals:mint.decimals,message:request.message||''});
 if(request.mint!==mint.mint||request.decimals!==mint.decimals||request.amountBaseUnits!==canonical.amountBaseUnits||request.network!=='solana-mainnet')throw Error('PAYMENT_REQUEST_MISMATCH');
 const owner=new PublicKey(payer),recipient=new PublicKey(request.recipient),token=new PublicKey(mint.mint),program=new PublicKey(mint.tokenProgram);
 if(owner.equals(recipient))throw Error('PAYMENT_SENDER_EQUALS_RECIPIENT');
 const source=getAssociatedTokenAddressSync(token,owner,false,program),destination=getAssociatedTokenAddressSync(token,recipient,false,program);
 const account=await getAccount(connection,source,'finalized',program);
 const amount=BigInt(canonical.amountBaseUnits);
 if(account.isFrozen||account.amount<amount)throw Error('OUSD_BALANCE_UNAVAILABLE');
 const transfer=createTransferCheckedInstruction(source,token,destination,owner,amount,mint.decimals,[],program);
 transfer.keys.push({pubkey:new PublicKey(request.reference),isSigner:false,isWritable:false});
 const block=await connection.getLatestBlockhash('finalized');
 const transaction=new Transaction({feePayer:owner,...block}).add(createAssociatedTokenAccountIdempotentInstruction(owner,destination,recipient,token,program),transfer);
 return {transaction:transaction.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),blockhash:block.blockhash,lastValidBlockHeight:block.lastValidBlockHeight,executionAuthorized:false};
}
