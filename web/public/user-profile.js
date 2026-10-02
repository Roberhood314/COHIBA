(()=>{"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const token=localStorage.getItem("cohiba_human_signal_token")||"";
let profileLoading=false;
async function api(path){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    return await fetch(path,{
      headers:token?{authorization:"Bearer "+token}:{},
      cache:"no-store",
      signal:controller.signal
    });
  }finally{
    clearTimeout(timeout);
  }
}
function yes(v){return v?'<span class="ok">✓ Đạt</span>':'<span class="bad">Chưa đạt</span>'}
function fmt(v){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:8}):"0"}
function shortDate(v){if(!v)return "—";try{return new Date(v).toLocaleString("vi-VN")}catch{return String(v)}}

async function loadProfile(){
  if(profileLoading) return;
  if(!token){$("#loginRequired").style.display="block";$("#dashboard").style.display="none";return}
  profileLoading=true;
  const refresh=$("#refreshProfile");
  if(refresh){refresh.disabled=true;refresh.textContent="Đang tải…";}
  try{
    const r=await api("/api/human-signal/dashboard"),x=await r.json();
    if(!r.ok) throw new Error(x.error||"PROFILE_LOAD_FAILED");
    $("#loginRequired").style.display="none";$("#dashboard").style.display="block";
    const p=x.profile||{},m=x.mining||{},proof=x.humanProof||{},acc=x.accountStatus||{},mn=x.mainnet||{},cw=p.cohWallet||{},rate=m.currentRate||{};
    $("#pendingCoh").textContent=fmt(m.pendingCoh);
    $("#signalPoints").textContent=fmt(m.signalPoints);
    $("#activeDays").textContent=fmt(acc.activeDays);
    $("#trustCount").textContent=fmt(acc.trustConnections);
    $("#topStatus").innerHTML=
      '<span class="pill">'+esc(p.id||"—")+'</span>'+
      '<span class="pill '+(p.humanProofTier==="HUMAN_VERIFIED"?"ok":"muted")+'">'+esc(p.humanProofTier||"UNVERIFIED")+'</span>'+
      '<span class="pill '+(mn.eligible?"ok":"muted")+'">'+(mn.eligible?"MAINNET ELIGIBLE":"MAINNET "+esc(mn.reviewStatus||"PENDING"))+'</span>'+
      '<span class="pill">'+(m.activeSession?'<span class="ok">MINING ACTIVE</span>':'MINING IDLE')+'</span>';

    $("#identityBox").innerHTML=
      '<p><strong>Profile ID</strong><br><span class="wallet">'+esc(p.id||"—")+'</span></p>'+
      '<p><strong>Vai trò</strong><br>'+esc((p.roles||[]).join(" · ")||acc.networkRole||"SIGNALER")+'</p>'+
      '<p><strong>Tham gia từ</strong><br>'+esc(shortDate(acc.memberSince))+'</p>'+
      '<p><strong>Streak</strong> '+esc(acc.streak||0)+' ngày</p>';

    $("#walletBox").innerHTML=cw.activated
      ?'<p class="ok"><strong>COH Wallet Active</strong></p><p class="wallet">'+esc(cw.ownerAddress)+'</p><p class="muted">Non-custodial · Solana · '+esc(cw.phase||"PRE_MAINNET")+'</p><p>COHIBA không giữ private key và không thể khôi phục ví.</p>'
      :'<p class="bad">COH Wallet chưa kích hoạt.</p><a class="button" href="/human-signal.html#mining">Kích hoạt ví</a>';

    const c=proof.confidence||{};
    $("#proofBox").innerHTML=
      '<p><strong>'+esc(c.tier||"UNVERIFIED")+'</strong> · '+esc(c.score||0)+'/100</p>'+
      '<p>Điện thoại: '+yes(proof.phone?.verified)+'</p>'+
      '<p>Google: '+yes(proof.google?.verified)+'</p>'+
      '<p>Facebook: '+yes(proof.facebook?.verified)+'</p>'+
      '<p>Anti-bot: '+yes(proof.antiBot)+'</p>';

    $("#mainnetBox").innerHTML=
      '<p><strong>Review:</strong> '+esc(mn.reviewStatus||"PENDING")+'</p>'+
      '<p><strong>Eligibility:</strong> '+yes(mn.eligible)+'</p>'+
      '<p><strong>Distribution:</strong> '+esc(mn.distributionStatus||"NOT_ELIGIBLE")+'</p>'+
      '<p class="muted">'+esc(mn.note||"")+'</p>';

    $("#checklist").innerHTML=(x.checklist||[]).map(a=>
      '<div class="check"><span>'+esc(a.label)+(a.required?' <span class="muted">· bắt buộc</span>':'')+'</span><strong>'+(a.done?'<span class="ok">✓</span>':'<span class="bad">○</span>')+'</strong></div>'
    ).join("")||'<p class="empty">Chưa có checklist.</p>';

    const active=m.activeSession;
    $("#miningBox").innerHTML=active
      ?'<p class="ok"><strong>Phiên mining đang hoạt động</strong></p><p>Claimable hiện tại: <strong>'+esc(fmt(active.claimablePoints))+'</strong></p><p>Kết thúc: '+esc(shortDate(active.endsAt))+'</p><a class="button" href="/human-signal.html#mining">Mở mining</a>'
      :'<p class="muted">Chưa có phiên mining đang hoạt động.</p><a class="button" href="/human-signal.html#mining">KHAI THÁC COH NGAY</a>';
    $("#miningTech").innerHTML=
      '<p>Rate: '+esc(fmt(rate.rate))+' SP/hour · Base: '+esc(fmt(rate.baseRate))+'</p>'+
      '<p>Eligibility factor: '+esc(rate.eligibilityFactor??0)+' · Session count: '+esc(m.sessionCount||0)+'</p>'+
      '<p class="muted">Pending COH là provisional off-chain trước Mainnet, không phải COH SPL on-chain.</p>';

    const rows=(m.sessions||[]).map(s=>'<tr><td>'+esc(s.id)+'</td><td>'+esc(s.status)+'</td><td>'+esc(shortDate(s.startedAt))+'</td><td>'+esc(shortDate(s.endsAt))+'</td><td>'+esc(fmt(s.claimedPoints))+'</td><td>'+esc(fmt(s.rateSnapshot?.rate))+'</td></tr>').join("");
    $("#historyBox").innerHTML=rows
      ?'<table><thead><tr><th>Session</th><th>Trạng thái</th><th>Bắt đầu</th><th>Kết thúc</th><th>Đã claim</th><th>Rate</th></tr></thead><tbody>'+rows+'</tbody></table>'
      :'<p class="empty">Chưa có lịch sử mining.</p>';

    $("#networkBox").innerHTML=
      '<p>Verified contributions: <strong>'+esc(acc.verifiedContributions||0)+'</strong></p>'+
      '<p>Trust connections: <strong>'+esc(acc.trustConnections||0)+'</strong></p>'+
      '<p>Active days: <strong>'+esc(acc.activeDays||0)+'</strong></p>';

    const ps=x.pioneer||{};
    $("#pioneerBox").innerHTML=
      '<p><strong>'+esc(ps.eligibility?.status||"—")+'</strong></p>'+
      '<p>Referral code: <span class="wallet">'+esc(acc.referralCode||ps.referralCode||"—")+'</span></p>'+
      '<p>Invited by: '+esc(acc.invitedBy||"—")+'</p>'+
      '<p>Verified referrals: '+esc(ps.verifiedReferrals||0)+'</p>';
  }catch(err){
    const message=err?.name==="AbortError"?"Kết nối chậm. Hãy thử làm mới hồ sơ.":String(err?.message||err);
    $("#loginRequired").style.display="block";
    $("#loginRequired").innerHTML='<h2>Không tải được hồ sơ</h2><p class="bad">'+esc(message)+'</p><button id="retryProfile" class="button" type="button">Thử lại</button> <a class="button ghost" href="/human-signal.html#mining">Mở Human Signal</a>';
    $("#dashboard").style.display="none";
    $("#retryProfile")?.addEventListener("click",loadProfile,{once:true});
  }finally{
    profileLoading=false;
    if(refresh){refresh.disabled=false;refresh.textContent="Làm mới";}
  }
}
$("#refreshProfile").addEventListener("click",loadProfile);
loadProfile();
})();