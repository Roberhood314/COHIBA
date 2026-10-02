(()=>{"use strict";
const $=s=>document.querySelector(s);
const nf=new Intl.NumberFormat("vi-VN");
const dec=new Intl.NumberFormat("en-US",{maximumFractionDigits:8});
function set(id,v){const el=$("#"+id);if(el)el.textContent=v;}
async function load(){
  try{
    const r=await fetch("/api/community/mining-dashboard",{cache:"no-store"});
    const x=await r.json();
    if(!r.ok) throw new Error(x.error||"UNAVAILABLE");
    const t=x.totals||{};
    set("profiles",nf.format(t.profiles||0));
    set("phoneVerified",nf.format(t.phoneVerified||0));
    set("cohWalletActive",nf.format(t.cohWalletActive||0));
    set("activeMiners",nf.format(t.activeMiners||0));
    set("minersEver",nf.format(t.minersEver||0));
    set("pioneers",nf.format(t.pioneerProfiles||0));
    set("sessions",nf.format(t.miningSessions||0));
    set("humanVerified",nf.format(t.humanVerified||0));
    set("pendingCoh",dec.format(t.pendingCoh||0));
    set("signalPoints",dec.format(t.signalPoints||0));
    set("referrals",nf.format(t.referralAttributed||0));
    set("trust",nf.format(t.trustConnections||0));
    set("updated",new Date(x.generatedAt).toLocaleString("vi-VN"));
    const rows=x.growth||[],max=Math.max(1,...rows.map(d=>Number(d.newProfiles||0)));
    $("#growth").innerHTML=rows.map(d=>{
      const w=Math.round((Number(d.newProfiles||0)/max)*100);
      const label=String(d.day||"").slice(5).split("-").reverse().join("/");
      return '<div class="day"><span>'+label+'</span><div class="bar"><i style="width:'+w+'%"></i></div><b>'+nf.format(d.miningStarts||0)+'</b></div>';
    }).join("");
  }catch{
    $("#updated").textContent="Không tải được dữ liệu";
  }
}
load();setInterval(load,30000);
})();