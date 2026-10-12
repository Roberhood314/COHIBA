// Opt-in reference receiver; never enabled by the COHIBA web deployment.
import http from 'node:http';
import {createDestinationStore} from '../../packages/authority-verifier/destination-store.mjs';
export async function createDestinationServer(options){
 const store=await createDestinationStore(options);
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='POST'||req.url!=='/drafts'){reply(404,{error:'NOT_FOUND'});return;}
  try{
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>24576){reply(413,{error:'REQUEST_TOO_LARGE'});return;}}
   const input=JSON.parse(body);
   if(!input||Object.keys(input).sort().join(',')!=='bundle,challenge,payloadBase64'){reply(400,{error:'INVALID_REQUEST'});return;}
   const result=await store.commit(input);
   reply(result.operationCommitted?200:result.reason==='DESTINATION_UNAVAILABLE'?503:403,result);
  }catch{reply(503,{error:'DESTINATION_UNAVAILABLE'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=30;
 // Trusted operator API only. The public HTTP service exposes no revoke route.
 return {server,revoke:store.revoke};
}
