(()=>{
  const path=location.pathname;
  const pageEvent={
    "/":"home_view",
    "/community.html":"community_view",
    "/profile.html":"profile_view",
    "/whitepaper.html":"whitepaper_view",
    "/security.html":"security_view",
    "/ambassadors.html":"ambassador_view",
    "/analytics.html":"analytics_view",
    "/open-review.html":"open_review_view"
  }[path];

  const params=new URLSearchParams(location.search);
  const rawSource=params.get("utm_source")||"direct";
  const allowedSources=new Set(["direct","x","solana-discord","reddit","github","security-outreach","creator-outreach","other"]);
  const source=allowedSources.has(rawSource)?rawSource:"other";

  const send=(event)=>{
    if(!event) return;
    try{
      const key="cohiba:event:"+event;
      if(sessionStorage.getItem(key)==="1") return;
      sessionStorage.setItem(key,"1");
    }catch{}
    fetch("/api/community-event",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({event,source}),
      keepalive:true
    }).catch(()=>{});
  };

  send(pageEvent);

  document.addEventListener("click",e=>{
    const el=e.target.closest("[data-community-event]");
    if(el) send(el.getAttribute("data-community-event"));
  });
})();