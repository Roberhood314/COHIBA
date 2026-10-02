(()=>{"use strict";
const $=s=>document.querySelector(s);
let authToken=localStorage.getItem("cohiba_human_signal_token")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,opts={}){
  const headers={...(opts.headers||{})};
  if(authToken) headers.authorization="Bearer "+authToken;
  return fetch(path,{...opts,headers});
}
async function loadPioneer(){
  try{
    const rr=await fetch("/api/human-signal/readiness"),ready=await rr.json();
    $("#readinessState").innerHTML=
      '<p>Mining mode: <strong>'+esc(ready.miningHumanProofMode||"grace")+'</strong></p>'+
      '<p class="note">Phone '+(ready.providers?.phone?"✓":"—")+' · Google '+(ready.providers?.google?"✓":"—")+' · Facebook '+(ready.providers?.facebook?"✓":"—")+' · Identity pepper '+(ready.providers?.pepper?"✓":"—")+'</p>'+
      ((ready.missing||[]).length?'<p class="rejected">External configuration pending: '+esc((ready.missing||[]).join(", "))+'</p>':'<p class="verified">Verification infrastructure ready.</p>');
  }catch{}
  if(!authToken) return;
  try{
    const r=await api("/api/human-signal/pioneer"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"PIONEER_STATUS_FAILED");
    const s=x.support||{},e=s.eligibility||{},rate=x.miningRate||{};
    $("#pioneerState").innerHTML=
      '<strong>'+(e.status?esc(e.status):"—")+'</strong>'+
      '<p>Mining eligibility factor: '+esc(rate.eligibilityFactor??e.factor??0)+' · current rate '+esc(rate.rate||0)+' SP/h</p>'+
      '<p class="note">Human Proof: '+esc(e.humanProofTier||"UNVERIFIED")+' · verified referrals '+esc(s.verifiedReferrals||0)+' · referral boost '+esc(Math.round((s.referralBoost||0)*100))+'%</p>';
    $("#pioneerChecklist").innerHTML=(s.checklist||[]).map(c=>'<div class="record">'+(c.done?'<span class="verified">✓</span>':'<span>○</span>')+' '+esc(c.label)+(c.required?' <span class="badge">required</span>':'')+'</div>').join("");
    $("#pioneerMissions").innerHTML=(s.missions||[]).map(m=>'<div class="record"><strong>'+esc(m.title)+'</strong> '+(m.complete?'<span class="verified">✓</span>':'')+'<p class="note">'+esc(m.description)+' · '+esc(m.progress)+'/'+esc(m.target)+'</p></div>').join("");
    $("#referralCode").textContent=s.referralCode||"—";
    $("#applyReferral").disabled=false;
  }catch(err){$("#pioneerState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';}
}
async function loadProviderReadiness(){
  try{
    const r=await fetch("/api/human-proof/readiness"),x=await r.json();
    if(!r.ok) return;
    const p=x.providers||{};
    $("#sendOtp").disabled=!authToken||!p.phone;
    $("#checkOtp").disabled=!authToken||!p.phone;
    $("#verifyGoogle").disabled=!authToken||!p.google;
    $("#verifyFacebook").disabled=!authToken||!p.facebook;
    const missing=[];
    if(!p.phone) missing.push("Phone OTP");
    if(!p.google) missing.push("Google");
    if(!p.facebook) missing.push("Facebook");
    if(missing.length){
      $("#humanProofState").innerHTML+='<p class="note">Provider pending: '+esc(missing.join(" · "))+'</p>';
    }
  }catch{}
}
async function loadHumanProof(){
  if(!authToken){
    $("#sendOtp").disabled=true; $("#checkOtp").disabled=true; $("#verifyGoogle").disabled=true; $("#verifyFacebook").disabled=true;
    return;
  }
  try{
    const r=await api("/api/human-proof/status"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"HUMAN_PROOF_STATUS_FAILED");
    const p=x.proof||{},c=p.confidence||{};
    $("#humanProofState").innerHTML='<strong>'+esc(c.tier||"UNVERIFIED")+'</strong><p>Confidence: '+esc(c.score||0)+'/100</p><p class="note">Phone '+(p.phone?.verified?"✓":"—")+' · Google '+(p.google?.verified?"✓":"—")+' · Facebook '+(p.facebook?.verified?"✓":"—")+' · Anti-bot '+(p.antiBot?"✓":"—")+'</p>';
    await loadProviderReadiness();
  }catch(err){$("#humanProofState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';}
}
async function loadAdsConfig(){
  try{
    const r=await fetch("/api/ads/config"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"ADS_CONFIG_FAILED");
    const state=$("#adRevenueState");
    if(!x.configured){
      state.innerHTML='<span class="note">ADS_PROVIDER_PENDING — Google AdSense publisher account not connected yet.</span>';
      return;
    }
    state.innerHTML='<strong>Google AdSense connected</strong><p class="note">Revenue payout is managed by Google. COHIBA stores no bank credentials. Ads do not affect Pending COH.</p>';
    if(!document.querySelector('script[data-cohiba-adsense]')){
      const sc=document.createElement("script");
      sc.async=true;
      sc.crossOrigin="anonymous";
      sc.dataset.cohibaAdsense="1";
      sc.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="+encodeURIComponent(x.publisherId);
      document.head.appendChild(sc);
    }
    if(x.slotId){
      const box=$("#cohibaAdSlot");
      box.innerHTML='<ins class="adsbygoogle" style="display:block" data-ad-client="'+esc(x.publisherId)+'" data-ad-slot="'+esc(x.slotId)+'" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{}
    }
  }catch(err){
    $("#adRevenueState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';
  }
}

async function loadEconomy(){
  try{
    const r=await fetch("/api/economy/status"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"ECONOMY_STATUS_FAILED");
    const m=x.mining||{},c=x.coh||{};
    $("#economyState").innerHTML=
      '<strong>'+esc(x.phase||"PRE_MAINNET")+'</strong>'+
      '<p>Mining asset: <span class="verified">'+esc(m.asset||"SP")+' · '+esc(m.name||"Signal Points")+'</span></p>'+
      '<p class="note">Sellable '+(m.sellable?"YES":"NO")+' · Transferable '+(m.transferable?"YES":"NO")+' · Tradable '+(m.tradable?"YES":"NO")+' · COH emission '+(m.cohEmission?"YES":"NO")+'</p>'+
      '<p class="'+(c.tradingAllowed?"verified":"note")+'">'+esc(x.notice||"")+'</p>';
  }catch(err){
    $("#economyState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';
  }
}

async function syncQuickMiningUi(){
  const btn=$("#quickMiningButton"),status=$("#quickMiningStatus");
  if(!btn||!status) return;
  if(!authToken){
    btn.textContent="XÁC MINH VÍ ĐỂ KHAI THÁC";
    status.innerHTML='<span class="note">Chưa xác minh ví.</span>';
    btn.disabled=false;
    return;
  }
  try{
    const r=await api("/api/human-signal/mining/status"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"MINING_STATUS_FAILED");
    const s=x.session,p=x.profile||{};
    if(s){
      btn.textContent="XEM PHIÊN KHAI THÁC";
      status.innerHTML='<span class="verified">Đang khai thác</span><span class="note">Pending COH: '+esc(p.pendingCoh||0)+'</span>';
    }else{
      btn.textContent="KHAI THÁC COH NGAY";
      status.innerHTML='<span class="verified">Sẵn sàng</span><span class="note">Pending COH: '+esc(p.pendingCoh||0)+'</span>';
    }
  }catch(err){
    status.innerHTML='<span class="rejected">'+esc(err.message)+'</span>';
  }
}

async function loadMining(){
  if(!authToken){
    $("#startMining").disabled=true; $("#claimMining").disabled=true;
    return;
  }
  try{
    const r=await api("/api/human-signal/mining/status"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"MINING_STATUS_FAILED");
    const p=x.profile||{},rate=x.currentRate||{},s=x.session;
    $("#miningState").innerHTML=
      '<strong>'+esc(p.pioneer?"PIONEER":"COMMUNITY MINER")+'</strong>'+
      '<p>Pending COH: <span class="verified">'+esc(p.pendingCoh||0)+'</span></p>'+
      (s?'<p class="verified">Phiên mining đang hoạt động</p><p>Claimable: '+esc(s.claimablePoints||0)+'</p><p class="note">Kết thúc: '+esc(s.endsAt)+'</p>':'<p class="note">Chưa có phiên mining đang hoạt động.</p>');
    const tech=$("#miningTechState");
    if(tech) tech.innerHTML=
      '<p>Signal Points: '+esc(p.signalPoints||0)+' SP</p>'+
      '<p>Rate: '+esc(rate.rate||0)+' SP/hour · Base '+esc(rate.baseRate||0)+'</p>'+
      '<p class="note">Pioneer +'+esc(Math.round((rate.multipliers?.pioneer||0)*100))+'% · Trust +'+esc(Math.round((rate.multipliers?.trust||0)*100))+'% · Streak +'+esc(Math.round((rate.multipliers?.streak||0)*100))+'% · Contribution +'+esc(Math.round((rate.multipliers?.contribution||0)*100))+'% · Utility +'+esc(Math.round((rate.multipliers?.utility||0)*100))+'% · Growth +'+esc(Math.round((rate.multipliers?.growth||0)*100))+'% · Eligibility ×'+esc(rate.eligibilityFactor??1)+'</p>';
    $("#startMining").disabled=Boolean(s);
    $("#claimMining").disabled=!s;
  }catch(err){
    $("#miningState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';
  }
}
async function loadIdentity(){
  try{
    if(authToken){
      const r=await api("/api/human-signal/me");
      if(r.ok){
        const x=await r.json(),p=x.profile;
        $("#identityState").innerHTML='<strong>'+esc(p.id)+'</strong><p class="note">Roles: '+esc((p.roles||[]).join(" · "))+'</p><p>Human Proof: <strong>'+esc(p.humanProofTier||"UNVERIFIED")+'</strong> · Mainnet review: <strong>'+esc(p.mainnetReviewStatus||"PENDING")+'</strong> · Eligible: '+(p.mainnetEligible?"YES":"NO")+'</p><p>Active days: '+esc(p.activeDays)+' · streak: '+esc(p.streak)+' · trust: '+esc(p.trustConnections)+'/5 · trust score: '+esc(p.trustScore)+'</p>';
        const cw=p.cohWallet||{},mn=p.mining||{};
        $("#cohWalletState").innerHTML=cw.activated
          ?'<strong>COH Wallet Active</strong><p class="proof">'+esc(cw.ownerAddress)+'</p><p>Pending COH: <span class="verified">'+esc(mn.pendingCoh||0)+'</span></p><p class="note">Custody '+esc(cw.custody)+' · '+esc(cw.phase)+' · not transferable before Mainnet.</p>'
          :'<span class="note">COH Wallet not activated.</span>';
        $("#activateCohWallet").disabled=Boolean(cw.activated);
        $("#dailySignal").disabled=false; $("#addTrust").disabled=false; $("#startMining").disabled=false; $("#sendOtp").disabled=false; $("#checkOtp").disabled=false; $("#verifyGoogle").disabled=false; $("#verifyFacebook").disabled=false;
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
    const r=await api("/api/human-signal/contributions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
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
    await loadIdentity(); await loadMining(); await loadPioneer();
  }catch(err){$("#identityState").innerHTML='<p class="rejected">'+esc(err.message)+'</p>';}
});
$("#activateCohWallet").addEventListener("click",async()=>{
  const r=await api("/api/human-signal/wallet/activate",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#cohWalletState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  await loadIdentity(); await loadMining();
});
$("#dailySignal").addEventListener("click",async()=>{
  const r=await api("/api/human-signal/session",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#identityState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  await loadIdentity();
});
$("#sendOtp").addEventListener("click",async()=>{
  const phone=$("#phoneNumber").value.trim(),consent=$("#phoneConsent").checked;
  const r=await api("/api/human-proof/phone/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone,consent})}); const x=await r.json();
  $("#humanProofState").innerHTML=r.ok?'<p class="verified">OTP sent.</p>':'<p class="rejected">'+esc(x.error)+'</p>';
});
$("#checkOtp").addEventListener("click",async()=>{
  const phone=$("#phoneNumber").value.trim(),code=$("#otpCode").value.trim();
  const r=await api("/api/human-proof/phone/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone,code})}); const x=await r.json();
  if(!r.ok) return $("#humanProofState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  await loadHumanProof();
});
$("#verifyGoogle").addEventListener("click",async()=>{
  const r=await api("/api/human-proof/google/start",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#humanProofState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  location.href=x.authUrl;
});
$("#verifyFacebook").addEventListener("click",async()=>{
  const r=await api("/api/human-proof/facebook/start",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#humanProofState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  location.href=x.authUrl;
});
$("#applyReferral").addEventListener("click",async()=>{
  const code=$("#referralInput").value.trim();
  const r=await api("/api/human-signal/referral/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code})});
  const x=await r.json();
  if(!r.ok) return $("#pioneerState").innerHTML+='<p class="rejected">'+esc(x.error)+'</p>';
  $("#referralInput").value=""; await loadPioneer();
});
$("#quickMiningButton").addEventListener("click",async()=>{
  if(!authToken){
    $("#connectWallet").scrollIntoView({behavior:"smooth",block:"center"});
    $("#connectWallet").focus();
    return;
  }
  try{
    const r=await api("/api/human-signal/mining/status"),x=await r.json();
    if(r.ok && x.session){
      $("#mining").scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    const sr=await api("/api/human-signal/mining/start",{method:"POST"}),sx=await sr.json();
    if(!sr.ok) throw new Error(sx.error||"MINING_START_FAILED");
    await loadMining(); await syncQuickMiningUi();
    $("#mining").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){
    $("#quickMiningStatus").innerHTML='<span class="rejected">'+esc(err.message)+'</span>';
  }
});
$("#startMining").addEventListener("click",async()=>{
  const r=await api("/api/human-signal/mining/start",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#miningState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  await loadMining(); await syncQuickMiningUi();
});
$("#claimMining").addEventListener("click",async()=>{
  const r=await api("/api/human-signal/mining/claim",{method:"POST"}); const x=await r.json();
  if(!r.ok) return $("#miningState").innerHTML='<p class="rejected">'+esc(x.error)+'</p>';
  await loadMining(); await syncQuickMiningUi();
});
$("#addTrust").addEventListener("click",async()=>{
  const targetProfileId=$("#targetProfileId").value.trim();
  const r=await api("/api/human-signal/trust",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetProfileId})}); const x=await r.json();
  if(!r.ok) return $("#identityState").innerHTML+='<p class="rejected">'+esc(x.error)+'</p>';
  $("#targetProfileId").value=""; await loadIdentity();
});
load(); loadIdentity(); loadAdsConfig(); loadEconomy(); loadMining(); syncQuickMiningUi(); loadHumanProof(); loadProviderReadiness(); loadPioneer();
})();