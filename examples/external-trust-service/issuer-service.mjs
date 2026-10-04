import http from 'node:http';
// Issuer is a separate authority/operator; verifier pins its key independently.
export function createIssuerService(authorityIssuer){
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try{
   if(req.method!=='POST'||req.url!=='/status'){reply(404,{error:'NOT_FOUND'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw Error('REQUEST_TOO_LARGE');}
   const input=JSON.parse(body);if(!input||Object.keys(input).sort().join(',')!=='audience,challenge,proof')throw Error('INVALID_REQUEST');
   reply(200,{bundle:await authorityIssuer.issue(input)});
  }catch(e){reply(e.message==='REQUEST_TOO_LARGE'?413:403,{error:'ISSUER_REQUEST_DENIED'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=30;
 return server;
}
