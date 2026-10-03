(()=>{"use strict";
const $=s=>document.querySelector(s);
let authToken=localStorage.getItem("cohiba_human_signal_token")||"";
let onboardingId=localStorage.getItem("cohiba_onboarding_id")||"";
let onboardingToken=localStorage.getItem("cohiba_onboarding_token")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,opts={}){
  const headers={...(opts.headers||{})};
  if(authToken) headers.authorization="Bearer "+authToken;
  return fetch(path,{...opts,headers});
}
function normalizePhoneInput(value){
  let raw=String(value||"").trim().replace(/[\s()-]/g,"");
  // Vietnam convenience: 09xxxxxxxx -> +849xxxxxxxx, 84xxxxxxxxx -> +84xxxxxxxxx.
  if(/^0\d{9}$/.test(raw)) raw="+84"+raw.slice(1);
  else if(/^84\d{9}$/.test(raw)) raw="+"+raw;
  if(!/^\+[1-9]\d{7,14}$/.test(raw)) throw new Error("Số điện thoại chưa đúng. Hãy nhập dạng +84901234567.");
  return raw;
}
function setOnboardingState(html){const el=$("#accountOnboardingState");if(el)el.innerHTML=html;}
function restoreOnboardingUi(){
  if(onboardingToken){
    $("#accountStep1").style.display="none";
    $("#accountStep2").style.display="none";
    $("#accountStep3").style.display="block";
    setOnboardingState('<span class="verified">Số điện thoại đã xác minh. Hãy đặt tên tài khoản.</span>');
  }else if(onboardingId){
    $("#accountStep1").style.display="none";
    $("#accountStep2").style.display="block";
    $("#accountStep3").style.display="none";
    setOnboardingState('<span class="verified">OTP đã gửi. Hãy nhập mã xác minh.</span>');
  }
}
function phantomBrowseUrl(){
  const target=location.origin+"/human-signal.html?wallet=verify";
  return "https://phantom.app/ul/browse/"+encodeURIComponent(target);
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
  await loadAgency();
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
$("#onboardSendOtp")?.addEventListener("click",async()=>{
  const consent=$("#onboardConsent").checked;
  setOnboardingState('<span class="note">Đang kiểm tra số điện thoại…</span>');
  try{
    const phone=normalizePhoneInput($("#onboardPhone").value);
    $("#onboardPhone").value=phone;
    if(!consent) throw new Error("Bạn cần đồng ý nhận SMS OTP để tiếp tục.");
    setOnboardingState('<span class="note">Đang gửi OTP…</span>');
    const r=await fetch("/api/account/onboarding/phone/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone,consent})});
    const x=await r.json(); if(!r.ok) throw new Error(x.error||"OTP_SEND_FAILED");
    onboardingId=x.onboardingId; localStorage.setItem("cohiba_onboarding_id",onboardingId);
    $("#accountStep1").style.display="none";$("#accountStep2").style.display="block";
    setOnboardingState('<span class="verified">OTP đã được gửi.</span>');
  }catch(err){setOnboardingState('<span class="rejected">'+esc(err.message)+'</span>');}
});
$("#onboardCheckOtp")?.addEventListener("click",async()=>{
  const code=$("#onboardOtp").value.trim();
  setOnboardingState('<span class="note">Đang xác minh OTP…</span>');
  try{
    const phone=normalizePhoneInput($("#onboardPhone").value);
    const r=await fetch("/api/account/onboarding/phone/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone,code,onboardingId})});
    const x=await r.json(); if(!r.ok) throw new Error(x.error||"OTP_VERIFY_FAILED");
    onboardingToken=x.onboardingToken;localStorage.setItem("cohiba_onboarding_token",onboardingToken);
    $("#accountStep2").style.display="none";$("#accountStep3").style.display="block";
    setOnboardingState('<span class="verified">Số điện thoại đã xác minh ✓</span>');
  }catch(err){setOnboardingState('<span class="rejected">'+esc(err.message)+'</span>');}
});
$("#onboardCreateProfile")?.addEventListener("click",async()=>{
  const displayName=$("#onboardName").value.trim();
  const password=$("#onboardPassword").value;
  const button=$("#onboardCreateProfile");button.disabled=true;
  setOnboardingState('<span class="note">Đang tạo tài khoản…</span>');
  try{
    if(password!==$("#onboardPasswordConfirm").value) throw new Error("Mật khẩu nhập lại chưa khớp.");
    if(password.length<8 || password.length>128 || !/[\p{L}]/u.test(password) || !/\d/.test(password)) throw new Error("Mật khẩu cần 8–128 ký tự, gồm chữ và số.");
    const r=await fetch("/api/account/onboarding/profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({displayName,password,onboardingToken})});
    const x=await r.json();if(!r.ok)throw new Error(x.error||"PROFILE_CREATE_FAILED");
    if(x.token){authToken=x.token;localStorage.setItem("cohiba_human_signal_token",authToken);}
    onboardingId="";onboardingToken="";
    localStorage.removeItem("cohiba_onboarding_id");localStorage.removeItem("cohiba_onboarding_token");
    $("#onboardPassword").value="";$("#onboardPasswordConfirm").value="";
    setOnboardingState('<span class="verified">Tài khoản đã tạo và số điện thoại đã xác minh ✓ Bây giờ hãy kết nối ví COH.</span>');
    $("#accountStep3").style.display="none";
    $("#connectWallet").scrollIntoView({behavior:"smooth",block:"center"});
  }catch(err){setOnboardingState('<span class="rejected">'+esc(err.message)+'</span>');}
  finally{button.disabled=false;}
});
$("#connectWallet").addEventListener("click",async()=>{
  try{
    const provider=window.solana;
    if(!provider?.isPhantom){
      location.href=phantomBrowseUrl();
      return;
    }
    const conn=await provider.connect();
    const wallet=conn.publicKey.toString();
    let r=await api("/api/human-signal/auth/challenge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({wallet})});
    let x=await r.json(); if(!r.ok) throw new Error(x.error||"CHALLENGE_FAILED");
    const encoded=new TextEncoder().encode(x.challenge.message);
    const signed=await provider.signMessage(encoded,"utf8");
    const bytes=signed.signature;
    let binary=""; for(const b of bytes) binary+=String.fromCharCode(b);
    const signature=btoa(binary);
    r=await api("/api/human-signal/auth/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challengeId:x.challenge.challengeId,signature,onboardingToken})});
    x=await r.json(); if(!r.ok) throw new Error(x.error||"VERIFY_FAILED");
    authToken=x.token; localStorage.setItem("cohiba_human_signal_token",authToken);
    localStorage.removeItem("cohiba_onboarding_id");
    localStorage.removeItem("cohiba_onboarding_token");
    onboardingId=""; onboardingToken="";
    setOnboardingState('<span class="verified">Ví đã xác minh và COH Wallet đã kích hoạt ✓</span>');
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
  const phone=normalizePhoneInput($("#phoneNumber").value),consent=$("#phoneConsent").checked;
  const r=await api("/api/human-proof/phone/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone,consent})}); const x=await r.json();
  $("#humanProofState").innerHTML=r.ok?'<p class="verified">OTP sent.</p>':'<p class="rejected">'+esc(x.error)+'</p>';
});
$("#checkOtp").addEventListener("click",async()=>{
  const phone=normalizePhoneInput($("#phoneNumber").value),code=$("#otpCode").value.trim();
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
async function loadAgency(){
  const enabled=Boolean(authToken);
  $("#agentForm button").disabled=!enabled; $("#delegationForm button").disabled=true;
  if(!enabled){$("#agencyState").textContent="Kết nối và xác minh ví để quản lý tác nhân.";$("#agencyAgent").innerHTML="";$("#agencyDelegations").innerHTML="";return;}
  try{
    const r=await api("/api/hsc/agency"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"AGENCY_LOAD_FAILED");
    $("#agencyState").textContent=x.agents.length+" tác nhân · quyền được ghi nhận trong Human Signal.";
    $("#agencyAgent").innerHTML=x.agents.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");
    $("#delegationForm button").disabled=!x.agents.length;
    const names=new Map(x.agents.map(a=>[a.id,a.name]));
    $("#agencyDelegations").innerHTML=x.delegations.slice().reverse().map(d=>'<div class="record"><strong>'+esc(names.get(d.agentId)||d.agentId)+'</strong> · '+esc(d.status)+'<p>'+esc(d.scopes.join(", "))+'</p><p class="note">Hết hạn: '+esc(new Date(d.expiresAt).toLocaleString())+'</p>'+(d.status==="ACTIVE"?'<button type="button" data-revoke="'+esc(d.id)+'">Thu hồi quyền</button>':'')+'</div>').join("");
  }catch(err){$("#agencyState").textContent=err.message;$("#agencyAgent").innerHTML="";$("#agencyDelegations").innerHTML="";$("#agentForm button").disabled=true;}
}
async function agencyWrite(path,body){
  const r=await api(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),x=await r.json();
  if(!r.ok) throw new Error(x.error||"AGENCY_UPDATE_FAILED");
  await loadAgency();
}
$("#agentForm").addEventListener("submit",async e=>{
  e.preventDefault(); const button=e.currentTarget.querySelector("button");button.disabled=true;
  try{await agencyWrite("/api/hsc/agency/agents",{name:$("#agentName").value});$("#agentName").value="";}
  catch(err){$("#agencyState").textContent=err.message;}finally{button.disabled=!authToken;}
});
$("#delegationForm").addEventListener("submit",async e=>{
  e.preventDefault();const button=e.currentTarget.querySelector("button");button.disabled=true;
  try{await agencyWrite("/api/hsc/agency/grant",{agentId:$("#agencyAgent").value,scopes:[$("#agencyScope").value],expiresAt:new Date(Date.now()+Number($("#agencyHours").value)*3600000).toISOString()});}
  catch(err){$("#agencyState").textContent=err.message;}finally{button.disabled=!authToken||!$("#agencyAgent").value;}
});
$("#agencyDelegations").addEventListener("click",async e=>{
  const button=e.target.closest("button[data-revoke]");if(!button)return;button.disabled=true;
  try{await agencyWrite("/api/hsc/agency/revoke",{delegationId:button.dataset.revoke});}
  catch(err){$("#agencyState").textContent=err.message;button.disabled=false;}
});
restoreOnboardingUi(); load(); loadIdentity(); loadAdsConfig(); loadEconomy(); loadMining(); syncQuickMiningUi(); loadHumanProof(); loadProviderReadiness(); loadPioneer();
})();