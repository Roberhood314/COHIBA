(()=>{"use strict";
const $=s=>document.querySelector(s);
let authToken=localStorage.getItem("cohiba_human_signal_token")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,opts={}){
  const headers={...(opts.headers||{})};
  if(authToken) headers.authorization="Bearer "+authToken;
  return fetch(path,{...opts,headers});
}
async function loadIdentity(){
  try{
    if(authToken){
      const r=await api("/api/human-signal/me");
      if(r.ok){
        const x=await r.json(),p=x.profile;
        $("#identityState").innerHTML='<strong>'+esc(p.id)+'</strong><p class="note">Roles: '+esc((p.roles||[]).join(" · "))+'</p><p>Active days: '+esc(p.activeDays)+' · streak: '+esc(p.streak)+' · trust: '+esc(p.trustConnections)+'/5 · trust score: '+esc(p.trustScore)+'</p>';
        $("#dailySignal").disabled=false; $("#addTrust").disabled=false;
      }else{authToken="";localStorage.removeItem("cohiba_human_signal_token");}
    }
  }catch{}
  try{
    const r=await fetch("/api/human-signal/network"),x=await r.json();
    $("#networkState").innerHTML='<div class="stat">'+esc(x.profileCount||0)+'</div><span class="note">verified-wallet profiles</span><p>Active today: '+esc(x.activeToday||0)+'<br>Trust edges: '+esc(x.trustEdges||0)+'</p><p class="note">No token emission. Trust graph does not participate in Solana consensus.</p>';
  }catch{}
}
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
$("#connectWallet").addEventListener("click",async()=>{
  try{
    const provider=window.solana;
    if(!provider?.isPhantom) throw new Error("PHANTOM_WALLET_NOT_FOUND");
    const conn=await provider.connect();
    const wallet=conn.publicKey.toString();
    let r=await fetch("/api/human-signal/auth/challenge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({wallet})});
    let x=await r.json(); if(!r.ok) throw new Error(x.error||"CHALLENGE_FAILED");
    const encoded=new TextEncoder().encode(x.challenge.message);
    const signed=await provider.signMessage(encoded,"utf8");
    const bytes=signed.signature;
    let binary=""; for(const b of bytes) binary+=String.fromCharCode(b);
    const signature=btoa(binary);
    r=await fetch("/api/human-signal/auth/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challengeId:x.challenge.challengeId,signature})});
    x=await r.json(); if(!r.ok) throw new Error(x.error||"VERIFY_FAILED");
    authToken=x.token; localStorage.setItem("cohiba_human_signal_token",authToken);
    await loadIdentity();
  }catch(err){$("#identityState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';}
});
$("#dailySignal").addEventListener("click",async()=>{
  const r=await api("/api/human-signal/session",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#identityState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  await loadIdentity();
});
$("#addTrust").addEventListener("click",async()=>{
  const targetProfileId=$("#targetProfileId").value.trim();
  const r=await api("/api/human-signal/trust",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetProfileId})}); const x=await r.json();
  if(!r.ok) return $("#identityState").innerHTML+='<p class="rejected">'+esc(x.error)+'</p>';
  $("#targetProfileId").value=""; await loadIdentity();
});
load(); loadIdentity();
})();