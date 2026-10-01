(async()=>{
  const meta=document.getElementById("meta");
  const totals=document.getElementById("totals");
  const days=document.getElementById("days");
  try{
    const r=await fetch("/api/community-metrics",{cache:"no-store"});
    const x=await r.json();
    if(!r.ok||!x.ok) throw new Error(x.error||"metrics unavailable");
    meta.innerHTML='<div class="card"><b>Metric class</b><div>'+x.metricClass+'</div><p>Unique humans claimed: <strong>NO</strong> · PII stored in metrics record: <strong>NO</strong></p><small>Updated: '+(x.updatedAt||"No events yet")+'</small></div>';
    const labels={
      home_view:"Homepage views",
      community_view:"Community hub views",
      community_x_click:"Community → X clicks",
      community_github_click:"Community → GitHub clicks",
      community_profile_click:"Community → Profile clicks",
      profile_view:"Profile views",
      whitepaper_view:"Whitepaper views",
      security_view:"Security evidence views",
      ambassador_view:"Ambassador page views",
      ambassador_x_click:"Ambassador → X clicks",
      analytics_view:"Analytics page views"
    };
    labels.open_review_view="Open Review views";
    totals.innerHTML=Object.entries(labels).map(([k,label])=>'<div class="card"><small>'+label+'</small><b>'+(x.totals?.[k]||0)+'</b></div>').join("");
    const sourceBox=document.createElement("div");
    sourceBox.innerHTML='<h2>Campaign sources</h2><div class="grid">'+Object.entries(x.sources||{}).map(([k,v])=>'<div class="card"><small>'+k+'</small><b>'+v+'</b></div>').join("")+'</div>';
    totals.parentElement.insertBefore(sourceBox,totals.nextSibling);
    const entries=Object.entries(x.days||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,30);
    days.innerHTML=entries.length?entries.map(([day,v])=>'<tr><td>'+day+'</td><td>'+(v.home_view||0)+'</td><td>'+(v.community_view||0)+'</td><td>'+(v.community_x_click||0)+'</td><td>'+(v.community_github_click||0)+'</td><td>'+(v.ambassador_view||0)+'</td></tr>').join(""):'<tr><td colspan="6">No aggregate events recorded yet.</td></tr>';
  }catch{
    meta.innerHTML='<div class="card warn">Community analytics unavailable.</div>';
  }
})();