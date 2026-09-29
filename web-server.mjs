import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 8080);

const types = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".svg":"image/svg+xml",
  ".ico":"image/x-icon"
};

const headers = {
  "x-content-type-options":"nosniff",
  "x-frame-options":"DENY",
  "referrer-policy":"strict-origin-when-cross-origin",
  "permissions-policy":"camera=(), microphone=(), geolocation=()",
  "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.devnet.solana.com https://api.mainnet-beta.solana.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

http.createServer((req,res)=>{
  const raw=(req.url||"/").split("?")[0];
  const rel=raw==="/"?"/index.html":raw;
  const target=path.normalize(path.join(root,rel));
  if(!target.startsWith(root)){
    res.writeHead(403,{...headers,"content-type":"text/plain; charset=utf-8"});
    res.end("Forbidden");
    return;
  }
  fs.readFile(target,(err,data)=>{
    if(err){
      res.writeHead(404,{...headers,"content-type":"text/plain; charset=utf-8"});
      res.end("Not found");
      return;
    }
    res.writeHead(200,{
      ...headers,
      "content-type":types[path.extname(target)]||"application/octet-stream",
      "cache-control":path.extname(target)===".html"?"no-cache":"public, max-age=300"
    });
    res.end(data);
  });
}).listen(port,"0.0.0.0",()=>console.log(`COHIBA web listening on :${port}`));
