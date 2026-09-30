import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getMint, setAuthority, AuthorityType } from "@solana/spl-token";
import { createV1, findMetadataPda, mplTokenMetadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, percentAmount, publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 8080);
const DESTINATION = new PublicKey("pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t");
const DECIMALS = 9;
const SUPPLY = 1_000_000_000n * 10n ** 9n;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://cohiba-web-live-production.up.railway.app";
const METADATA_URI = `${PUBLIC_BASE_URL.replace(/\/$/,"")}/token-metadata.json`;
function loadOrCreateDevnetPayer(){
  const dir="/data";
  const file=path.join(dir,"devnet-payer.json");

  try{
    fs.mkdirSync(dir,{recursive:true});
    if(fs.existsSync(file)){
      const raw=JSON.parse(fs.readFileSync(file,"utf8"));
      if(Array.isArray(raw)) return Keypair.fromSecretKey(Uint8Array.from(raw));
    }

    const kp=Keypair.generate();
    fs.writeFileSync(file,JSON.stringify(Array.from(kp.secretKey)),{mode:0o600});
    return kp;
  }catch(error){
    throw new Error("DEVNET_PAYER_STORAGE_FAILED: "+String(error?.message||error));
  }
}

const DEVNET_PAYER = loadOrCreateDevnetPayer();

function launchRecordPath(network){
  const safe=network==="mainnet-beta"?"mainnet":"devnet";
  return path.join("/data",`cohiba-${safe}-launch.json`);
}

function loadLaunchRecord(network){
  try{
    const file=launchRecordPath(network);
    if(!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file,"utf8"));
  }catch{
    return null;
  }
}

function saveLaunchRecord(network,record){
  fs.mkdirSync("/data",{recursive:true});
  fs.writeFileSync(
    launchRecordPath(network),
    JSON.stringify(record,null,2),
    {mode:0o600}
  );
}

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
  const rpc="https://api.devnet.solana.com";
  const conn=new Connection(rpc,"confirmed");

  // Use raw JSON-RPC for balance to avoid provider-specific schema issues.
  const response=await fetch(rpc,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      jsonrpc:"2.0",
      id:1,
      method:"getBalance",
      params:[payer.publicKey.toBase58(),{"commitment":"confirmed"}]
    })
  });

  const jsonBody=await response.json();
  if(jsonBody.error){
    throw new Error(`DEVNET_RPC_ERROR: ${jsonBody.error.message||"getBalance failed"}`);
  }

  const lamports=Number(jsonBody?.result?.value||0);
  if(lamports<20_000_000){
    const error=new Error("DEVNET_SYSTEM_WALLET_NEEDS_FUNDING");
    error.systemWallet=payer.publicKey.toBase58();
    error.balanceLamports=lamports;
    throw error;
  }

  return conn;
}

function requireMainnetLaunchKey(req){
  const configured=process.env.COHIBA_MAINNET_LAUNCH_KEY;
  if(!configured) throw new Error("MAINNET_LAUNCH_KEY_NOT_CONFIGURED");
  const supplied=String(req.headers["x-cohiba-launch-key"]||"");
  if(!supplied || supplied!==configured) throw new Error("MAINNET_LAUNCH_KEY_INVALID");
}

function loadMainnetSigner(){
  const raw=process.env.SYSTEM_WALLET_SECRET_JSON;
  if(!raw) throw new Error("MAINNET_SIGNER_NOT_CONFIGURED");
  const secret=JSON.parse(raw);
  if(!Array.isArray(secret)) throw new Error("INVALID_SYSTEM_WALLET_SECRET_JSON");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function ensureTokenMetadata(network,payer,mint,connection){
  const rpc = network==="devnet"
    ? clusterApiUrl("devnet")
    : (process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"));

  const umi=createUmi(rpc).use(mplTokenMetadata());
  const umiKeypair=umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
  umi.use(keypairIdentity(umiKeypair));

  const umiMint=umiPublicKey(mint.toBase58());
  const metadataPda=findMetadataPda(umi,{mint:umiMint});
  const metadataAddress=new PublicKey(metadataPda[0].toString());
  const existing=await connection.getAccountInfo(metadataAddress,"confirmed");
  if(existing) return metadataAddress.toBase58();

  await createV1(umi,{
    mint:umiMint,
    authority:umi.identity,
    payer:umi.identity,
    updateAuthority:umi.identity,
    name:"COHIBA",
    symbol:"COH",
    uri:METADATA_URI,
    sellerFeeBasisPoints:percentAmount(0),
    tokenStandard:TokenStandard.Fungible,
    isMutable:false
  }).sendAndConfirm(umi);

  return metadataAddress.toBase58();
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

  let record=loadLaunchRecord(network)||{
    network,
    destinationWallet:DESTINATION.toBase58(),
    supply:"1000000000",
    decimals:DECIMALS,
    status:"NEW",
    startedAt:new Date().toISOString()
  };

  let mint;
  if(record.mint){
    mint=new PublicKey(record.mint);
  }else{
    mint=await createMint(
      connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      DECIMALS
    );
    record={...record,mint:mint.toBase58(),status:"MINT_CREATED"};
    saveLaunchRecord(network,record);
  }

  const ata=await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    DESTINATION
  );
  if(record.destinationAta!==ata.address.toBase58()){
    record={...record,destinationAta:ata.address.toBase58(),status:"ATA_READY"};
    saveLaunchRecord(network,record);
  }

  let info=await getMint(connection,mint,"confirmed");

  if(info.supply===0n){
    if(!info.mintAuthority?.equals(payer.publicKey)) throw new Error("UNEXPECTED_MINT_AUTHORITY");
    await mintTo(connection,payer,mint,ata.address,payer,SUPPLY);
    record={...record,status:"SUPPLY_MINTED"};
    saveLaunchRecord(network,record);
    info=await getMint(connection,mint,"confirmed");
  }

  if(info.supply!==SUPPLY) throw new Error("SUPPLY_VERIFY_FAILED");

  const destinationBalance=await connection.getTokenAccountBalance(ata.address,"confirmed");
  if(BigInt(destinationBalance.value.amount)!==SUPPLY) throw new Error("DESTINATION_BALANCE_VERIFY_FAILED");

  const metadataAddress=await ensureTokenMetadata(network,payer,mint,connection);
  record={
    ...record,
    metadataAddress,
    metadataUri:METADATA_URI,
    metadataImmutable:true,
    status:"METADATA_READY"
  };
  saveLaunchRecord(network,record);

  info=await getMint(connection,mint,"confirmed");

  if(info.freezeAuthority!==null){
    if(!info.freezeAuthority.equals(payer.publicKey)) throw new Error("UNEXPECTED_FREEZE_AUTHORITY");
    await setAuthority(connection,payer,mint,payer,AuthorityType.FreezeAccount,null);
    record={...record,status:"FREEZE_REVOKED"};
    saveLaunchRecord(network,record);
  }

  info=await getMint(connection,mint,"confirmed");
  if(info.mintAuthority!==null){
    if(!info.mintAuthority.equals(payer.publicKey)) throw new Error("UNEXPECTED_MINT_AUTHORITY");
    await setAuthority(connection,payer,mint,payer,AuthorityType.MintTokens,null);
    record={...record,status:"MINT_REVOKED"};
    saveLaunchRecord(network,record);
  }

  info=await getMint(connection,mint,"confirmed");
  if(info.supply!==SUPPLY) throw new Error("POST_REVOKE_SUPPLY_VERIFY_FAILED");
  if(info.mintAuthority!==null) throw new Error("MINT_AUTHORITY_REVOKE_FAILED");
  if(info.freezeAuthority!==null) throw new Error("FREEZE_AUTHORITY_REVOKE_FAILED");

  const finalBalance=await connection.getTokenAccountBalance(ata.address,"confirmed");
  if(BigInt(finalBalance.value.amount)!==SUPPLY) throw new Error("POST_REVOKE_DESTINATION_VERIFY_FAILED");

  record={
    ...record,
    baseUnitSupply:info.supply.toString(),
    decimals:info.decimals,
    mintAuthority:null,
    freezeAuthority:null,
    locked:true,
    status:"LOCKED_VERIFIED",
    launchedAt:record.launchedAt||new Date().toISOString()
  };
  saveLaunchRecord(network,record);
  return record;
}

const server=http.createServer(async (req,res)=>{
  const raw=(req.url||"/").split("?")[0];

  if(req.method==="POST" && raw==="/api/create-coh"){
    try{
      let body="";
      for await (const chunk of req) body+=chunk;
      const parsed=body?JSON.parse(body):{};
      const network=parsed.network||"devnet";
      const existing=loadLaunchRecord(network);
      if(existing?.locked && existing?.mint){
        json(res,409,{ok:false,error:"TOKEN_ALREADY_LAUNCHED",...existing});
        return;
      }
      if(network==="mainnet-beta") requireMainnetLaunchKey(req);
      const result=await createCoh(network);
      json(res,200,{ok:true,...result});
    }catch(error){
      const message=String(error?.message||error);
      if(message==="DEVNET_SYSTEM_WALLET_NEEDS_FUNDING"){
        json(res,409,{
          ok:false,
          error:message,
          systemWallet:error.systemWallet||DEVNET_PAYER.publicKey.toBase58(),
          balanceLamports:error.balanceLamports||0,
          requiredLamports:20000000
        });
        return;
      }
      const status=["MAINNET_LOCKED","MAINNET_SIGNER_NOT_CONFIGURED","MAINNET_LAUNCH_KEY_NOT_CONFIGURED"].includes(message)?409:(message==="MAINNET_LAUNCH_KEY_INVALID"?403:500);
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/token-status"){
    try{
      const url=new URL(req.url||"/","http://localhost");
      const network=url.searchParams.get("network")||"devnet";
      if(network!=="devnet" && network!=="mainnet-beta"){
        json(res,400,{ok:false,error:"UNSUPPORTED_NETWORK"});
        return;
      }
      const record=loadLaunchRecord(network);
      if(!record?.mint){
        json(res,200,{ok:true,launched:false,network});
        return;
      }
      const connection=new Connection(
        network==="devnet"
          ? clusterApiUrl("devnet")
          : (process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta")),
        "confirmed"
      );
      const info=await getMint(connection,new PublicKey(record.mint),"confirmed");
      const balance=await connection.getTokenAccountBalance(new PublicKey(record.destinationAta),"confirmed");
      json(res,200,{
        ok:true,
        launched:true,
        ...record,
        onChain:{
          supply:info.supply.toString(),
          decimals:info.decimals,
          mintAuthority:info.mintAuthority?.toBase58()||null,
          freezeAuthority:info.freezeAuthority?.toBase58()||null,
          destinationAmount:balance.value.amount,
          destinationUiAmount:balance.value.uiAmountString
        }
      });
    }catch(error){
      json(res,500,{ok:false,error:String(error?.message||error)});
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
