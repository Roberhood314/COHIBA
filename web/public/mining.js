(()=>{"use strict";
const $=s=>document.querySelector(s);
const token=localStorage.getItem("cohiba_human_signal_token")||"";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(v,d=8)=>Number(v||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:d});
let state=null,timer=null,serverLoadedAt=Date.now();
const referralParam=new URLSearchParams(location.search).get("ref");
if(referralParam && /^HS-[A-F0-9]{10}$/i.test(referralParam)){
  localStorage.setItem("cohiba_pending_referral",referralParam.toUpperCase());
}
async function api(path,opts={}){const headers={...(opts.headers||{})};if(token)headers.authorization="Bearer "+token;return fetch(path,{...opts,headers,cache:"no-store"});}
function renderBoosts(rate={}){
 const m=rate.multipliers||{};
 const rows=[["Pioneer",m.pioneer],["Trust",m.trust],["Streak",m.streak],["Contribution",m.contribution],["Utility",m.utility],["Referral",m.growth]];
 $("#boosts").innerHTML=rows.map(([n,v])=>'<div class="boost"><b>'+esc(n)+'</b><small>+'+esc(Math.round(Number(v||0)*100))+'%</small></div>').join("");
 $("#techState").textContent=
  "Rate = Base(N) × TotalMultiplier × Eligibility\n"+
  "Base(N) = 1 / √(1 + N/10,000)\n"+
  "Multiplier cap = "+String(rate.multiplierCap??2.5)+"×\n"+
  "Base rate = "+String(rate.baseRate||0)+"\n"+
  "Total multiplier = "+String(rate.totalMultiplier||0)+"\n"+
  "Eligibility = "+String(rate.eligibilityFactor??0)+"\n"+
  "Final rate = "+String(rate.rate||0)+" Pending COH/hour";
}
function render(){
 if(!state)return;
 const {profile={},currentRate={},rateUnits={},reserve={},session}=state;
 $("#perHour").textContent=fmt(rateUnits.perHour,8)+" COH";
 $("#perMinute").textContent=fmt(rateUnits.perMinute,10)+" COH";
 $("#perSecond").textContent=fmt(rateUnits.perSecond,12)+" COH";
 $("#totalSupply").textContent=fmt(reserve.totalSupplyFixed,0);
 $("#communityAllocation").textContent=fmt(reserve.communityAllocation,0);
 $("#pendingAllocated").textContent=fmt(reserve.pendingAllocated,8);
 $("#reserveRemaining").textContent=fmt(reserve.miningReserveRemaining,2)+" COH";
 $("#reserveRemaining2").textContent=fmt(reserve.miningReserveRemaining,8);
 renderBoosts(currentRate);
 $("#heroStatus").innerHTML='<span class="pill ok">'+(session?"MINING ACTIVE":"READY")+'</span><span class="pill">Pending COH: '+fmt(profile.pendingCoh,8)+'</span><span class="pill">'+(profile.pioneer?"PIONEER":"COMMUNITY MINER")+'</span>';
 $("#startBtn").disabled=Boolean(session);
 $("#claimBtn").disabled=!session;
 updateTicker();
}
function updateTicker(){
 if(!state)return;
 const session=state.session;
 const basePending=Number(state.profile?.pendingCoh||0);
 if(!session){
   $("#liveCounter").innerHTML=fmt(basePending,8)+' <small>Pending COH</small>';
   $("#sessionProgress").style.width="0%";
   $("#sessionTime").textContent="Chưa có phiên mining.";
   $("#timeLeft").textContent="—";
   return;
 }
 const now=Date.now();
 const started=Date.parse(session.startedAt),ends=Date.parse(session.endsAt),last=Date.parse(session.lastClaimAt||session.startedAt);
 const elapsedSinceLoad=(now-serverLoadedAt)/1000;
 const liveClaimable=Number(session.claimablePoints||0)+(Number(state.rateUnits?.perSecond||0)*elapsedSinceLoad);
 const capped=Math.min(liveClaimable,Math.max(0,(ends-last)/1000)*Number(state.rateUnits?.perSecond||0));
 $("#liveCounter").innerHTML=fmt(basePending+capped,8)+' <small>Pending COH</small>';
 const pct=Math.max(0,Math.min(100,((now-started)/(ends-started))*100));
 $("#sessionProgress").style.width=pct+"%";
 const left=Math.max(0,ends-now);
 const h=Math.floor(left/3600000),m=Math.floor((left%3600000)/60000),s=Math.floor((left%60000)/1000);
 $("#sessionTime").textContent="Phiên đang hoạt động · "+fmt(session.claimablePoints,8)+" claimable";
 $("#timeLeft").textContent=h+"h "+m+"m "+s+"s";
}
async function loadGrowthState(){
  if(!token)return;
  try{
    const r=await api("/api/human-signal/pioneer"),x=await r.json();
    if(!r.ok)return;
    const s=x.support||{};
    const code=s.referralCode||"";
    const link=code?location.origin+"/mining.html?ref="+encodeURIComponent(code):"—";
    if($("#inviteLink"))$("#inviteLink").textContent=link;
    if($("#verifiedReferrals"))$("#verifiedReferrals").textContent=String(s.verifiedReferrals||0);
    if($("#referralBoost"))$("#referralBoost").textContent="+"+Math.round(Number(s.referralBoost||0)*100)+"%";
    const rate=x.miningRate||{};
    const trust=Math.round(Number(rate.multipliers?.trust||0)*100);
    if($("#securityCircleCount"))$("#securityCircleCount").textContent=Math.min(5,Math.round(trust/8))+" / 5";
  }catch{}
}
async function applyPendingReferral(){
  const code=localStorage.getItem("cohiba_pending_referral");
  if(!token||!code)return;
  try{
    const r=await api("/api/human-signal/referral/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code})});
    const x=await r.json();
    if(r.ok || x.error==="REFERRAL_ALREADY_ATTRIBUTED") localStorage.removeItem("cohiba_pending_referral");
  }catch{}
}
async function load(){
 if(!token){
   $("#heroStatus").innerHTML='<span class="pill bad">CHƯA ĐĂNG NHẬP</span>';
   $("#startBtn").textContent="XÁC MINH VÍ TRƯỚC";
   $("#startBtn").onclick=()=>location.href="/human-signal.html#quickMiningStart";
   return;
 }
 const r=await api("/api/human-signal/mining/status"),x=await r.json();
 if(!r.ok)throw new Error(x.error||"MINING_STATUS_FAILED");
 state=x;serverLoadedAt=Date.now();render(); await applyPendingReferral(); await loadGrowthState();
 if(timer)clearInterval(timer);timer=setInterval(updateTicker,1000);
}
$("#copyInvite")?.addEventListener("click",async()=>{
  const link=$("#inviteLink")?.textContent||"";
  if(!link||link==="—")return;
  try{await navigator.clipboard.writeText(link);$("#copyInvite").textContent="ĐÃ SAO CHÉP";setTimeout(()=>$("#copyInvite").textContent="SAO CHÉP LINK MỜI",1500);}catch{}
});
$("#addSecurityCircle")?.addEventListener("click",async()=>{
  const targetProfileId=$("#securityProfileId")?.value.trim();
  if(!targetProfileId)return;
  const r=await api("/api/human-signal/trust",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetProfileId})});
  const x=await r.json();
  if(!r.ok)return alert(x.error||"SECURITY_CIRCLE_FAILED");
  $("#securityProfileId").value="";
  await load();
});
$("#startBtn").addEventListener("click",async()=>{
 if(!token)return;
 const r=await api("/api/human-signal/mining/start",{method:"POST"}),x=await r.json();
 if(!r.ok)return alert(x.error||"MINING_START_FAILED");
 await load();
});
$("#claimBtn").addEventListener("click",async()=>{
 const r=await api("/api/human-signal/mining/claim",{method:"POST"}),x=await r.json();
 if(!r.ok)return alert(x.error||"MINING_CLAIM_FAILED");
 await load();
});
load().catch(err=>{$("#heroStatus").innerHTML='<span class="pill bad">'+esc(err.message)+'</span>';});
})();