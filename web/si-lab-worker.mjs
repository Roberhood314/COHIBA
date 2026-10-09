import {verifyDualSignature,decode64,HS2_LENGTHS} from '../packages/hs2-verifier/wire.mjs';
self.onmessage=({data:report})=>{
 try{
  const registry=report.options.keyRegistry;
  const context=c=>({...c,classicalBytes:decode64(c.classicalBytes,atob(c.classicalBytes).length),attestation:report.input.attestations[c.id],version:report.version,suite:report.suite,registry});
  const start=performance.now(),rows=[];
  const run=(name,fn,expected)=>{const t=performance.now();let verdict='VERIFIED',reason='Both signatures valid';try{fn();}catch(e){verdict='REJECTED';reason=e.message;}rows.push({name,verdict,reason,passed:verdict===expected,milliseconds:Math.round((performance.now()-t)*100)/100});};
  run('All six dual-signature proofs',()=>{if(report.checks.length!==6)throw Error('FIXTURE_COVERAGE_INVALID');for(const c of report.checks)verifyDualSignature(context(c));},'VERIFIED');
  const action=context(report.checks.find(c=>c.id==='action'));
  run('Missing post-quantum signature',()=>verifyDualSignature({...action,attestation:{keyId:action.attestation.keyId,signature:''}}),'REJECTED');
  run('Missing classical signature',()=>verifyDualSignature({...action,edSignature:''}),'REJECTED');
  run('Ed25519-only downgrade',()=>verifyDualSignature({...action,suite:'Ed25519-only'}),'REJECTED');
  run('Changed action bytes',()=>{const bytes=new Uint8Array(action.classicalBytes);bytes[bytes.length-1]^=1;verifyDualSignature({...action,classicalBytes:bytes});},'REJECTED');
  run('Unpinned PQ key',()=>verifyDualSignature({...action,attestation:{...action.attestation,keyId:'attacker'}}),'REJECTED');
  run('Revoked PQ key',()=>{const keys=structuredClone(registry);keys[action.attestation.keyId].revoked=true;verifyDualSignature({...action,registry:keys});},'REJECTED');
  run('Changed signature role',()=>verifyDualSignature({...action,kind:'DELEGATION'}),'REJECTED');
  self.postMessage({ok:rows.every(r=>r.passed),rows,signatureBytes:HS2_LENGTHS.signature,totalMilliseconds:Math.round((performance.now()-start)*100)/100,executionAuthorized:false});
 }catch(e){self.postMessage({ok:false,error:String(e.message),executionAuthorized:false});}
};
