export function allowedHumanSignalOrigins({canonical,publicBase,railwayDomain,extraOrigins=[]}){
 const origins=new Set();
 for(const value of [canonical,publicBase,railwayDomain?'https://'+railwayDomain.replace(/^https?:\/\//,''):null,...extraOrigins]){
  try{const url=new URL(value);if(['https:','http:'].includes(url.protocol))origins.add(url.origin);}catch{}
 }
 return origins;
}
export function requireHumanSignalOrigin(req,origins){
 const supplied=String(req.headers.origin||'');
 if(supplied){if(origins.has(supplied))return;throw Error('HUMAN_SIGNAL_ORIGIN_INVALID');}
 // Browsers omit Origin on same-origin GETs. Keep this exception read-only,
 // require Fetch Metadata and a referrer from the explicitly configured sites.
 if(req.method==='GET'&&req.headers['sec-fetch-site']==='same-origin'){
  try{if(origins.has(new URL(req.headers.referer).origin))return;}catch{}
 }
 throw Error('HUMAN_SIGNAL_ORIGIN_INVALID');
}
