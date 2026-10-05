import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import {createVM,runTx} from '@ethereumjs/vm';
import {Common,Mainnet,Hardfork} from '@ethereumjs/common';
import {createLegacyTx} from '@ethereumjs/tx';
import {createBlock} from '@ethereumjs/block';
import {Account,createAddressFromString,hexToBytes,bytesToHex} from '@ethereumjs/util';
import {Wallet,Interface,concat} from 'ethers';
const root=path.resolve(import.meta.dirname,'..');
export const compilerVersion=solc.version();
export const entryArtifact=JSON.parse(fs.readFileSync(path.join(root,'node_modules/@account-abstraction/contracts/artifacts/EntryPoint.json')));
export function compile(){
 const sources=Object.fromEntries(['HumanSignalAccount.sol','DraftSink.sol'].map(f=>[f,{content:fs.readFileSync(path.join(root,'contracts',f),'utf8')}]));
 const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const result=JSON.parse(solc.compile(JSON.stringify(input),{import:filename=>{try{return {contents:fs.readFileSync(path.join(root,'node_modules',filename),'utf8')};}catch{return {error:'IMPORT_NOT_FOUND '+filename};}}}));
 const errors=result.errors?.filter(e=>e.severity==='error')??[];if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
 return {account:result.contracts['HumanSignalAccount.sol'].HumanSignalAccount,sink:result.contracts['DraftSink.sol'].DraftSink};
}
export async function runtime(){
 // Mainnet chain id binds signatures; no network/provider connection is created.
 const common=new Common({chain:Mainnet,hardfork:Hardfork.Shanghai}),vm=await createVM({common});
 const wallets=[1,2,3].map(n=>new Wallet('0x'+n.toString(16).padStart(64,'0'))); // public synthetic keys only
 for(const wallet of wallets)await vm.stateManager.putAccount(createAddressFromString(wallet.address),new Account(0n,10n**24n));
 let timestamp=2000000000n,number=1n;
 const tx=async(wallet,{to,data='0x',value=0n,gasLimit=14000000n}={})=>{
  const address=createAddressFromString(wallet.address),account=await vm.stateManager.getAccount(address);
  const signed=createLegacyTx({nonce:account.nonce,gasPrice:2000000000n,gasLimit,value,data:hexToBytes(data),...(to?{to:createAddressFromString(to)}:{})},{common}).sign(hexToBytes(wallet.privateKey));
  const block=createBlock({header:{number:number++,timestamp,gasLimit:30000000n,baseFeePerGas:1000000000n}},{common});
  return runTx(vm,{tx:signed,block});
 };
 const deploy=async(wallet,artifact,args=[])=>{const iface=new Interface(artifact.abi);const bytecode=artifact.bytecode??'0x'+artifact.evm.bytecode.object;const r=await tx(wallet,{data:concat([bytecode,iface.encodeDeploy(args)])});if(r.execResult.exceptionError)throw Error('DEPLOY '+r.execResult.exceptionError.error+' '+bytesToHex(r.execResult.returnValue));return r.createdAddress.toString();};
 const view=async(address,iface,name,args=[])=>{const r=await vm.evm.runCall({to:createAddressFromString(address),caller:createAddressFromString(wallets[0].address),data:hexToBytes(iface.encodeFunctionData(name,args)),gasLimit:10000000n});if(r.execResult.exceptionError)throw Error('VIEW '+r.execResult.exceptionError.error);return iface.decodeFunctionResult(name,bytesToHex(r.execResult.returnValue));};
 return {vm,wallets,tx,deploy,view,chainId:1n,now:()=>timestamp,advance:seconds=>{timestamp+=BigInt(seconds);}};
}
