import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, clusterApiUrl } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getMint, setAuthority, AuthorityType } from "@solana/spl-token";
import { createV1, findMetadataPda, mplTokenMetadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, percentAmount, publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { normalizeContribution, contributionDigest, contributionId, publicContribution, reputationTable } from "./lib/human-signal.mjs";
import { createWalletChallenge, verifySolanaMessage, newSession, hashSessionToken, isSessionValid, profileIdForWallet, utcDay, nextStreak, deriveRoles, trustScore, MAX_TRUST_CONNECTIONS } from "./lib/human-signal-network.mjs";
import { calculateMiningRate, newMiningSession, applyClaim, publicMiningSession, PIONEER_COHORT_SIZE } from "./lib/signal-mining.mjs";
import { hashIdentity, normalizePhone, newOauthState, isOauthStateValid, publicHumanProof } from "./lib/human-proof.mjs";
import { appendCoreEvent, verifyEventChain, coreStateRoot, registerCoreApp, recordAppUtility, networkHealth } from "./lib/human-signal-core.mjs";
import { publicPioneerSupport, referralBoost } from "./lib/pioneer-support.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "dist");
const DATA_DIR = process.env.COHIBA_DATA_DIR || "/data";
const port = Number(process.env.PORT || 8080);
const DESTINATION = new PublicKey("pTEH7pYratL14VFPQ9i5JMvPYDCpCQ773cHQZ3DdW3t");
const DECIMALS = 9;
const SUPPLY = 1_000_000_000n * 10n ** 9n;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://cohiba-web-live-production.up.railway.app";
const CANONICAL_PUBLIC_ORIGIN = "https://cohibameme.site";
const METADATA_URI = `${PUBLIC_BASE_URL.replace(/\/$/,"")}/token-metadata.json`;
const MAINNET_MIN_SOL = 0.03;
const HSC_MEMO_PROGRAM=new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
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
const HUMAN_SIGNAL_FILE=path.join(DATA_DIR,"cohiba-human-signal.json");
const HUMAN_SIGNAL_NETWORK_FILE=path.join(DATA_DIR,"cohiba-human-signal-network.json");
const HUMAN_SIGNAL_CORE_FILE=path.join(DATA_DIR,"cohiba-human-signal-core.json");
const INFOBIP_2FA_FILE=path.join(DATA_DIR,"cohiba-infobip-2fa.json");

function loadHumanSignalCore(){
  try{
    if(!fs.existsSync(HUMAN_SIGNAL_CORE_FILE)) return {schemaVersion:"1.0",events:[],apps:[],appUtility:[],updatedAt:null};
    const parsed=JSON.parse(fs.readFileSync(HUMAN_SIGNAL_CORE_FILE,"utf8"));
    parsed.events=Array.isArray(parsed.events)?parsed.events:[];
    parsed.apps=Array.isArray(parsed.apps)?parsed.apps:[];
    parsed.appUtility=Array.isArray(parsed.appUtility)?parsed.appUtility:[];
    return parsed;
  }catch{
    return {schemaVersion:"1.0",events:[],apps:[],appUtility:[],updatedAt:null,storageRecovered:true};
  }
}

function saveHumanSignalCore(store){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  store.updatedAt=new Date().toISOString();
  atomicWriteJson(HUMAN_SIGNAL_CORE_FILE,store);
}

function hscCompositeStore(){
  const core=loadHumanSignalCore();
  const net=loadHumanSignalNetwork();
  const contrib=loadHumanSignal();
  return {
    ...core,
    profiles:net.profiles||[],
    contributions:contrib.records||[]
  };
}

async function anchorHscStateDevnet(){
  if(process.env.ALLOW_HSC_DEVNET_ANCHOR!=="true") throw new Error("HSC_DEVNET_ANCHOR_LOCKED");
  const connection=await ensureDevnetFunding(DEVNET_PAYER);
  const composite=hscCompositeStore();
  const state=coreStateRoot(composite);
  const core=loadHumanSignalCore();
  core.anchors=Array.isArray(core.anchors)?core.anchors:[];
  const existing=core.anchors.find(a=>a.network==="devnet"&&a.stateRoot===state.stateRoot);
  if(existing) return existing;
  const payload={
    protocol:"COHIBA_HSC",
    version:"0.1",
    stateRoot:state.stateRoot,
    eventHead:verifyEventChain(composite.events||[]).head||null,
    createdAt:new Date().toISOString()
  };
  const data=Buffer.from(JSON.stringify(payload),"utf8");
  if(data.length>566) throw new Error("HSC_ANCHOR_PAYLOAD_TOO_LARGE");
  const tx=new Transaction().add(new TransactionInstruction({
    keys:[],
    programId:HSC_MEMO_PROGRAM,
    data
  }));
  const signature=await sendAndConfirmTransaction(connection,tx,[DEVNET_PAYER],{commitment:"confirmed"});
  const anchorRecord={
    id:"ANCHOR-"+state.stateRoot.slice(0,16).toUpperCase(),
    network:"devnet",
    stateRoot:state.stateRoot,
    eventHead:payload.eventHead,
    signature,
    explorer:"https://explorer.solana.com/tx/"+signature+"?cluster=devnet",
    anchoredAt:new Date().toISOString()
  };
  core.anchors.push(anchorRecord);
  appendCoreEvent(core,{type:"STATE_ROOT_ANCHORED",actor:"SYSTEM",subject:anchorRecord.id,data:{network:"devnet",stateRoot:state.stateRoot,signature}});
  saveHumanSignalCore(core);
  return anchorRecord;
}

function emitHsc(type,actor="SYSTEM",subject=null,data={}){
  const core=loadHumanSignalCore();
  const event=appendCoreEvent(core,{type,actor,subject,data});
  saveHumanSignalCore(core);
  return event;
}


function loadHumanSignalNetwork(){
  try{
    if(!fs.existsSync(HUMAN_SIGNAL_NETWORK_FILE)) return {schemaVersion:"1.0",profiles:[],challenges:[],sessions:[],updatedAt:null};
    const parsed=JSON.parse(fs.readFileSync(HUMAN_SIGNAL_NETWORK_FILE,"utf8"));
    if(!parsed || !Array.isArray(parsed.profiles) || !Array.isArray(parsed.challenges) || !Array.isArray(parsed.sessions)) throw new Error("INVALID_HUMAN_SIGNAL_NETWORK_STORE");
    return parsed;
  }catch{
    return {schemaVersion:"1.0",profiles:[],challenges:[],sessions:[],updatedAt:null,storageRecovered:true};
  }
}

function saveHumanSignalNetwork(store){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  store.updatedAt=new Date().toISOString();
  atomicWriteJson(HUMAN_SIGNAL_NETWORK_FILE,store);
}

function authHumanSignalProfile(req,store){
  const auth=String(req.headers.authorization||"");
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token) throw new Error("HUMAN_SIGNAL_AUTH_REQUIRED");
  const hash=hashSessionToken(token);
  const session=store.sessions.find(x=>x.tokenHash===hash);
  if(!isSessionValid(session)) throw new Error("HUMAN_SIGNAL_SESSION_INVALID");
  const profile=store.profiles.find(x=>x.id===session.profileId);
  if(!profile) throw new Error("HUMAN_SIGNAL_PROFILE_NOT_FOUND");
  return profile;
}

function verifiedReputationForProfile(profileId,records,now=Date.now()){
  const cutoff=now-30*86400000;
  return records.filter(r=>{
    const ts=Date.parse(r.reviewedAt||r.submittedAt||0);
    return r.profileId===profileId && r.status==="VERIFIED" && Number.isFinite(ts) && ts>=cutoff;
  }).reduce((sum,r)=>{
    const weights={SECURITY:30,CODE:25,RESEARCH:20,DOCUMENTATION:15,TRANSLATION:12,CREATIVE:10,COMMUNITY:8};
    return sum+(weights[r.type]||0);
  },0);
}

function noteMeaningfulAction(profile,type,now=Date.now()){
  profile.utilityActions=Array.isArray(profile.utilityActions)?profile.utilityActions:[];
  const cutoff=now-7*86400000;
  profile.utilityActions=profile.utilityActions.filter(x=>Date.parse(x.at)>=cutoff);
  const today=new Date(now).toISOString().slice(0,10);
  const dedupeKey=type+":"+today;
  if(!profile.utilityActions.some(x=>x.key===dedupeKey)){
    profile.utilityActions.push({key:dedupeKey,type,at:new Date(now).toISOString()});
  }
}

function meaningfulActions7d(profile,now=Date.now()){
  const cutoff=now-7*86400000;
  return (Array.isArray(profile.utilityActions)?profile.utilityActions:[]).filter(x=>Date.parse(x.at)>=cutoff).length;
}

function humanProofProvidersReady(){
  const twilio=Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_VERIFY_SERVICE_SID);
  const infobip=Boolean(process.env.INFOBIP_API_KEY&&process.env.INFOBIP_BASE_URL);
  const phone=twilio||infobip;
  const google=Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
  const facebook=Boolean(process.env.FACEBOOK_APP_ID&&process.env.FACEBOOK_APP_SECRET&&process.env.FACEBOOK_GRAPH_VERSION);
  const pepper=Boolean(process.env.HUMAN_IDENTITY_PEPPER);
  return {phone,twilio,infobip,google,facebook,pepper,ready:pepper&&phone&&(google||facebook)};
}

function verifiedReferralCountFor(profile,profiles){
  if(!profile?.referralCode) return 0;
  return (profiles||[]).filter(p=>p.invitedBy===profile.referralCode && publicHumanProof(p).confidence.tier==="HUMAN_VERIFIED").length;
}

function miningRateForProfile(profile,networkStore,contributionStore){
  const providers=humanProofProvidersReady();
  const enforce=process.env.MINING_HUMAN_PROOF_MODE==="enforced" && providers.ready;
  const support=publicPioneerSupport(profile,{providersReady:providers.ready,enforceHumanProof:enforce});
  const verifiedReferrals=verifiedReferralCountFor(profile,networkStore.profiles);
  return calculateMiningRate({
    profile,
    profileCount:networkStore.profiles.length,
    verifiedReputation30d:verifiedReputationForProfile(profile.id,contributionStore.records),
    meaningfulActions7d:meaningfulActions7d(profile),
    referralBoostInput:referralBoost(verifiedReferrals),
    eligibilityFactor:support.eligibility.factor
  });
}

function identityPepper(){
  const value=process.env.HUMAN_IDENTITY_PEPPER;
  if(!value) throw new Error("IDENTITY_PEPPER_NOT_CONFIGURED");
  return value;
}

function ensureHumanProofStore(store){
  store.oauthStates=Array.isArray(store.oauthStates)?store.oauthStates:[];
  for(const p of store.profiles){
    p.humanProofs=p.humanProofs&&typeof p.humanProofs==="object"?p.humanProofs:{};
  }
  return store;
}

function infobipBaseUrl(){
  const raw=String(process.env.INFOBIP_BASE_URL||"").trim().replace(/\/$/,"");
  if(!raw) throw new Error("INFOBIP_NOT_CONFIGURED");
  return /^https?:\/\//i.test(raw)?raw:"https://"+raw;
}

function infobipHeaders(){
  const key=String(process.env.INFOBIP_API_KEY||"").trim();
  if(!key) throw new Error("INFOBIP_NOT_CONFIGURED");
  return {
    authorization:"App "+key,
    "content-type":"application/json",
    accept:"application/json"
  };
}

function loadInfobip2faConfig(){
  try{
    if(!fs.existsSync(INFOBIP_2FA_FILE)) return {};
    const x=JSON.parse(fs.readFileSync(INFOBIP_2FA_FILE,"utf8"));
    return x&&typeof x==="object"?x:{};
  }catch{return {};}
}

function saveInfobip2faConfig(value){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  atomicWriteJson(INFOBIP_2FA_FILE,value);
}

async function ensureInfobip2faConfig(){
  const base=infobipBaseUrl();
  const headers=infobipHeaders();
  const cfg=loadInfobip2faConfig();

  cfg.applicationId=process.env.INFOBIP_2FA_APPLICATION_ID||cfg.applicationId||null;
  cfg.messageId=process.env.INFOBIP_2FA_MESSAGE_ID||cfg.messageId||null;
  cfg.senderId=process.env.INFOBIP_SENDER_ID||cfg.senderId||"Infobip 2FA";

  if(!cfg.applicationId){
    const r=await fetch(base+"/2fa/2/applications",{
      method:"POST",headers,
      body:JSON.stringify({
        name:"COHIBA Human Verification",
        configuration:{
          pinAttempts:5,
          allowMultiplePinVerifications:false,
          pinTimeToLive:"5m",
          verifyPinLimit:"1/3s",
          sendPinPerApplicationLimit:"10000/1d",
          sendPinPerPhoneNumberLimit:"5/1d"
        },
        enabled:true
      })
    });
    const x=await r.json().catch(()=>({}));
    if(!r.ok || !x.applicationId) throw new Error("INFOBIP_2FA_APPLICATION_CREATE_FAILED");
    cfg.applicationId=String(x.applicationId);
    cfg.applicationCreatedAt=new Date().toISOString();
    saveInfobip2faConfig(cfg);
  }

  if(!cfg.messageId){
    const r=await fetch(base+"/2fa/2/applications/"+encodeURIComponent(cfg.applicationId)+"/messages",{
      method:"POST",headers,
      body:JSON.stringify({
        pinType:"NUMERIC",
        pinPlaceholder:"{{pin}}",
        messageText:"COHIBA verification code: {{pin}}",
        pinLength:6,
        language:"en",
        senderId:cfg.senderId
      })
    });
    const x=await r.json().catch(()=>({}));
    if(!r.ok || !x.messageId) throw new Error("INFOBIP_2FA_TEMPLATE_CREATE_FAILED");
    cfg.messageId=String(x.messageId);
    cfg.templateCreatedAt=new Date().toISOString();
    saveInfobip2faConfig(cfg);
  }

  cfg.updatedAt=new Date().toISOString();
  saveInfobip2faConfig(cfg);
  return cfg;
}

async function infobipVerifyStart(phone){
  const cfg=await ensureInfobip2faConfig();
  const r=await fetch(infobipBaseUrl()+"/2fa/2/pin",{
    method:"POST",
    headers:infobipHeaders(),
    body:JSON.stringify({
      applicationId:cfg.applicationId,
      messageId:cfg.messageId,
      from:cfg.senderId,
      to:String(phone).replace(/^\+/,"")
    })
  });
  const x=await r.json().catch(()=>({}));
  if(!r.ok || !x.pinId) throw new Error("PHONE_VERIFY_SEND_FAILED");
  return {status:"pending",provider:"infobip",pinId:String(x.pinId)};
}

async function infobipVerifyCheck(pinId,code){
  if(!pinId) throw new Error("PHONE_VERIFICATION_CONTEXT_MISMATCH");
  const r=await fetch(infobipBaseUrl()+"/2fa/2/pin/"+encodeURIComponent(pinId)+"/verify",{
    method:"POST",
    headers:infobipHeaders(),
    body:JSON.stringify({pin:String(code||"")})
  });
  const x=await r.json().catch(()=>({}));
  if(!r.ok || x.verified!==true) throw new Error("PHONE_CODE_INVALID");
  return true;
}

async function phoneVerifyStart(phone){
  if(process.env.INFOBIP_API_KEY&&process.env.INFOBIP_BASE_URL) return infobipVerifyStart(phone);
  return twilioVerifyStart(phone);
}

async function phoneVerifyCheck(profile,phone,code){
  if(profile?.pendingPhoneProvider==="infobip"){
    return infobipVerifyCheck(profile.pendingPhonePinId,code);
  }
  return twilioVerifyCheck(phone,code);
}

async function twilioVerifyStart(phone){
  const sid=process.env.TWILIO_ACCOUNT_SID;
  const token=process.env.TWILIO_AUTH_TOKEN;
  const service=process.env.TWILIO_VERIFY_SERVICE_SID;
  if(!sid||!token||!service) throw new Error("PHONE_VERIFY_NOT_CONFIGURED");
  const body=new URLSearchParams({To:phone,Channel:"sms"});
  const r=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,{
    method:"POST",
    headers:{authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),"content-type":"application/x-www-form-urlencoded"},
    body
  });
  const x=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error("PHONE_VERIFY_SEND_FAILED");
  return {status:x.status||"pending"};
}

async function twilioVerifyCheck(phone,code){
  const sid=process.env.TWILIO_ACCOUNT_SID;
  const token=process.env.TWILIO_AUTH_TOKEN;
  const service=process.env.TWILIO_VERIFY_SERVICE_SID;
  if(!sid||!token||!service) throw new Error("PHONE_VERIFY_NOT_CONFIGURED");
  const body=new URLSearchParams({To:phone,Code:String(code||"")});
  const r=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,{
    method:"POST",
    headers:{authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),"content-type":"application/x-www-form-urlencoded"},
    body
  });
  const x=await r.json().catch(()=>({}));
  if(!r.ok || x.status!=="approved") throw new Error("PHONE_CODE_INVALID");
  return true;
}

function googleAuthUrl(state){
  const id=process.env.GOOGLE_CLIENT_ID;
  if(!id) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");
  const redirect=CANONICAL_PUBLIC_ORIGIN+"/api/human-proof/google/callback";
  const q=new URLSearchParams({
    client_id:id,redirect_uri:redirect,response_type:"code",
    scope:"openid email profile",state,
    prompt:"select_account",include_granted_scopes:"true"
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?"+q.toString();
}

async function googleExchange(code){
  const id=process.env.GOOGLE_CLIENT_ID, secret=process.env.GOOGLE_CLIENT_SECRET;
  if(!id||!secret) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");
  const redirect=CANONICAL_PUBLIC_ORIGIN+"/api/human-proof/google/callback";
  const tr=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code,client_id:id,client_secret:secret,redirect_uri:redirect,grant_type:"authorization_code"})
  });
  const tx=await tr.json().catch(()=>({}));
  if(!tr.ok||!tx.access_token) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  const ur=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:"Bearer "+tx.access_token}});
  const u=await ur.json().catch(()=>({}));
  if(!ur.ok||!u.sub) throw new Error("GOOGLE_USERINFO_FAILED");
  return {sub:String(u.sub),emailVerified:Boolean(u.email_verified)};
}

async function humanProofProviderHealth(){
  const out={
    phone:{configured:false,reachable:false},
    google:{configured:false,ready:false},
    facebook:{configured:false,ready:false}
  };

  if(process.env.INFOBIP_API_KEY&&process.env.INFOBIP_BASE_URL){
    out.phone.configured=true;
    out.phone.provider="infobip";
    try{
      await ensureInfobip2faConfig();
      out.phone.reachable=true;
    }catch(error){
      out.phone.error=String(error?.message||error);
    }
  }else{
    const sid=process.env.TWILIO_ACCOUNT_SID;
    const token=process.env.TWILIO_AUTH_TOKEN;
    const service=process.env.TWILIO_VERIFY_SERVICE_SID;
    out.phone.configured=Boolean(sid&&token&&service);
    out.phone.provider=out.phone.configured?"twilio":null;
    if(out.phone.configured){
      try{
        const r=await fetch("https://verify.twilio.com/v2/Services/"+encodeURIComponent(service),{
          headers:{authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")}
        });
        out.phone.reachable=r.ok;
      }catch{}
    }
  }

  const gid=process.env.GOOGLE_CLIENT_ID;
  const gsecret=process.env.GOOGLE_CLIENT_SECRET;
  out.google.configured=Boolean(gid&&gsecret);
  out.google.ready=Boolean(
    out.google.configured &&
    /\.apps\.googleusercontent\.com$/.test(String(gid))
  );

  const fid=process.env.FACEBOOK_APP_ID;
  const fsecret=process.env.FACEBOOK_APP_SECRET;
  const fversion=process.env.FACEBOOK_GRAPH_VERSION;
  out.facebook.configured=Boolean(fid&&fsecret&&fversion);
  out.facebook.ready=out.facebook.configured;

  return out;
}

function facebookAuthUrl(state){
  const id=process.env.FACEBOOK_APP_ID;
  if(!id) throw new Error("FACEBOOK_OAUTH_NOT_CONFIGURED");
  const redirect=CANONICAL_PUBLIC_ORIGIN+"/api/human-proof/facebook/callback";
  const q=new URLSearchParams({client_id:id,redirect_uri:redirect,state,response_type:"code",scope:"public_profile,email"});
  return "https://www.facebook.com/dialog/oauth?"+q.toString();
}

async function facebookExchange(code){
  const id=process.env.FACEBOOK_APP_ID,secret=process.env.FACEBOOK_APP_SECRET,version=process.env.FACEBOOK_GRAPH_VERSION;
  if(!id||!secret||!version) throw new Error("FACEBOOK_OAUTH_NOT_CONFIGURED");
  const redirect=CANONICAL_PUBLIC_ORIGIN+"/api/human-proof/facebook/callback";
  const tq=new URLSearchParams({client_id:id,client_secret:secret,redirect_uri:redirect,code});
  const tr=await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/oauth/access_token?${tq.toString()}`);
  const tx=await tr.json().catch(()=>({}));
  if(!tr.ok||!tx.access_token) throw new Error("FACEBOOK_TOKEN_EXCHANGE_FAILED");
  const ur=await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/me?fields=id&access_token=${encodeURIComponent(tx.access_token)}`);
  const u=await ur.json().catch(()=>({}));
  if(!ur.ok||!u.id) throw new Error("FACEBOOK_USERINFO_FAILED");
  return {sub:String(u.id)};
}

function safeRedirect(res,pathname){
  const p=String(pathname||"/human-signal.html");
  const safe=p.startsWith("/")&&!p.startsWith("//")?p:"/human-signal.html";
  res.writeHead(302,{...headers,location:safe,"cache-control":"no-store"});
  res.end();
}

function publicHumanProfile(profile,contributions=[]){
  return {
    id:profile.id,
    displayName:profile.displayName||profile.id,
    walletVerified:true,
    walletPublic:Boolean(profile.walletPublic),
    wallet:profile.walletPublic?profile.wallet:null,
    activeDays:Number(profile.activeDays||0),
    streak:Number(profile.streak||0),
    lastActiveDay:profile.lastActiveDay||null,
    trustConnections:(profile.trustConnections||[]).length,
    trustScore:trustScore(profile),
    roles:deriveRoles(profile,contributions),
    createdAt:profile.createdAt
  };
}


function loadHumanSignal(){
  try{
    if(!fs.existsSync(HUMAN_SIGNAL_FILE)) return {schemaVersion:"1.0",records:[],updatedAt:null};
    const parsed=JSON.parse(fs.readFileSync(HUMAN_SIGNAL_FILE,"utf8"));
    if(!parsed || !Array.isArray(parsed.records)) throw new Error("INVALID_HUMAN_SIGNAL_STORE");
    return parsed;
  }catch{
    return {schemaVersion:"1.0",records:[],updatedAt:null,storageRecovered:true};
  }
}

function saveHumanSignal(store){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  store.updatedAt=new Date().toISOString();
  atomicWriteJson(HUMAN_SIGNAL_FILE,store);
}

function requireHumanSignalOrigin(req){
  const expected=PUBLIC_BASE_URL.replace(/\/$/,"");
  const origin=String(req.headers.origin||"");
  if(origin!==expected) throw new Error("HUMAN_SIGNAL_ORIGIN_INVALID");
}

function requireHumanSignalReviewKey(req){
  const configured=process.env.HUMAN_SIGNAL_REVIEW_KEY;
  if(!configured) throw new Error("HUMAN_SIGNAL_REVIEW_KEY_NOT_CONFIGURED");
  const supplied=String(req.headers["x-human-signal-review-key"]||"");
  if(!supplied || supplied!==configured) throw new Error("HUMAN_SIGNAL_REVIEW_KEY_INVALID");
}

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


  if(req.method==="POST" && raw==="/api/human-signal/auth/challenge"){
    try{
      requireHumanSignalOrigin(req);
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const challenge=createWalletChallenge(parsed.wallet,CANONICAL_PUBLIC_ORIGIN);
      const store=loadHumanSignalNetwork();
      store.challenges=store.challenges.filter(x=>!x.used && Date.parse(x.expiresAt)>Date.now()).slice(-1000);
      store.challenges.push(challenge);
      saveHumanSignalNetwork(store);
      json(res,201,{ok:true,challenge:{challengeId:challenge.challengeId,wallet:challenge.wallet,message:challenge.message,expiresAt:challenge.expiresAt}});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:message==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/auth/verify"){
    try{
      requireHumanSignalOrigin(req);
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const store=loadHumanSignalNetwork();
      const challenge=store.challenges.find(x=>x.challengeId===String(parsed.challengeId||""));
      if(!challenge || challenge.used || Date.parse(challenge.expiresAt)<=Date.now()) throw new Error("CHALLENGE_INVALID_OR_EXPIRED");
      if(!verifySolanaMessage(challenge.wallet,challenge.message,String(parsed.signature||""))) throw new Error("SIGNATURE_INVALID");
      challenge.used=true;
      const id=profileIdForWallet(challenge.wallet);
      let profile=store.profiles.find(x=>x.id===id);
      if(!profile){
        profile={id,wallet:challenge.wallet,walletPublic:false,displayName:id,createdAt:new Date().toISOString(),activeDays:0,streak:0,lastActiveDay:null,trustConnections:[],reviewCount:0};
        store.profiles.push(profile);
      }
      const session=newSession(id);
      store.sessions=store.sessions.filter(x=>isSessionValid(x)).slice(-5000);
      store.sessions.push(session.record);
      saveHumanSignalNetwork(store);
      emitHsc("PROFILE_VERIFIED",profile.id,profile.id,{walletProof:true});
      const contributions=loadHumanSignal().records;
      json(res,200,{ok:true,token:session.token,expiresAt:session.record.expiresAt,profile:publicHumanProfile(profile,contributions)});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:message==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/me"){
    try{
      const store=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,store);
      const contributions=loadHumanSignal().records;
      json(res,200,{ok:true,profile:publicHumanProfile(profile,contributions)});
    }catch(error){
      json(res,401,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/session"){
    try{
      requireHumanSignalOrigin(req);
      const store=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,store);
      const today=utcDay();
      if(profile.lastActiveDay!==today){
        profile.streak=nextStreak(profile.lastActiveDay,profile.streak,today);
        profile.activeDays=Number(profile.activeDays||0)+1;
        profile.lastActiveDay=today;
        noteMeaningfulAction(profile,"DAILY_SIGNAL");
        saveHumanSignalNetwork(store);
        emitHsc("DAILY_SIGNAL",profile.id,profile.id,{day:today,streak:profile.streak});
      }
      const contributions=loadHumanSignal().records;
      json(res,200,{ok:true,alreadyActiveToday:profile.lastActiveDay===today,profile:publicHumanProfile(profile,contributions)});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:401;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/trust"){
    try{
      requireHumanSignalOrigin(req);
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const store=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,store);
      const targetId=String(parsed.targetProfileId||"").trim();
      const target=store.profiles.find(x=>x.id===targetId);
      if(!target) throw new Error("TARGET_PROFILE_NOT_FOUND");
      if(target.id===profile.id) throw new Error("SELF_TRUST_NOT_ALLOWED");
      profile.trustConnections=Array.isArray(profile.trustConnections)?profile.trustConnections:[];
      if(!profile.trustConnections.includes(target.id)){
        if(profile.trustConnections.length>=MAX_TRUST_CONNECTIONS) throw new Error("TRUST_CONNECTION_LIMIT");
        profile.trustConnections.push(target.id);
        noteMeaningfulAction(profile,"TRUST_CONNECTION");
        saveHumanSignalNetwork(store);
        emitHsc("TRUST_EDGE_ADDED",profile.id,target.id,{outgoingCount:profile.trustConnections.length});
      }
      const contributions=loadHumanSignal().records;
      json(res,200,{ok:true,profile:publicHumanProfile(profile,contributions)});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:message==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/network"){
    const store=loadHumanSignalNetwork();
    const contributions=loadHumanSignal().records;
    const profiles=store.profiles.map(p=>publicHumanProfile(p,contributions));
    json(res,200,{
      ok:true,
      protocol:"COHIBA Human Signal",
      version:"0.2",
      identityModel:"SOLANA_WALLET_SIGNATURE",
      tokenEmission:false,
      consensusClaimed:false,
      profileCount:profiles.length,
      activeToday:profiles.filter(x=>x.lastActiveDay===utcDay()).length,
      trustEdges:store.profiles.reduce((n,p)=>n+(p.trustConnections||[]).length,0),
      profiles:profiles.slice(0,100)
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/hsc/status"){
    const composite=hscCompositeStore();
    json(res,200,{
      ok:true,
      name:"COHIBA Human Signal Core",
      coreType:"APPLICATION_COORDINATION_LAYER",
      blockchainClaimed:false,
      settlementLayer:"Solana",
      ...networkHealth(composite)
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/hsc/state-root"){
    const composite=hscCompositeStore();
    const integrity=verifyEventChain(composite.events||[]);
    json(res,200,{
      ok:true,
      version:"0.1",
      eventChain:integrity,
      state:coreStateRoot(composite),
      anchoredOnSolana:false,
      note:"Current HSC root is deterministic off-chain application state. Solana anchoring is a later Devnet phase."
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/hsc/anchors"){
    const core=loadHumanSignalCore();
    json(res,200,{ok:true,anchors:(core.anchors||[]).slice().reverse().slice(0,100)});
    return;
  }

  if(req.method==="POST" && raw==="/api/hsc/anchor/devnet"){
    try{
      requireHumanSignalOrigin(req);
      requireHumanSignalReviewKey(req);
      const anchorRecord=await anchorHscStateDevnet();
      json(res,200,{ok:true,anchor:anchorRecord});
    }catch(error){
      const m=String(error?.message||error);
      const status=
        m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        m==="HUMAN_SIGNAL_REVIEW_KEY_INVALID"?403:
        ["HUMAN_SIGNAL_REVIEW_KEY_NOT_CONFIGURED","HSC_DEVNET_ANCHOR_LOCKED","DEVNET_SYSTEM_WALLET_NEEDS_FUNDING"].includes(m)?409:
        500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/hsc/apps"){
    const core=loadHumanSignalCore();
    json(res,200,{ok:true,count:(core.apps||[]).length,apps:(core.apps||[]),utilityEventCount:(core.appUtility||[]).length});
    return;
  }

  if(req.method==="POST" && raw==="/api/hsc/apps/register"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,network);
      const proof=publicHumanProof(profile);
      if(!["HUMAN_VERIFIED","STRONG_SIGNAL"].includes(proof.confidence.tier)) throw new Error("DEVELOPER_HUMAN_PROOF_REQUIRED");
      const core=loadHumanSignalCore();
      const app=registerCoreApp(core,{name:parsed.name,description:parsed.description,developerProfileId:profile.id,homepage:parsed.homepage});
      appendCoreEvent(core,{type:"APP_REGISTERED",actor:profile.id,subject:app.id,data:{name:app.name,homepage:app.homepage}});
      saveHumanSignalCore(core);
      json(res,201,{ok:true,app});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:m==="DEVELOPER_HUMAN_PROOF_REQUIRED"?403:m==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/hsc/apps/utility"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const network=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,network);
      const core=loadHumanSignalCore();
      const out=recordAppUtility(core,{appId:String(parsed.appId||""),profileId:profile.id,action:parsed.action,proofRef:parsed.proofRef||null});
      if(!out.duplicate){
        appendCoreEvent(core,{type:"APP_ACTION_RECORDED",actor:profile.id,subject:String(parsed.appId||""),data:{action:out.record.action,proofRef:out.record.proofRef}});
        saveHumanSignalCore(core);
        noteMeaningfulAction(profile,"APP_UTILITY");
        saveHumanSignalNetwork(network);
      }
      json(res,200,{ok:true,...out});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:m==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-proof/provider-health"){
    const health=await humanProofProviderHealth();
    const internal={
      identityPepperReady:Boolean(process.env.HUMAN_IDENTITY_PEPPER),
      reviewKeyReady:Boolean(process.env.HUMAN_SIGNAL_REVIEW_KEY)
    };
    const providerHealthReady=
      health.phone.configured&&health.phone.reachable&&
      health.google.ready&&
      health.facebook.ready;
    json(res,200,{
      ok:true,
      health,
      internal,
      providerHealthReady,
      mode:providerHealthReady&&internal.identityPepperReady&&internal.reviewKeyReady?"FULL_PROVIDER_READY":"GRACE"
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/human-proof/readiness"){
    const twilio=Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_VERIFY_SERVICE_SID);
    const infobip=Boolean(process.env.INFOBIP_API_KEY&&process.env.INFOBIP_BASE_URL);
    const phone=twilio||infobip;
    const google=Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
    const facebook=Boolean(process.env.FACEBOOK_APP_ID&&process.env.FACEBOOK_APP_SECRET&&process.env.FACEBOOK_GRAPH_VERSION);
    const identityPepperReady=Boolean(process.env.HUMAN_IDENTITY_PEPPER);
    const reviewKeyReady=Boolean(process.env.HUMAN_SIGNAL_REVIEW_KEY);
    const providersReady=phone&&google&&facebook;
    json(res,200,{
      ok:true,
      mode:providersReady?"FULL_PROVIDER_READY":"GRACE",
      providers:{phone,google,facebook},
      internal:{identityPepperReady,reviewKeyReady},
      miningHumanProofEnforced:process.env.ENFORCE_HUMAN_PROOF_FOR_MINING==="true",
      fullHumanVerificationReady:providersReady&&identityPepperReady&&reviewKeyReady
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/human-proof/status"){
    try{
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      json(res,200,{ok:true,proof:publicHumanProof(profile)});
    }catch(error){
      json(res,401,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-proof/phone/start"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      if(parsed.consent!==true) throw new Error("PHONE_CONSENT_REQUIRED");
      const phone=normalizePhone(parsed.phone);
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      const verification=await phoneVerifyStart(phone);
      profile.pendingPhoneHash=hashIdentity("phone",phone,identityPepper());
      profile.pendingPhoneProvider=verification.provider||"twilio";
      profile.pendingPhonePinId=verification.pinId||null;
      saveHumanSignalNetwork(store);
      json(res,200,{ok:true,status:"OTP_SENT"});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:["PHONE_VERIFY_NOT_CONFIGURED"].includes(m)?409:["PHONE_CONSENT_REQUIRED","INVALID_E164_PHONE"].includes(m)?400:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-proof/phone/check"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const phone=normalizePhone(parsed.phone);
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      const phoneHash=hashIdentity("phone",phone,identityPepper());
      if(profile.pendingPhoneHash!==phoneHash) throw new Error("PHONE_VERIFICATION_CONTEXT_MISMATCH");
      await phoneVerifyCheck(profile,phone,String(parsed.code||""));
      profile.humanProofs.phone={verified:true,identityHash:phoneHash,verifiedAt:new Date().toISOString(),provider:profile.pendingPhoneProvider||"twilio"};
      delete profile.pendingPhoneHash;
      delete profile.pendingPhoneProvider;
      delete profile.pendingPhonePinId;
      saveHumanSignalNetwork(store);
      emitHsc("HUMAN_PROOF_UPDATED",profile.id,profile.id,{factor:"PHONE"});
      json(res,200,{ok:true,proof:publicHumanProof(profile)});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:m==="PHONE_VERIFY_NOT_CONFIGURED"?409:["PHONE_CODE_INVALID","PHONE_VERIFICATION_CONTEXT_MISMATCH","INVALID_E164_PHONE"].includes(m)?400:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-proof/google/start"){
    try{
      requireHumanSignalOrigin(req);
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      const state=newOauthState(profile.id,"google","/human-signal.html?humanProof=google");
      store.oauthStates=store.oauthStates.filter(x=>isOauthStateValid(x)).slice(-2000);
      store.oauthStates.push(state); saveHumanSignalNetwork(store);
      json(res,200,{ok:true,authUrl:googleAuthUrl(state.state)});
    }catch(error){
      const m=String(error?.message||error);
      json(res,m==="GOOGLE_OAUTH_NOT_CONFIGURED"?409:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:401,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-proof/google/callback"){
    try{
      const url=new URL(req.url||"/","http://localhost");
      const stateValue=String(url.searchParams.get("state")||"");
      const code=String(url.searchParams.get("code")||"");
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const state=store.oauthStates.find(x=>x.state===stateValue&&x.provider==="google");
      if(!isOauthStateValid(state)||!code) throw new Error("OAUTH_STATE_INVALID");
      const identity=await googleExchange(code);
      state.used=true;
      const profile=store.profiles.find(x=>x.id===state.profileId);
      if(!profile) throw new Error("HUMAN_SIGNAL_PROFILE_NOT_FOUND");
      profile.humanProofs.google={verified:true,identityHash:hashIdentity("google",identity.sub,identityPepper()),verifiedAt:new Date().toISOString(),emailVerified:Boolean(identity.emailVerified)};
      saveHumanSignalNetwork(store);
      emitHsc("HUMAN_PROOF_UPDATED",profile.id,profile.id,{factor:"GOOGLE"});
      safeRedirect(res,state.returnTo+"&status=verified");
    }catch{
      safeRedirect(res,"/human-signal.html?humanProof=google&status=failed");
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-proof/facebook/start"){
    try{
      requireHumanSignalOrigin(req);
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      const state=newOauthState(profile.id,"facebook","/human-signal.html?humanProof=facebook");
      store.oauthStates=store.oauthStates.filter(x=>isOauthStateValid(x)).slice(-2000);
      store.oauthStates.push(state); saveHumanSignalNetwork(store);
      json(res,200,{ok:true,authUrl:facebookAuthUrl(state.state)});
    }catch(error){
      const m=String(error?.message||error);
      json(res,m==="FACEBOOK_OAUTH_NOT_CONFIGURED"?409:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:401,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-proof/facebook/callback"){
    try{
      const url=new URL(req.url||"/","http://localhost");
      const stateValue=String(url.searchParams.get("state")||"");
      const code=String(url.searchParams.get("code")||"");
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const state=store.oauthStates.find(x=>x.state===stateValue&&x.provider==="facebook");
      if(!isOauthStateValid(state)||!code) throw new Error("OAUTH_STATE_INVALID");
      const identity=await facebookExchange(code);
      state.used=true;
      const profile=store.profiles.find(x=>x.id===state.profileId);
      if(!profile) throw new Error("HUMAN_SIGNAL_PROFILE_NOT_FOUND");
      profile.humanProofs.facebook={verified:true,identityHash:hashIdentity("facebook",identity.sub,identityPepper()),verifiedAt:new Date().toISOString()};
      saveHumanSignalNetwork(store);
      emitHsc("HUMAN_PROOF_UPDATED",profile.id,profile.id,{factor:"FACEBOOK"});
      safeRedirect(res,state.returnTo+"&status=verified");
    }catch{
      safeRedirect(res,"/human-signal.html?humanProof=facebook&status=failed");
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/pioneer"){
    try{
      const networkStore=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,networkStore);
      const contributionStore=loadHumanSignal();
      profile.hasContribution=contributionStore.records.some(r=>r.profileId===profile.id);
      profile.hasMined=(networkStore.miningSessions||[]).some(x=>x.profileId===profile.id);
      const providers=humanProofProvidersReady();
      const enforce=process.env.MINING_HUMAN_PROOF_MODE==="enforced" && providers.ready;
      const support=publicPioneerSupport(profile,{providersReady:providers.ready,enforceHumanProof:enforce});
      support.verifiedReferrals=verifiedReferralCountFor(profile,networkStore.profiles);
      support.referralBoost=referralBoost(support.verifiedReferrals);
      saveHumanSignalNetwork(networkStore);
      json(res,200,{
        ok:true,
        mode:enforce?"enforced":"grace",
        providers,
        support,
        miningRate:miningRateForProfile(profile,networkStore,contributionStore)
      });
    }catch(error){
      json(res,401,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/referral/apply"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const code=String(parsed.code||"").trim().toUpperCase();
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      if(profile.invitedBy) throw new Error("REFERRAL_ALREADY_ATTRIBUTED");
      const inviter=store.profiles.find(p=>String(p.referralCode||"").toUpperCase()===code);
      if(!inviter) throw new Error("REFERRAL_CODE_NOT_FOUND");
      if(inviter.id===profile.id) throw new Error("SELF_REFERRAL_NOT_ALLOWED");
      profile.invitedBy=inviter.referralCode;
      noteMeaningfulAction(profile,"REFERRAL_ATTRIBUTED");
      saveHumanSignalNetwork(store);
      json(res,200,{ok:true,invitedBy:profile.invitedBy,note:"Referral boost for inviter counts only after invitee reaches HUMAN_VERIFIED."});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:m==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/readiness"){
    const providers=humanProofProvidersReady();
    json(res,200,{
      ok:true,
      miningHumanProofMode:process.env.MINING_HUMAN_PROOF_MODE||"grace",
      providers,
      devnetAnchorEnabled:process.env.ALLOW_HSC_DEVNET_ANCHOR==="true",
      reviewKeyConfigured:Boolean(process.env.HUMAN_SIGNAL_REVIEW_KEY),
      missing:[
        ...(!providers.pepper?["HUMAN_IDENTITY_PEPPER"]:[]),
        ...(!providers.phone?["TWILIO_VERIFY"]:[]),
        ...(!providers.google?["GOOGLE_OAUTH"]:[]),
        ...(!providers.facebook?["FACEBOOK_OAUTH"]:[]),
        ...(!process.env.HUMAN_SIGNAL_REVIEW_KEY?["HUMAN_SIGNAL_REVIEW_KEY"]:[])
      ]
    });
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/mining/start"){
    try{
      requireHumanSignalOrigin(req);
      const networkStore=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,networkStore);
      const contributionStore=loadHumanSignal();
      networkStore.miningSessions=Array.isArray(networkStore.miningSessions)?networkStore.miningSessions:[];
      const active=networkStore.miningSessions.find(x=>x.profileId===profile.id && x.status==="ACTIVE" && Date.parse(x.endsAt)>Date.now());
      if(active){
        json(res,409,{ok:false,error:"MINING_SESSION_ALREADY_ACTIVE",session:publicMiningSession(active)});
        return;
      }
      const stale=networkStore.miningSessions.find(x=>x.profileId===profile.id && x.status==="ACTIVE" && Date.parse(x.endsAt)<=Date.now());
      if(stale) applyClaim(stale,profile,Date.now());
      if(profile.pioneer===undefined){
        profile.pioneer=networkStore.profiles.findIndex(x=>x.id===profile.id)<PIONEER_COHORT_SIZE;
      }
      const rate=miningRateForProfile(profile,networkStore,contributionStore);
      if(rate.eligibilityFactor<=0) throw new Error("MINING_NOT_ELIGIBLE");
      const session=newMiningSession(profile.id,rate);
      networkStore.miningSessions.push(session);
      saveHumanSignalNetwork(networkStore);
      emitHsc("MINING_STARTED",profile.id,session.id,{rate:session.rateSnapshot.rate,version:session.version});
      json(res,201,{ok:true,session:publicMiningSession(session),profile:{id:profile.id,signalPoints:Number(profile.signalPoints||0),pioneer:Boolean(profile.pioneer)}});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:message==="HUMAN_SIGNAL_AUTH_REQUIRED"||message==="HUMAN_SIGNAL_SESSION_INVALID"?401:message==="MINING_NOT_ELIGIBLE"?403:500;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/mining/claim"){
    try{
      requireHumanSignalOrigin(req);
      const networkStore=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,networkStore);
      networkStore.miningSessions=Array.isArray(networkStore.miningSessions)?networkStore.miningSessions:[];
      const session=networkStore.miningSessions.slice().reverse().find(x=>x.profileId===profile.id && x.status==="ACTIVE");
      if(!session) throw new Error("NO_ACTIVE_MINING_SESSION");
      const claim=applyClaim(session,profile,Date.now());
      saveHumanSignalNetwork(networkStore);
      emitHsc("MINING_CLAIMED",profile.id,session.id,{amount:claim.amount,ended:claim.ended});
      json(res,200,{ok:true,claim,session:publicMiningSession(session),profile:{id:profile.id,signalPoints:Number(profile.signalPoints||0),pioneer:Boolean(profile.pioneer)}});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:message==="HUMAN_SIGNAL_AUTH_REQUIRED"||message==="HUMAN_SIGNAL_SESSION_INVALID"?401:message==="NO_ACTIVE_MINING_SESSION"?409:500;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/mining/status"){
    try{
      const networkStore=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,networkStore);
      networkStore.miningSessions=Array.isArray(networkStore.miningSessions)?networkStore.miningSessions:[];
      const contributionStore=loadHumanSignal();
      const active=networkStore.miningSessions.slice().reverse().find(x=>x.profileId===profile.id && x.status==="ACTIVE");
      const rate=miningRateForProfile(profile,networkStore,contributionStore);
      json(res,200,{
        ok:true,
        unit:"SIGNAL_POINTS",
        transferable:false,
        token:false,
        conversionPromised:false,
        profile:{id:profile.id,signalPoints:Number(profile.signalPoints||0),pioneer:Boolean(profile.pioneer)},
        currentRate:rate,
        session:active?publicMiningSession(active):null
      });
    }catch(error){
      json(res,401,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/mining/network"){
    const networkStore=loadHumanSignalNetwork();
    const contributionStore=loadHumanSignal();
    const profiles=networkStore.profiles||[];
    const pioneerCount=profiles.filter(x=>x.pioneer).length;
    const activeSessions=(networkStore.miningSessions||[]).filter(x=>x.status==="ACTIVE" && Date.parse(x.endsAt)>Date.now()).length;
    json(res,200,{
      ok:true,
      model:"COHIBA_SIGNAL_MINING_V0_1",
      browserActivated:true,
      proofOfWork:false,
      cpuGpuMining:false,
      coEmission:false,
      signalPointsTransferable:false,
      profileCount:profiles.length,
      pioneerCohortLimit:PIONEER_COHORT_SIZE,
      pioneerCount,
      activeMiningSessions:activeSessions,
      baseRate:calculateMiningRate({profile:{},profileCount:profiles.length}).baseRate,
      generatedAt:new Date().toISOString()
    });
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/contributions"){
    try{
      requireHumanSignalOrigin(req);
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>8192) throw new Error("REQUEST_TOO_LARGE");
      }
      const normalized=normalizeContribution(body?JSON.parse(body):{});
      const proofHash=contributionDigest(normalized);
      const id=contributionId(proofHash);
      const store=loadHumanSignal();
      let linkedProfileId=null;
      try{
        const networkStore=loadHumanSignalNetwork();
        linkedProfileId=authHumanSignalProfile(req,networkStore).id;
      }catch{}
      const existing=store.records.find(x=>x.proofHash===proofHash);
      if(existing){
        json(res,409,{ok:false,error:"DUPLICATE_CONTRIBUTION",record:publicContribution(existing)});
        return;
      }
      const record={
        ...normalized,
        id,
        proofHash,
        profileId:linkedProfileId,
        status:"SUBMITTED",
        submittedAt:new Date().toISOString(),
        reviewedAt:null,
        reviewNote:null,
        onChain:null
      };
      store.records.push(record);
      saveHumanSignal(store);
      emitHsc("CONTRIBUTION_SUBMITTED",linkedProfileId||normalized.contributor,record.id,{proofHash:record.proofHash,type:record.type});
      if(linkedProfileId){
        const networkStore=loadHumanSignalNetwork();
        const linkedProfile=networkStore.profiles.find(x=>x.id===linkedProfileId);
        if(linkedProfile){
          noteMeaningfulAction(linkedProfile,"CONTRIBUTION_SUBMIT");
          saveHumanSignalNetwork(networkStore);
        }
      }
      json(res,201,{ok:true,record:publicContribution(record)});
    }catch(error){
      const message=String(error?.message||error);
      const status=
        message==="REQUEST_TOO_LARGE"?413:
        message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["INVALID_CONTRIBUTION_TYPE","INVALID_EVIDENCE_URL","TITLE_TOO_SHORT","SUMMARY_TOO_SHORT","EVIDENCE_URL_REQUIRED"].includes(message)?400:
        500;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/contributions"){
    const store=loadHumanSignal();
    const records=store.records.slice().reverse().slice(0,100).map(publicContribution);
    json(res,200,{
      ok:true,
      protocol:"COHIBA Human Signal",
      version:"0.1",
      proofClass:"COHIBA_HUMAN_SIGNAL_OFFCHAIN_SHA256_V1",
      onChainProofClaimed:false,
      count:store.records.length,
      records,
      updatedAt:store.updatedAt
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/reputation"){
    const store=loadHumanSignal();
    json(res,200,{
      ok:true,
      protocol:"COHIBA Human Signal",
      scoringVersion:"0.1",
      tokenEntitlement:false,
      leaderboard:reputationTable(store.records),
      updatedAt:store.updatedAt
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/proof"){
    const url=new URL(req.url||"/","http://localhost");
    const key=String(url.searchParams.get("id")||url.searchParams.get("hash")||"").trim();
    const store=loadHumanSignal();
    const record=store.records.find(x=>x.id===key || x.proofHash===key);
    if(!record){
      json(res,404,{ok:false,error:"PROOF_NOT_FOUND"});
      return;
    }
    json(res,200,{ok:true,record:publicContribution(record)});
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/review"){
    try{
      requireHumanSignalOrigin(req);
      requireHumanSignalReviewKey(req);
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const id=String(parsed.id||"").trim();
      const status=String(parsed.status||"").trim().toUpperCase();
      if(!["VERIFIED","REJECTED","SUBMITTED"].includes(status)) throw new Error("INVALID_REVIEW_STATUS");
      const store=loadHumanSignal();
      const record=store.records.find(x=>x.id===id);
      if(!record) throw new Error("PROOF_NOT_FOUND");
      record.status=status;
      record.reviewedAt=new Date().toISOString();
      record.reviewNote=String(parsed.reviewNote||"").trim().slice(0,500)||null;
      saveHumanSignal(store);
      if(status==="VERIFIED"||status==="REJECTED"){
        emitHsc(status==="VERIFIED"?"CONTRIBUTION_VERIFIED":"CONTRIBUTION_REJECTED","REVIEWER",record.id,{profileId:record.profileId||null,type:record.type});
      }
      json(res,200,{ok:true,record:publicContribution(record)});
    }catch(error){
      const message=String(error?.message||error);
      const status=
        message==="REQUEST_TOO_LARGE"?413:
        ["HUMAN_SIGNAL_ORIGIN_INVALID","HUMAN_SIGNAL_REVIEW_KEY_INVALID"].includes(message)?403:
        message==="HUMAN_SIGNAL_REVIEW_KEY_NOT_CONFIGURED"?409:
        ["INVALID_REVIEW_STATUS","PROOF_NOT_FOUND"].includes(message)?400:
        500;
      json(res,status,{ok:false,error:message});
    }
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
