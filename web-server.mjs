import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getMint } from "@solana/spl-token";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 8080);
const DESTINATION = new PublicKey("pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t");
const DECIMALS = 9;
const SUPPLY = 1_000_000_000n * 10n ** 9n;
const DEVNET_PAYER = Keypair.generate();

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

function json(res,status,body){
  res.writeHead(status,{...headers,"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  res.end(JSON.stringify(body));
}

async function ensureDevnetFunding(payer){
  const rpcCandidates=[
    "https://api.devnet.solana.com",
    "https://rpc.ankr.com/solana_devnet"
  ];

  let lastError="DEVNET_AIRDROP_FAILED";

  for(const rpc of rpcCandidates){
    try{
      const conn=new Connection(rpc,"confirmed");
      let balance=await conn.getBalance(payer.publicKey,"confirmed");
      if(balance>=20_000_000) return conn;

      const sig=await conn.requestAirdrop(payer.publicKey,100_000_000);
      const latest=await conn.getLatestBlockhash("confirmed");
      await conn.confirmTransaction({
        signature:sig,
        blockhash:latest.blockhash,
        lastValidBlockHeight:latest.lastValidBlockHeight
      },"confirmed");

      balance=await conn.getBalance(payer.publicKey,"confirmed");
      if(balance>=20_000_000) return conn;
    }catch(error){
      lastError=String(error?.message||error);
    }
  }

  throw new Error(`DEVNET_FUNDING_FAILED: ${lastError}`);
}

function loadMainnetSigner(){
  const raw=process.env.SYSTEM_WALLET_SECRET_JSON;
  if(!raw) throw new Error("MAINNET_SIGNER_NOT_CONFIGURED");
  const secret=JSON.parse(raw);
  if(!Array.isArray(secret)) throw new Error("INVALID_SYSTEM_WALLET_SECRET_JSON");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function createCoh(network){
  if(network!=="devnet" && network!=="mainnet-beta") throw new Error("UNSUPPORTED_NETWORK");

  let payer;
  let connection;

  if(network==="devnet"){
    payer=DEVNET_PAYER;
    connection=await ensureDevnetFunding(payer);
  }else{
    if(process.env.ALLOW_MAINNET!=="true") throw new Error("MAINNET_LOCKED");
    payer=loadMainnetSigner();
    connection=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),"confirmed");
  }

  const balance=await connection.getBalance(payer.publicKey,"confirmed");
  if(balance<5_000_000) throw new Error("SYSTEM_SIGNER_SOL_TOO_LOW");

  const mint=await createMint(
    connection,
    payer,
    payer.publicKey,
    payer.publicKey,
    DECIMALS
  );

  const ata=await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    DESTINATION
  );

  await mintTo(
    connection,
    payer,
    mint,
    ata.address,
    payer,
    SUPPLY
  );

  const info=await getMint(connection,mint,"confirmed");
  if(info.supply!==SUPPLY) throw new Error("SUPPLY_VERIFY_FAILED");

  return {
    network,
    mint:mint.toBase58(),
    destinationWallet:DESTINATION.toBase58(),
    destinationAta:ata.address.toBase58(),
    supply:"1000000000",
    baseUnitSupply:info.supply.toString(),
    decimals:info.decimals,
    mintAuthority:info.mintAuthority?.toBase58()||null,
    freezeAuthority:info.freezeAuthority?.toBase58()||null
  };
}

const server=http.createServer(async (req,res)=>{
  const raw=(req.url||"/").split("?")[0];

  if(req.method==="POST" && raw==="/api/create-coh"){
    try{
      let body="";
      for await (const chunk of req) body+=chunk;
      const parsed=body?JSON.parse(body):{};
      const network=parsed.network||"devnet";
      const result=await createCoh(network);
      json(res,200,{ok:true,...result});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="MAINNET_LOCKED"||message==="MAINNET_SIGNER_NOT_CONFIGURED"?409:500;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/system-wallet"){
    try{
      const connection=new Connection(clusterApiUrl("devnet"),"confirmed");
      const balance=await connection.getBalance(DEVNET_PAYER.publicKey,"confirmed");
      json(res,200,{
        ok:true,
        network:"devnet",
        address:DEVNET_PAYER.publicKey.toBase58(),
        balanceSol:balance/1e9
      });
    }catch(error){
      json(res,500,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/health"){
    json(res,200,{ok:true,service:"cohiba-web-live"});
    return;
  }

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
});

server.listen(port,"0.0.0.0",()=>console.log(`COHIBA web listening on :${port}`));
