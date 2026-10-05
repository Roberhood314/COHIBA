import assert from 'node:assert/strict';

// Finite abstraction, deliberately independent of the implementation. See FORMAL_PROPERTIES.md.
export function checkAuthorityModel() {
 const initial={epoch:0,grantEpoch:0,time:0,revoked:false,fenced:false,mask:3,budget:2,nonces:0,effects:0};
 const queue=[initial],seen=new Set([JSON.stringify(initial)]);let transitions=0,admissions=0;
 for(let cursor=0;cursor<queue.length;cursor++){
  const s=queue[cursor];
  const add=(n)=>{transitions++;assert.equal(n.nonces,n.effects,'atomic ledger/effect');assert.ok((n.nonces&s.nonces)===s.nonces,'nonce monotonic');assert.ok((n.effects&s.effects)===s.effects,'effect monotonic');assert.ok(!s.revoked||n.revoked,'revocation monotonic');assert.ok((n.mask&s.mask)===n.mask,'scope cannot amplify');assert.ok(n.budget<=s.budget,'budget cannot amplify');assert.ok(n.epoch>=s.epoch,'epoch cannot roll back');const k=JSON.stringify(n);if(!seen.has(k)){seen.add(k);queue.push(n);}};
  add({...s,revoked:true});
  if(s.time<2)add({...s,time:s.time+1});
  if(s.epoch===0)add({...s,epoch:1,fenced:true});
  // Trusted operator revalidation clears only the fence, not revocation or epoch.
  if(s.fenced)add({...s,fenced:false});
  const spent=Number(Boolean(s.nonces&1))+Number(Boolean(s.nonces&2));
  for(let mask=0;mask<4;mask++)for(let budget=1;budget<=2;budget++)if((mask&s.mask)===mask&&budget<=s.budget&&budget>=spent)add({...s,mask,budget});
  for(const bit of [1,2])for(const effect of [1,2,4])for(const signature of [false,true])for(const failWrite of [false,true]){
   const valid=signature&&!s.revoked&&!s.fenced&&s.epoch===s.grantEpoch&&s.time<2&&(s.mask&effect)===effect&&spent<s.budget&&!(s.nonces&bit);
   const n=valid&&!failWrite?{...s,nonces:s.nonces|bit,effects:s.effects|bit}:{...s};
   if(n.effects!==s.effects){admissions++;assert.ok(valid,'complete mediation');assert.ok((s.mask&effect)===effect,'effect containment');assert.ok(!s.revoked,'revocation');assert.ok(spent+1<=s.budget,'non-amplifying budget');}
   if(failWrite||!valid)assert.deepEqual(n,s,'failed/denied attempt is inert');
   add(n);
  }
 }
 assert.ok(admissions>0,'model must admit valid effects');
 // Negative witnesses are expected failures of *broader* unsupported designs, not production exploits.
 const independentLedgers=[new Set(),new Set()];let duplicateEffects=0;
 for(const ledger of independentLedgers)if(!ledger.has('same-proof')){ledger.add('same-proof');duplicateEffects++;}
 assert.equal(duplicateEffects,2);
 const issuer={revoked:false},cachedStatus={revoked:issuer.revoked};issuer.revoked=true;
 assert.equal(cachedStatus.revoked,false);
 const split={nonceCommitted:true,remoteEffectCommitted:false}; // crash between transactions
 assert.notEqual(split.nonceCommitted,split.remoteEffectCommitted);
 return {kind:'FINITE_ABSTRACT_MODEL',universalImplementationProof:false,bounds:{nonces:2,effectBits:3,epochs:2,timeTicks:3,maxBudget:2},states:seen.size,transitions,admissions,invariants:['mediation','nonAmplification','revocation','containment','atomicLocalCommit','monotonicRecovery'],negativeWitnesses:[{property:'distributedGlobalReplay',duplicateEffects},{property:'instantRemoteRevocation',revokedAtIssuer:issuer.revoked,cachedRevoked:cachedStatus.revoked},{property:'arbitraryExternalEffectAtomicity',...split}]};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)console.log(JSON.stringify(checkAuthorityModel(),null,2));
