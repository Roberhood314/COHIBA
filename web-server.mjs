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
const DATA_DIR = process.env.COHIBA_DATA_DIR || DATA_DIR;
const port = Number(process.env.PORT || 8080);
const DESTINATION = new PublicKey("pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t");
const DECIMALS = 9;
const SUPPLY = 1_000_000_000n * 10n ** 9n;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://cohiba-web-live-production.up.railway.app";
const CANONICAL_PUBLIC_ORIGIN = "https://cohibameme.site";
const METADATA_URI = `${PUBLIC_BASE_URL.replace(/\/$/,"")}/token-metadata.json`;
const MAINNET_MIN_SOL = 0.03;
const launchAttempts = new Map();
const apiRateWindows = new Map();

function rateLimitApi(req){
  const key=requestIp(req);
  const now=Date.now();
  const windowMs=60*1000;
  const max=60;
  const recent=(apiRateWindows.get(key)||[]).filter(ts=>now-ts<windowMs);
  if(recent.length>=max) return false;
  recent.push(now);
  apiRateWindows.set(key,recent);
  if(apiRateWindows.size>5000){
    for(const [ip,times] of apiRateWindows){
      if(!times.some(ts=>now-ts<windowMs)) apiRateWindows.delete(ip);
    }
  }
  return true;
}

function isAllowedMethod(method){
  return method==="GET" || method==="HEAD" || method==="POST";
}

function safeRequestPath(urlValue){
  const raw=String(urlValue||"/").split("?")[0];
  let decoded;
  try{
    decoded=decodeURIComponent(raw);
  }catch{
    throw new Error("BAD_PATH_ENCODING");
  }
  if(decoded.includes("\0")) throw new Error("BAD_PATH");
  if(decoded.includes("\\")) throw new Error("BAD_PATH");
  if(decoded.split("/").some(part=>part===".." || (part.startsWith(".") && part!==".well-known"))){
    throw new Error("BAD_PATH");
  }
  return decoded;
}

function isPrivateProxyAddress(value){
  const v=String(value||"").replace(/^::ffff:/,"");
  return v==="127.0.0.1" || v==="::1" || v.startsWith("10.") || v.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(v);
}
function requestIp(req){
  const remote=String(req.socket.remoteAddress||"unknown");
  const forwarded=String(req.headers["x-forwarded-for"]||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(isPrivateProxyAddress(remote) && forwarded.length) return forwarded[forwarded.length-1];
  return remote;
}

function enforceLaunchRateLimit(req){
  const key=requestIp(req);
  const now=Date.now();
  const windowMs=10*60*1000;
  const max=5;
  const recent=(launchAttempts.get(key)||[]).filter(ts=>now-ts<windowMs);
  if(recent.length>=max) throw new Error("LAUNCH_RATE_LIMITED");
  recent.push(now);
  launchAttempts.set(key,recent);
}

function requireMainnetOrigin(req){
  const configured=PUBLIC_BASE_URL.replace(/\/$/,"");
  if(configured!==CANONICAL_PUBLIC_ORIGIN) throw new Error("MAINNET_PUBLIC_ORIGIN_NOT_CANONICAL");
  const origin=String(req.headers.origin||"");
  if(origin!==CANONICAL_PUBLIC_ORIGIN) throw new Error("MAINNET_ORIGIN_INVALID");
}
function loadOrCreateDevnetPayer(){
  const dir=DATA_DIR;
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

function isDevnetNetwork(network){
  return network==="devnet" || network==="devnet-rehearsal";
}

function launchRecordPath(network){
  const safe=
    network==="mainnet-beta"?"mainnet":
    network==="devnet-rehearsal"?"devnet-rehearsal":
    "devnet";
  return path.join(DATA_DIR,`cohiba-${safe}-launch.json`);
}

function loadLaunchRecord(network){
  const file=launchRecordPath(network);
  if(!fs.existsSync(file)) return null;
  try{
    const parsed=JSON.parse(fs.readFileSync(file,"utf8"));
    if(!parsed || typeof parsed!=="object") throw new Error("INVALID_LAUNCH_RECORD");
    return parsed;
  }catch(error){
    if(network==="mainnet-beta"){
      throw new Error("MAINNET_LAUNCH_RECORD_CORRUPT");
    }
    throw error;
  }
}

function atomicWriteJson(file,value){
  const tmp=file+".tmp-"+process.pid+"-"+Date.now();
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});
  fs.renameSync(tmp,file);
}

function saveLaunchRecord(network,record){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  atomicWriteJson(launchRecordPath(network),record);
}


const COMMUNITY_METRICS_FILE=path.join(DATA_DIR,"cohiba-community-metrics.json");
const COMMUNITY_SOURCES=new Set(["direct","x","solana-discord","reddit","github","security-outreach","creator-outreach","other"]);
const COMMUNITY_EVENTS=new Set([
  "home_view","community_view","community_x_click","community_github_click",
  "community_profile_click","profile_view","whitepaper_view","security_view",
  "ambassador_view","ambassador_x_click","analytics_view","open_review_view"
]);

function loadCommunityMetrics(){
  try{
    if(!fs.existsSync(COMMUNITY_METRICS_FILE)) return {schemaVersion:"1.0",totals:{},days:{},updatedAt:null};
    const parsed=JSON.parse(fs.readFileSync(COMMUNITY_METRICS_FILE,"utf8"));
    return parsed&&typeof parsed==="object"?parsed:{schemaVersion:"1.0",totals:{},days:{},updatedAt:null};
  }catch{
    return {schemaVersion:"1.0",totals:{},days:{},updatedAt:null,storageRecovered:true};
  }
}
function saveCommunityEvent(event,source="direct"){
  if(!COMMUNITY_EVENTS.has(event)) throw new Error("UNSUPPORTED_COMMUNITY_EVENT");
  if(!COMMUNITY_SOURCES.has(source)) source="other";
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const metrics=loadCommunityMetrics();
  const day=new Date().toISOString().slice(0,10);
  metrics.totals=metrics.totals||{};
  metrics.days=metrics.days||{};
  metrics.sources=metrics.sources||{};
  metrics.days[day]=metrics.days[day]||{};
  metrics.totals[event]=Number(metrics.totals[event]||0)+1;
  metrics.sources[source]=Number(metrics.sources[source]||0)+1;
  metrics.days[day][event]=Number(metrics.days[day][event]||0)+1;
  metrics.updatedAt=new Date().toISOString();
  atomicWriteJson(COMMUNITY_METRICS_FILE,metrics);
  return metrics;
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
  "x-dns-prefetch-control":"off",
  "x-frame-options":"DENY",
  "strict-transport-security":"max-age=31536000; includeSubDomains",
  "cross-origin-opener-policy":"same-origin",
  "cross-origin-resource-policy":"same-origin",
  "referrer-policy":"strict-origin-when-cross-origin",
  "permissions-policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.devnet.solana.com https://api.mainnet-beta.solana.com; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
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

function requireOwnerMainnetApproval(){
  if(process.env.COHIBA_MAINNET_OWNER_APPROVAL!=="APPROVE MAINNET COHIBA"){
    throw new Error("MAINNET_OWNER_APPROVAL_NOT_PRESENT");
  }
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
  const rpc = isDevnetNetwork(network)
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


const activeLaunches=new Set();
const LAUNCH_LOCK_TTL_MS=15*60*1000;

function launchLockPath(network){
  const safe=
    network==="mainnet-beta"?"mainnet":
    network==="devnet-rehearsal"?"devnet-rehearsal":
    "devnet";
  return path.join(DATA_DIR,`cohiba-${safe}-launch.lock`);
}

function acquirePersistentLaunchLock(network){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const file=launchLockPath(network);
  const payload={
    network,
    pid:process.pid,
    createdAt:new Date().toISOString(),
    createdAtMs:Date.now()
  };

  try{
    const fd=fs.openSync(file,"wx",0o600);
    fs.writeFileSync(fd,JSON.stringify(payload,null,2));
    fs.closeSync(fd);
    return {file,payload};
  }catch(error){
    if(error?.code!=="EEXIST") throw error;
    let existing=null;
    try{
      existing=JSON.parse(fs.readFileSync(file,"utf8"));
    }catch{}
    const age=existing?.createdAtMs?Date.now()-Number(existing.createdAtMs):Number.POSITIVE_INFINITY;
    if(age>LAUNCH_LOCK_TTL_MS){
      try{fs.unlinkSync(file);}catch{}
      const fd=fs.openSync(file,"wx",0o600);
      fs.writeFileSync(fd,JSON.stringify(payload,null,2));
      fs.closeSync(fd);
      return {file,payload,recoveredStale:true};
    }
    throw new Error("PERSISTENT_LAUNCH_LOCKED");
  }
}

function releasePersistentLaunchLock(lock){
  if(!lock?.file) return;
  try{
    const existing=JSON.parse(fs.readFileSync(lock.file,"utf8"));
    if(existing?.pid===process.pid) fs.unlinkSync(lock.file);
  }catch{}
}


async function createCoh(network){
  if(!isDevnetNetwork(network) && network!=="mainnet-beta") throw new Error("UNSUPPORTED_NETWORK");
  if(activeLaunches.has(network)) throw new Error("LAUNCH_ALREADY_IN_PROGRESS");
  activeLaunches.add(network);
  let persistentLock=null;

  try{
  persistentLock=acquirePersistentLaunchLock(network);

  let payer;
  let connection;

  if(isDevnetNetwork(network)){
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
  } finally {
    releasePersistentLaunchLock(persistentLock);
    activeLaunches.delete(network);
  }
}

const server=http.createServer(async (req,res)=>{
  if(!isAllowedMethod(req.method)){
    res.writeHead(405,{...headers,"allow":"GET, HEAD, POST","content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
    res.end("Method Not Allowed");
    return;
  }

  let raw;
  try{
    raw=safeRequestPath(req.url);
  }catch{
    res.writeHead(400,{...headers,"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
    res.end("Bad Request");
    return;
  }

  if(raw.startsWith("/api/") && !rateLimitApi(req)){
    res.writeHead(429,{...headers,"content-type":"application/json; charset=utf-8","cache-control":"no-store","retry-after":"60"});
    res.end(JSON.stringify({ok:false,error:"RATE_LIMITED"}));
    return;
  }


  if(req.method==="POST" && raw==="/api/community-event"){
    try{
      const expected=PUBLIC_BASE_URL.replace(/\/$/,"");
      const origin=String(req.headers.origin||"");
      if(origin!==expected){
        json(res,403,{ok:false,error:"COMMUNITY_EVENT_ORIGIN_INVALID"});
        return;
      }
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>1024) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const event=String(parsed.event||"");
      const source=String(parsed.source||"direct").slice(0,32);
      saveCommunityEvent(event,source);
      json(res,200,{ok:true,event});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="UNSUPPORTED_COMMUNITY_EVENT"?400:message==="REQUEST_TOO_LARGE"?413:500;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/community-metrics"){
    const metrics=loadCommunityMetrics();
    json(res,200,{
      ok:true,
      project:"COHIBA",
      metricClass:"FIRST_PARTY_AGGREGATE_INTERACTION",
      uniqueHumansClaimed:false,
      piiStoredInMetricsRecord:false,
      ...metrics
    });
    return;
  }

  if(req.method==="POST" && raw==="/api/create-coh"){
    try{
      enforceLaunchRateLimit(req);
      let body="";
      for await (const chunk of req) {
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const network=parsed.network||"devnet";
      const existing=loadLaunchRecord(network);
      if(existing?.locked && existing?.mint){
        json(res,409,{ok:false,error:"TOKEN_ALREADY_LAUNCHED",...existing});
        return;
      }
      if(network==="mainnet-beta"){
        requireOwnerMainnetApproval();
        requireMainnetOrigin(req);
        requireMainnetLaunchKey(req);
      }else if(isDevnetNetwork(network) && process.env.ALLOW_DEVNET_MINT_API!=="true"){
        throw new Error("DEVNET_MINT_API_LOCKED");
      }
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
      const status=
        message==="LAUNCH_RATE_LIMITED"?429:
        ["LAUNCH_ALREADY_IN_PROGRESS","PERSISTENT_LAUNCH_LOCKED"].includes(message)?409:
        message==="REQUEST_TOO_LARGE"?413:
        ["MAINNET_ORIGIN_INVALID","MAINNET_PUBLIC_ORIGIN_NOT_CANONICAL","MAINNET_LAUNCH_KEY_INVALID"].includes(message)?403:
        ["MAINNET_LOCKED","MAINNET_SIGNER_NOT_CONFIGURED","MAINNET_LAUNCH_KEY_NOT_CONFIGURED","DEVNET_MINT_API_LOCKED"].includes(message)?409:
        500;
      json(res,status,{ok:false,error:message});
    }
    return;
  }


  if(req.method==="GET" && raw==="/api/infra-readiness"){
    const mainnetRecord=loadLaunchRecord("mainnet-beta");
    const devnetRecord=loadLaunchRecord("devnet");
    let signerPublicKey=null;
    let signerBalanceSol=null;
    let signerValid=false;
    let mainnetRpc=false;
    try{
      const signer=loadMainnetSigner();
      signerPublicKey=signer.publicKey.toBase58();
      signerValid=true;
      const conn=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),"confirmed");
      const version=await conn.getVersion();
      mainnetRpc=Boolean(version?.["solana-core"]);
      const lamports=await conn.getBalance(signer.publicKey,"confirmed");
      signerBalanceSol=lamports/1e9;
    }catch{}

    const files={
      verification:fs.existsSync(path.join(root,"verification.html")),
      marketReadiness:fs.existsSync(path.join(root,"market-readiness.html")),
      blockchainDashboard:fs.existsSync(path.join(root,"blockchain.html")),
      tokenMetadata:fs.existsSync(path.join(root,"token-metadata.json")),
      projectData:fs.existsSync(path.join(root,"project-data.json")),
      marketData:fs.existsSync(path.join(root,"market-data.json"))
    };
    const gates={
      websiteReady:PUBLIC_BASE_URL==="https://cohibameme.site",
      publicVerificationReady:files.verification,
      blockchainDataLayerReady:files.blockchainDashboard,
      machineReadableProjectDataReady:files.projectData,
      machineReadableMarketDataReady:files.marketData,
      tokenMetadataReady:files.tokenMetadata,
      devnetLaunchVerified:Boolean(devnetRecord?.locked&&devnetRecord?.mint),
      signerConfigured:Boolean(process.env.SYSTEM_WALLET_SECRET_JSON),
      signerValid,
      mainnetRpc,
      mainnetSafetyLocked:process.env.ALLOW_MAINNET!=="true",
      mainnetNotLaunched:!Boolean(mainnetRecord?.locked),
      marketLaunchDeferred:true
    };
    const infrastructureReady=Object.values(gates).every(Boolean);
    json(res,200,{
      ok:true,
      project:"COHIBA",
      stage:infrastructureReady?"PRE_MAINNET_INFRA_READY":"PRE_MAINNET_BUILDING",
      infrastructureReady,
      mainnetLaunchAuthorized:false,
      gates,
      signerDetailsPublic:false,
      minimumSignerBalanceSol:MAINNET_MIN_SOL,
      finalLaunchSequence:[
        "fund signer",
        "explicit owner approval",
        "enable mainnet gate",
        "mint fixed supply",
        "verify supply and destination balance",
        "revoke mint and freeze authorities",
        "publish explorer evidence",
        "create owner-approved real liquidity pool",
        "publish real market data"
      ],
      generatedAt:new Date().toISOString()
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/mainnet-readiness"){
    const checks={
      publicBaseUrl: PUBLIC_BASE_URL==="https://cohibameme.site",
      metadataUrl: false,
      mainnetEnabled: process.env.ALLOW_MAINNET==="true",
      ownerApprovalPresent: process.env.COHIBA_MAINNET_OWNER_APPROVAL==="APPROVE MAINNET COHIBA",
      launchKeyConfigured: Boolean(process.env.COHIBA_MAINNET_LAUNCH_KEY),
      signerConfigured: Boolean(process.env.SYSTEM_WALLET_SECRET_JSON),
      signerValid: false,
      signerFunded: false,
      mainnetRpc: false,
      notAlreadyLaunched: !Boolean(loadLaunchRecord("mainnet-beta")?.locked)
    };

    let signerPublicKey=null;
    let signerBalanceSol=null;
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),5000);
      const mr=await fetch(METADATA_URI,{headers:{accept:"application/json"},signal:controller.signal});
      clearTimeout(timer);
      const meta=mr.ok?await mr.json():null;
      checks.metadataUrl=Boolean(
        mr.ok &&
        meta?.name==="COHIBA" &&
        meta?.symbol==="COH" &&
        String(meta?.image||"").startsWith("https://cohibameme.site/")
      );
    }catch{}

    if(checks.signerConfigured){
      try{
        const signer=loadMainnetSigner();
        signerPublicKey=signer.publicKey.toBase58();
        checks.signerValid=true;
        const conn=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),"confirmed");
        const version=await conn.getVersion();
        checks.mainnetRpc=Boolean(version?.["solana-core"]);
        const lamports=await conn.getBalance(signer.publicKey,"confirmed");
        signerBalanceSol=lamports/1e9;
        checks.signerFunded=signerBalanceSol>=MAINNET_MIN_SOL;
      }catch{}
    }else{
      try{
        const conn=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),"confirmed");
        const version=await conn.getVersion();
        checks.mainnetRpc=Boolean(version?.["solana-core"]);
      }catch{}
    }

    const openMainnetReady=Object.values(checks).every(Boolean);
    json(res,200,{
      ok:true,
      stage:openMainnetReady?"OPEN_MAINNET_READY":"PRE_MAINNET",
      openMainnetReady,
      checks,
      signerDetailsPublic:false,
      minimumSignerBalanceSol:MAINNET_MIN_SOL,
      metadataUri:METADATA_URI
    });
    return;
  }


  if(req.method==="GET" && raw==="/api/blockchain-data"){
    try{
      const url=new URL(req.url||"/","http://localhost");
      const requested=url.searchParams.get("network")||"mainnet-beta";
      const network=requested==="mainnet"?"mainnet-beta":requested;
      if(!isDevnetNetwork(network) && network!=="mainnet-beta"){
        json(res,400,{ok:false,error:"UNSUPPORTED_NETWORK"});
        return;
      }

      const rpc=isDevnetNetwork(network)
        ? clusterApiUrl("devnet")
        : (process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"));
      const connection=new Connection(rpc,"confirmed");
      const [slot,blockHeight,epochInfo,version]=await Promise.all([
        connection.getSlot("confirmed"),
        connection.getBlockHeight("confirmed"),
        connection.getEpochInfo("confirmed"),
        connection.getVersion()
      ]);

      const record=loadLaunchRecord(network);
      const base={
        ok:true,
        project:"COHIBA",
        symbol:"COH",
        network,
        chain:"Solana",
        standard:"SPL Token",
        expectedSupply:"1000000000",
        decimals:DECIMALS,
        tokenTax:"0%",
        destinationWallet:DESTINATION.toBase58(),
        generatedAt:new Date().toISOString(),
        chainState:{
          slot,
          blockHeight,
          epoch:epochInfo.epoch,
          absoluteSlot:epochInfo.absoluteSlot,
          solanaCore:version["solana-core"]||null
        },
        status:record?.mint?"LIVE_ON_CHAIN":"PENDING_MAINNET_MINT"
      };

      if(!record?.mint){
        json(res,200,{
          ...base,
          launched:false,
          mint:null,
          explorer:null,
          verification:{
            supplyVerified:false,
            mintAuthorityRevoked:false,
            freezeAuthorityRevoked:false,
            destinationBalanceVerified:false
          }
        });
        return;
      }

      const mintPk=new PublicKey(record.mint);
      const info=await getMint(connection,mintPk,"confirmed");
      const destinationAta=record.destinationAta?new PublicKey(record.destinationAta):null;
      const [destinationBalance,largestAccounts,recentSignatures]=await Promise.all([
        destinationAta?connection.getTokenAccountBalance(destinationAta,"confirmed"):Promise.resolve(null),
        connection.getTokenLargestAccounts(mintPk,"confirmed"),
        connection.getSignaturesForAddress(mintPk,{limit:12},"confirmed")
      ]);

      const expected=SUPPLY.toString();
      const destinationAmount=destinationBalance?.value?.amount||null;
      json(res,200,{
        ...base,
        launched:true,
        mint:record.mint,
        metadataAddress:record.metadataAddress||null,
        metadataUri:record.metadataUri||METADATA_URI,
        metadataImmutable:Boolean(record.metadataImmutable),
        destinationAta:record.destinationAta||null,
        onChain:{
          supplyBaseUnits:info.supply.toString(),
          supplyUi:(Number(info.supply)/10**info.decimals).toString(),
          decimals:info.decimals,
          mintAuthority:info.mintAuthority?.toBase58()||null,
          freezeAuthority:info.freezeAuthority?.toBase58()||null,
          destinationAmount,
          destinationUiAmount:destinationBalance?.value?.uiAmountString||null
        },
        verification:{
          supplyVerified:info.supply.toString()===expected,
          mintAuthorityRevoked:info.mintAuthority===null,
          freezeAuthorityRevoked:info.freezeAuthority===null,
          destinationBalanceVerified:destinationAmount===expected
        },
        largestTokenAccounts:largestAccounts.value.map(a=>({
          address:a.address.toBase58(),
          amountBaseUnits:a.amount,
          uiAmount:a.uiAmountString
        })),
        recentMintSignatures:recentSignatures.map(x=>({
          signature:x.signature,
          slot:x.slot,
          blockTime:x.blockTime,
          confirmationStatus:x.confirmationStatus,
          err:x.err
        })),
        explorer:{
          solscan:`https://solscan.io/token/${record.mint}${isDevnetNetwork(network)?"?cluster=devnet":""}`,
          solanaExplorer:`https://explorer.solana.com/address/${record.mint}${isDevnetNetwork(network)?"?cluster=devnet":""}`
        }
      });
    }catch(error){
      json(res,500,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/token-status"){
    try{
      const url=new URL(req.url||"/","http://localhost");
      const network=url.searchParams.get("network")||"devnet";
      if(!isDevnetNetwork(network) && network!=="mainnet-beta"){
        json(res,400,{ok:false,error:"UNSUPPORTED_NETWORK"});
        return;
      }
      const record=loadLaunchRecord(network);
      if(!record?.mint){
        json(res,200,{ok:true,launched:false,network});
        return;
      }
      const connection=new Connection(
        isDevnetNetwork(network)
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

async function maybeAutoLaunchMainnet(){
  if(process.env.AUTO_MAINNET_LAUNCH!=="I_UNDERSTAND_MAINNET_COHIBA") return;
  try{
    if(process.env.ALLOW_MAINNET!=="true") throw new Error("MAINNET_LOCKED");
    requireOwnerMainnetApproval();
    const existing=loadLaunchRecord("mainnet-beta");
    if(existing?.locked && existing?.mint){
      console.log("COHIBA_MAINNET_ALREADY_LAUNCHED", JSON.stringify({mint:existing.mint,status:existing.status}));
      return;
    }

    const signer=loadMainnetSigner();
    const connection=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),"confirmed");
    const version=await connection.getVersion();
    if(!version?.["solana-core"]) throw new Error("MAINNET_RPC_UNAVAILABLE");

    const lamports=await connection.getBalance(signer.publicKey,"confirmed");
    const signerBalanceSol=lamports/1e9;
    if(signerBalanceSol<MAINNET_MIN_SOL){
      throw new Error(`MAINNET_SIGNER_NEEDS_FUNDING:${signer.publicKey.toBase58()}:${signerBalanceSol}`);
    }

    const mr=await fetch(METADATA_URI,{headers:{accept:"application/json"}});
    const meta=mr.ok?await mr.json():null;
    if(!(mr.ok && meta?.name==="COHIBA" && meta?.symbol==="COH" && String(meta?.image||"").startsWith("https://cohibameme.site/"))){
      throw new Error("MAINNET_METADATA_NOT_READY");
    }

    console.log("COHIBA_MAINNET_AUTO_LAUNCH_START", JSON.stringify({signer:signer.publicKey.toBase58(),balanceSol:signerBalanceSol}));
    const record=await createCoh("mainnet-beta");
    console.log("COHIBA_MAINNET_AUTO_LAUNCH_SUCCESS", JSON.stringify({
      mint:record.mint,
      destinationWallet:record.destinationWallet,
      destinationAta:record.destinationAta,
      metadataAddress:record.metadataAddress,
      status:record.status,
      mintAuthority:record.mintAuthority,
      freezeAuthority:record.freezeAuthority,
      launchedAt:record.launchedAt
    }));
  }catch(error){
    console.error("COHIBA_MAINNET_AUTO_LAUNCH_BLOCKED", String(error?.message||error));
  }
}

server.requestTimeout=15000;
server.headersTimeout=10000;
server.keepAliveTimeout=5000;
server.maxHeadersCount=64;
server.maxRequestsPerSocket=100;

server.listen(port,"0.0.0.0",()=>{
  console.log(`COHIBA web listening on :${port}`);
  setTimeout(()=>{ void maybeAutoLaunchMainnet(); },1500);
});
