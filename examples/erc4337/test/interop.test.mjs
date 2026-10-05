import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Interface,TypedDataEncoder,getBytes,keccak256,toUtf8Bytes,hexlify,AbiCoder,concat} from 'ethers';
import {createAddressFromString,hexToBytes,bytesToHex} from '@ethereumjs/util';
import {compile,runtime,entryArtifact,compilerVersion} from './runtime.mjs';
import {domain,delegationTypes,revocationTypes,delegationTuple,executeSelector,sinkInterface,containedCall,operation,signOperation,userOpHash} from '../adapter.mjs';
fs.rmSync(path.resolve(import.meta.dirname,'../evidence/interop.json'),{force:true});
const built=compile(),accountInterface=new Interface(built.account.abi),entryInterface=new Interface(entryArtifact.abi);
const evidence=[];
async function fixture(overrides={}){
 const rt=await runtime(),[bundler,human,agent]=rt.wallets;
 const entry=await rt.deploy(bundler,entryArtifact),sink=await rt.deploy(bundler,built.sink),account=await rt.deploy(bundler,built.account,[human.address,entry,sink]);
 await rt.tx(bundler,{to:account,value:10n**20n});
 const grant={agent:agent.address,target:sink,selector:sinkInterface.getFunction('commit').selector,resource:keccak256(toUtf8Bytes('synthetic:article')),maxCalls:3n,gasBudget:10n**18n,validAfter:rt.now()-1n,validUntil:rt.now()+60n,epoch:0n,salt:keccak256(toUtf8Bytes('synthetic-grant')),entryPoint:entry,...overrides};
 const humanSignature=await human.signTypedData(domain(rt.chainId,account),delegationTypes,grant),id=TypedDataEncoder.hash(domain(rt.chainId,account),delegationTypes,grant);
 const make=async({nonce=0n,text='synthetic draft',g=grant,sig=humanSignature,signer=agent,sender=account}={})=>signOperation(operation({sender,nonce,callData:containedCall(g,sig,toUtf8Bytes(text))}),signer,entry,rt.chainId);
 const send=ops=>rt.tx(bundler,{to:entry,data:entryInterface.encodeFunctionData('handleOps',[ops,bundler.address])});
 const events=r=>r.execResult.logs.map(([address,topics,data])=>{try{return entryInterface.parseLog({topics:topics.map(bytesToHex),data:bytesToHex(data)});}catch{return null;}}).filter(x=>x?.name==='UserOperationEvent').map(x=>({success:x.args.success,gasUsed:x.args.actualGasUsed.toString(),gasCost:x.args.actualGasCost.toString()}));
 const count=async()=>(await rt.view(sink,sinkInterface,'effectCount',[account]))[0];
 const value=async(name,args=[])=>(await rt.view(account,accountInterface,name,args))[0];
 return {...rt,bundler,human,agent,entry,sink,account,grant,humanSignature,id,make,send,events,count,value};
}
function ok(r){assert.equal(r.execResult.exceptionError,undefined,bytesToHex(r.execResult.returnValue));}
function rejected(r){assert.ok(r.execResult.exceptionError,'transaction must revert');}
function highSSignature(signature){
 const raw=getBytes(signature);if(raw.length!==65)throw Error('SIGNATURE_LENGTH');
 const n=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
 const lowS=BigInt(hexlify(raw.slice(32,64))),highS=n-lowS;
 const out=Uint8Array.from(raw);out.set(getBytes('0x'+highS.toString(16).padStart(64,'0')),32);return hexlify(out);
}

test('official EntryPoint v0.7 executes human-signed delegation and exact agent intent on a local EVM',async()=>{
 const f=await fixture(),op=await f.make();
 assert.equal(await f.value('delegationId',[f.grant]),f.id);
 assert.equal((await f.view(f.entry,entryInterface,'getUserOpHash',[op]))[0],userOpHash(op,f.entry,f.chainId));
 const r=await f.send([op]);ok(r);assert.deepEqual(f.events(r).map(x=>x.success),[true]);assert.equal(await f.count(),1n);
 assert.equal((await f.view(f.sink,sinkInterface,'payloadHashes',[f.account,f.grant.resource]))[0],keccak256(toUtf8Bytes('synthetic draft')));
 assert.equal(await f.value('usedCalls',[f.id]),1n);assert.ok(await f.value('reservedGasCost',[f.id])>0n);
 rejected(await f.send([op]));assert.equal(await f.count(),1n);
 const largest=await f.send([await f.make({nonce:1n,text:'x'.repeat(6000)})]);ok(largest);assert.deepEqual(f.events(largest).map(x=>x.success),[true]);assert.equal(await f.count(),2n);
 evidence.push({scenario:'human-delegation-contained-evm-effect',...f.events(r)[0],outerTransactionGas:r.totalGasSpent.toString(),nonceReplayRejected:true});
});

test('forged human/agent signatures, widened effects, substituted bytes and unsupported routes deny before effects',async()=>{
 const f=await fixture();const base=await f.make();
 const forgedHuman=await f.agent.signTypedData(domain(f.chainId,f.account),delegationTypes,f.grant),malleableHuman=highSSignature(f.humanSignature);
 const bad=[await f.make({sig:malleableHuman}),await f.make({sig:forgedHuman}),await f.make({text:'x'.repeat(6001)}),await f.make({signer:f.human}),await f.make({sig:'0x'}),await f.make({g:{...f.grant,maxCalls:1000n}}),await f.make({g:{...f.grant,gasBudget:10n**25n}}),await f.make({g:{...f.grant,validUntil:f.grant.validUntil+86400n}}),await f.make({g:{...f.grant,resource:keccak256(toUtf8Bytes('outside'))}}),await f.make({g:{...f.grant,target:f.human.address}}),await f.make({g:{...f.grant,selector:'0x095ea7b3'}}),{...base,callData:containedCall(f.grant,f.humanSignature,toUtf8Bytes('substituted'))},await signOperation({...operation({sender:f.account,nonce:0n,callData:'0xdeadbeef'}),signature:'0x'},f.agent,f.entry,f.chainId),{...base,paymasterAndData:f.human.address},{...base,initCode:f.human.address}];
 for(const op of bad){rejected(await f.send([op]));assert.equal(await f.count(),0n);assert.equal(await f.value('usedCalls',[f.id]),0n);assert.equal(await f.value('reservedGasCost',[f.id]),0n);}
 evidence.push({scenario:'forgery-containment-profile',rejectedVariants:bad.length});
});

test('same-bundle call budgets are rechecked during execution, not just validation',async()=>{
 const f=await fixture({maxCalls:1n});const r=await f.send([await f.make(),await f.make({nonce:1n,text:'second'})]);ok(r);
 assert.deepEqual(f.events(r).map(x=>x.success),[true,false]);assert.equal(await f.count(),1n);assert.equal(await f.value('usedCalls',[f.id]),1n);
 assert.equal((await f.view(f.entry,entryInterface,'getNonce',[f.account,0]))[0],2n);
 evidence.push({scenario:'same-bundle-execution-budget',outcomes:f.events(r)});
});

test('earlier human-signed revocation in the official bundle defeats an already validated agent operation',async()=>{
 const f=await fixture();const revocation={delegationId:f.id,epoch:0n};const sig=await f.human.signTypedData(domain(f.chainId,f.account),revocationTypes,revocation);
 const ownerOp=await signOperation(operation({sender:f.account,nonce:0n,callData:accountInterface.encodeFunctionData('revokeWithSignature',[f.id,sig])}),f.human,f.entry,f.chainId);
 const r=await f.send([ownerOp,await f.make({nonce:1n})]);ok(r);
 assert.deepEqual(f.events(r).map(x=>x.success),[true,false]);assert.equal(await f.value('revoked',[f.id]),true);assert.equal(await f.count(),0n);assert.equal(await f.value('usedCalls',[f.id]),0n);
 rejected(await f.send([await f.make({nonce:2n})]));
 evidence.push({scenario:'same-bundle-revocation-after-validation',outcomes:f.events(r),effectCount:0});
});

test('preflight cannot override execution-time expiry or a changed credential epoch',async()=>{
 const f=await fixture();const op=await f.make();
 await f.vm.stateManager.checkpoint();
 try{const r=await f.vm.evm.runCall({to:createAddressFromString(f.account),caller:createAddressFromString(f.entry),data:hexToBytes(accountInterface.encodeFunctionData('validateUserOp',[op,userOpHash(op,f.entry,f.chainId),0])),gasLimit:4000000n});assert.equal(r.execResult.exceptionError,undefined);const vd=accountInterface.decodeFunctionResult('validateUserOp',bytesToHex(r.execResult.returnValue))[0];assert.equal(vd&((1n<<160n)-1n),0n);}finally{await f.vm.stateManager.revert();}
 // v0.7 EntryPoint allows equal validUntil; the adapter enforces strict expiry at effect time.
 f.advance(60);const expired=await f.send([op]);ok(expired);assert.deepEqual(f.events(expired).map(x=>x.success),[false]);assert.equal(await f.count(),0n);
 f.advance(1);rejected(await f.send([await f.make({nonce:1n})]));
 const g=await fixture();const stale=await g.make();ok(await g.tx(g.human,{to:g.account,data:accountInterface.encodeFunctionData('invalidateEpoch')}));rejected(await g.send([stale]));assert.equal(await g.count(),0n);
 evidence.push({scenario:'preflight-expiry-and-epoch',executionBoundaryDenied:true,staleEpochDenied:true});
});

test('target revert rolls back the business effect and call spend; EntryPoint nonce and gas admission remain consumed',async()=>{
 const f=await fixture(),op=await f.make({text:'INJECT_FAILURE'});const r=await f.send([op]);ok(r);
 assert.deepEqual(f.events(r).map(x=>x.success),[false]);assert.equal(await f.count(),0n);assert.equal(await f.value('usedCalls',[f.id]),0n);assert.ok(await f.value('reservedGasCost',[f.id])>0n);
 assert.equal((await f.view(f.entry,entryInterface,'getNonce',[f.account,0]))[0],1n);rejected(await f.send([op]));
 evidence.push({scenario:'target-revert-atomic-business-effect',outcomes:f.events(r),effectCount:0,nonceConsumed:true,gasReservationRetained:true});
});

test('gas budget, cross-account/chain/EntryPoint domains and direct agent authority mutations are contained',async()=>{
 const f=await fixture({gasBudget:1n});rejected(await f.send([await f.make()]));assert.equal(await f.count(),0n);
 const g=await fixture();const wrongChain=await g.human.signTypedData(domain(2n,g.account),delegationTypes,g.grant);rejected(await g.send([await g.make({sig:wrongChain})]));
 const second=await g.deploy(g.bundler,built.account,[g.human.address,g.entry,g.sink]);ok(await g.tx(g.bundler,{to:second,value:10n**20n}));rejected(await g.send([await g.make({sender:second})]));
 rejected(await g.send([await g.make({g:{...g.grant,entryPoint:second}})]));
 const op=await g.make();rejected(await g.tx(g.agent,{to:g.account,data:accountInterface.encodeFunctionData('executeUserOp',[op,userOpHash(op,g.entry,g.chainId)])}));
 for(const [fn,args] of [['revokeGrant',[g.id]],['invalidateEpoch',[]]])rejected(await g.tx(g.agent,{to:g.account,data:accountInterface.encodeFunctionData(fn,args)}));
 const fakeRevoke=await g.agent.signTypedData(domain(g.chainId,g.account),revocationTypes,{delegationId:g.id,epoch:0n});rejected(await g.tx(g.agent,{to:g.account,data:accountInterface.encodeFunctionData('revokeWithSignature',[g.id,fakeRevoke])}));
 assert.equal(await g.count(),0n);assert.equal(await g.value('revoked',[g.id]),false);
 evidence.push({scenario:'gas-domain-direct-bypass',gasBudgetDenied:true,domainSubstitutionDenied:true,directBypassDenied:true});
});

test('cumulative gas reservation cannot be reset through a fresh nonce',async()=>{
 const cost=2750000n*2000000000n;const f=await fixture({gasBudget:cost});const first=await f.send([await f.make()]);ok(first);assert.deepEqual(f.events(first).map(x=>x.success),[true]);
 assert.equal(await f.value('reservedGasCost',[f.id]),cost);rejected(await f.send([await f.make({nonce:1n})]));assert.equal(await f.count(),1n);assert.equal(await f.value('reservedGasCost',[f.id]),cost);
 evidence.push({scenario:'cumulative-gas-reservation',maxCost:cost.toString(),secondAdmissionDenied:true});
});

test('emit source-bound interoperability evidence only after every scenario completed',()=>{
 assert.equal(evidence.length,8);
 const root=path.resolve(import.meta.dirname,'..');const paths=['contracts/HumanSignalAccount.sol','contracts/DraftSink.sol','adapter.mjs','test/interop.test.mjs','test/runtime.mjs','package-lock.json'];
 const sources=paths.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}));
 const out={version:'HS_ERC4337_REFERENCE_EVIDENCE_1',scope:'LOCAL_EVM_OFFICIAL_ENTRYPOINT_0_7_0',publicNetwork:false,liveAgentModel:false,bundlerRpcVerified:false,independentIntegration:false,identityAssurance:'CONFIGURED_EOA_OWNER_NOT_PERSONHOOD',node:process.version,compiler:compilerVersion,evm:'ethereumjs-vm-10.1.1-SHANGHAI',entryPointCreationBytecodeSha256:crypto.createHash('sha256').update(getBytes(entryArtifact.bytecode)).digest('hex'),sources,scenarios:evidence};
 fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/interop.json'),JSON.stringify(out,null,2)+'\n');
});
