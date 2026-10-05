const surface=document.getElementById('runtime');
fetch('/api/v1/sovereignty/status',{headers:{Accept:'application/json'}}).then(async response=>{
 if(!response.ok)throw new Error('unavailable');
 const status=await response.json();if(status.ok!==true)throw new Error('unavailable');
 const bool=value=>value===true?'yes':'no';
 surface.textContent=[`SI: ${status.version}`,`Release: ${status.status}`,`Session gate: ${bool(status.directSessionGate)}`,`Signed PoHA storage available: ${bool(status.signedPohaGate)}`,`Signed PoHA execution enabled: ${bool(status.signedPohaExecutionEnabled)}`,`Signed local draft commit enabled: ${bool(status.localDraftCommitEnabled)}`,`Distributed network live: ${bool(status.distributedNetworkLive)}`,`Byzantine consensus: ${bool(status.byzantineConsensus)}`,`External-effect atomicity: ${bool(status.externalEffectAtomicity)}`].join('\n');
}).catch(()=>{surface.textContent='Service status unavailable. Inspect the source and CI evidence above.';});
