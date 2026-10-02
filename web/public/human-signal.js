(()=>{"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function load(){
  try{
    const [a,b]=await Promise.all([fetch("/api/human-signal/contributions"),fetch("/api/human-signal/reputation")]);
    const registry=await a.json(), rep=await b.json();
    $("#recordCount").textContent=registry.count??0;
    $("#records").innerHTML=(registry.records||[]).length?(registry.records||[]).map(r=>'<div class="record"><span class="badge">'+esc(r.type)+'</span> <span class="badge '+(r.status==="VERIFIED"?"verified":r.status==="REJECTED"?"rejected":"")+'">'+esc(r.status)+'</span><h3>'+esc(r.title)+'</h3><p>'+esc(r.summary)+'</p><p class="note">By '+esc(r.contributor)+' · '+esc(r.id)+'</p><p class="proof">'+esc(r.proofHash)+'</p><p><a href="'+esc(r.evidenceUrl)+'" target="_blank" rel="noopener noreferrer">Evidence ↗</a></p></div>').join(""):'<p class="note">No contributions recorded yet.</p>';
    $("#leaderboard").innerHTML=(rep.leaderboard||[]).length?(rep.leaderboard||[]).map((x,i)=>'<div class="record"><strong>#'+(i+1)+' '+esc(x.contributor)+'</strong><br><span class="verified">'+esc(x.reputationPoints)+' pts</span> · '+esc(x.verifiedContributions)+' verified</div>').join(""):'<p class="note">No verified contributors yet.</p>';
  }catch{$("#records").innerHTML='<p class="rejected">Registry unavailable.</p>';}
}
$("#signalForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const payload=Object.fromEntries(fd.entries());
  const box=$("#result"); box.innerHTML='<p class="note">Creating deterministic proof…</p>';
  try{
    const r=await fetch("/api/human-signal/contributions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const x=await r.json();
    if(!r.ok) throw new Error(x.error||"SUBMISSION_FAILED");
    box.innerHTML='<div class="record"><strong>Proof created</strong><p>'+esc(x.record.id)+'</p><p class="proof">'+esc(x.record.proofHash)+'</p><p class="note">Status: '+esc(x.record.status)+' · Off-chain proof v1</p></div>';
    e.currentTarget.reset(); load();
  }catch(err){box.innerHTML='<p class="rejected">'+esc(err.message)+'</p>';}
});
load();
})();