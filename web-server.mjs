import { humanSignalOpenAPI } from './lib/human-signal-openapi.mjs';
import {IntegrationCheckout, CHECKOUT_STORE, checkoutStoreSpec, checkoutReadiness} from './lib/integration-checkout.mjs';
import {PiPlatformPayments} from './integrations/pi/platform-payments.mjs';
import { prepareOpenUsdTransfer } from './integrations/open-standard/ousd-transaction.mjs';
import { inspectOpenUsdSolana } from './integrations/open-standard/ousd-solana.mjs';
import { createOpenUsdPaymentRequest, verifyOpenUsdPayment } from './integrations/open-standard/ousd-wallet-payments.mjs';
import { verifyPiAccessToken, bindPiIdentity } from './lib/pi-network-link.mjs';
import {allowedHumanSignalOrigins as configuredHumanOrigins,requireHumanSignalOrigin as validateHumanOrigin} from "./lib/human-signal-origin.mjs";
import {agencyGraph} from "./lib/agency-graph.mjs";
import {CheckpointWorker} from "./lib/checkpoint-worker.mjs";
import {AccountStateDatabase, transactionalResponse} from "./lib/account-state-postgres.mjs";
import { BackupWorker } from "./lib/backup-worker.mjs";
import { PohaDatabase, serviceSigningBytes } from "./lib/poha-postgres.mjs";
import { DISCLOSURE_POLICY_VERSION } from "./lib/poha-disclosure.mjs";
import { readJson, writeJson } from "./lib/durable-json.mjs";
import http from "node:http";
import {humanSignalReleaseReadiness} from './lib/human-signal-release.mjs';
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, clusterApiUrl } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getMint, setAuthority, AuthorityType } from "@solana/spl-token";
import { createV1, findMetadataPda, mplTokenMetadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, percentAmount, publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { normalizeContribution, contributionDigest, contributionId, publicContribution, reputationTable } from "./lib/human-signal.mjs";
import { createWalletChallenge, verifySolanaMessage, newSession, hashSessionToken, isSessionValid, profileIdForWallet, utcDay, nextStreak, deriveRoles, trustScore, MAX_TRUST_CONNECTIONS } from "./lib/human-signal-network.mjs";
import { calculateMiningRate, newMiningSession, applyClaim, publicMiningSession, PIONEER_COHORT_SIZE } from "./lib/signal-mining.mjs";
import { resourceContributionScore, recordResourceHeartbeat } from "./lib/resource-mining.mjs";
import { createNodeJob, publicNodeJob, verifyNodeJob, jobCooldownRemaining } from "./lib/node-jobs.mjs";
import { miningReserveState, rateUnits } from "./lib/mining-economics.mjs";
import { hashIdentity, normalizePhone, newOauthState, isOauthStateValid, publicHumanProof } from "./lib/human-proof.mjs";
import { appendCoreEvent, verifyEventChain, coreStateRoot, trustStateRoot, registerCoreApp, recordAppUtility, networkHealth } from "./lib/human-signal-core.mjs";
import { sovereigntyStatus } from "./lib/sovereignty-inference.mjs";
import { guardDirectHumanMutation } from "./lib/human-signal-core-v1-alpha.mjs";
import { bindAgent, createSignedDelegation, revokeSignedRecord, inspectAction } from "./lib/poha-v1.mjs";
import { registerAgent, grantDelegation, revokeDelegation, agencyForOwner } from "./lib/human-agency.mjs";
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
const otpRateWindows = new Map();
const loginRateWindows = new Map();
const providerFetch=(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});

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

function enforceOtpRateLimit(req,phoneHash,kind){
  const now=Date.now();
  const windowMs=10*60*1000;
  const max=kind==="start"?3:8;
  const key=kind+":"+requestIp(req)+":"+String(phoneHash||"").slice(0,32);
  const recent=(otpRateWindows.get(key)||[]).filter(ts=>now-ts<windowMs);
  if(recent.length>=max) throw new Error("OTP_RATE_LIMITED");
  recent.push(now);
  otpRateWindows.set(key,recent);
  if(otpRateWindows.size>10000){
    for(const [k,times] of otpRateWindows){
      if(!times.some(ts=>now-ts<windowMs)) otpRateWindows.delete(k);
    }
  }
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
  const id=accountStoreId(file);
  if(accountDatabaseRequired && id){if(!accountDatabase)throw new Error("ACCOUNT_STORAGE_UNAVAILABLE");accountDatabase.write(id,value);return;}
  writeJson(file,value);
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
const ACCOUNT_ONBOARDING_FILE=path.join(DATA_DIR,"cohiba-account-onboarding.json");

function loadAccountOnboarding(){return readAccountState(ACCOUNT_ONBOARDING_FILE,{schemaVersion:"1.0",records:[],updatedAt:null},s=>Array.isArray(s.records));}
function saveAccountOnboarding(store){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  store.updatedAt=new Date().toISOString();
  atomicWriteJson(ACCOUNT_ONBOARDING_FILE,store);
}
function onboardingTokenHash(token){
  return crypto.createHash("sha256").update(String(token||"")).digest("hex");
}
function cleanDisplayName(value){
  const name=String(value||"").trim().replace(/\s+/g," ");
  if(name.length<3 || name.length>32) throw new Error("DISPLAY_NAME_LENGTH");
  if(!/^[\p{L}\p{N}_. -]+$/u.test(name)) throw new Error("DISPLAY_NAME_INVALID");
  return name;
}

function validateAccountPassword(value){
  const password=String(value||"");
  if(password.length<8 || password.length>128) throw new Error("PASSWORD_LENGTH");
  if(!/[A-Za-z\p{L}]/u.test(password) || !/\d/.test(password)) throw new Error("PASSWORD_COMPLEXITY");
  return password;
}
function createPasswordCredential(password){
  const value=validateAccountPassword(password);
  const salt=crypto.randomBytes(16);
  const hash=crypto.scryptSync(value,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return {scheme:"scrypt-v1",salt:salt.toString("base64"),hash:hash.toString("base64"),updatedAt:new Date().toISOString()};
}
function verifyPasswordCredential(password,credential){
  try{
    if(!credential || credential.scheme!=="scrypt-v1") return false;
    const salt=Buffer.from(String(credential.salt||""),"base64");
    const expected=Buffer.from(String(credential.hash||""),"base64");
    if(salt.length<16 || expected.length!==64) return false;
    const actual=crypto.scryptSync(String(password||""),salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    return crypto.timingSafeEqual(expected,actual);
  }catch{return false;}
}
function enforceLoginRateLimit(req,phoneHash){
  const now=Date.now(),windowMs=15*60*1000,max=8;
  const key=requestIp(req)+":"+String(phoneHash||"").slice(0,32);
  const recent=(loginRateWindows.get(key)||[]).filter(ts=>now-ts<windowMs);
  if(recent.length>=max) throw new Error("LOGIN_RATE_LIMITED");
  recent.push(now);loginRateWindows.set(key,recent);
  if(loginRateWindows.size>5000){
    for(const [k,times] of loginRateWindows){
      if(!times.some(ts=>now-ts<windowMs)) loginRateWindows.delete(k);
    }
  }
}

function validOnboardingRecord(record){
  return Boolean(record && record.status==="PROFILE_READY" && record.tokenHash && Date.parse(record.tokenExpiresAt)>Date.now() && !record.usedAt);
}

function loadHumanSignalCore(){return readAccountState(HUMAN_SIGNAL_CORE_FILE,{schemaVersion:"1.0",events:[],apps:[],appUtility:[],updatedAt:null},s=>Array.isArray(s.events)&&Array.isArray(s.apps||[])&&Array.isArray(s.appUtility||[]));}

function saveHumanSignalCore(store){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  store.updatedAt=new Date().toISOString();
  atomicWriteJson(HUMAN_SIGNAL_CORE_FILE,store);
}

let accountDatabase=null;
const accountDatabaseRequired=Boolean(process.env.HUMAN_SIGNAL_DATABASE_URL)&&process.env.HS_ACCOUNT_STORAGE==="postgres";
const accountStoreId=file=>({[HUMAN_SIGNAL_NETWORK_FILE]:"network",[ACCOUNT_ONBOARDING_FILE]:"onboarding",[HUMAN_SIGNAL_CORE_FILE]:"core",[HUMAN_SIGNAL_FILE]:"contributions"}[file]);
function readAccountState(file,fallback,validate){
  if(accountDatabaseRequired){if(!accountDatabase)throw new Error("ACCOUNT_STORAGE_UNAVAILABLE");return accountDatabase.read(accountStoreId(file));}
  return readJson(file,fallback,validate);
}
let pohaDatabase=null;
let disclosurePilot=null;
let backupWorker=null;
let checkpointWorker=null;
const pohaDatabaseRequired=Boolean(process.env.HUMAN_SIGNAL_DATABASE_URL);
function resolvePohaPrincipal(id,audience){
  const network=loadHumanSignalNetwork();
  if(network.storageRecovered)return null;
  const profile=network.profiles.find(p=>p.id===id);
  if(!profile?.wallet)return null;
  const phone=profile.humanProofs?.phone;
  const valid=phone?.verified===true && !phone.revokedAt && /^[a-f0-9]{64}$/.test(phone.identityHash||"") && Number.isFinite(Date.parse(phone.verifiedAt)) && Date.parse(phone.verifiedAt)<=Date.now() && Date.now()-Date.parse(phone.verifiedAt)<30*86400000;
  const unique=valid && network.profiles.filter(p=>p.humanProofs?.phone?.verified===true && p.humanProofs.phone.identityHash===phone.identityHash).length===1;
  return {principalId:profile.id,principalKey:Buffer.from(new PublicKey(profile.wallet).toBytes()).toString("base64"),audience,identityAssurance:unique?"PHONE_VERIFIED":"NONE",assuranceExpiresAt:unique?new Date(Date.parse(phone.verifiedAt)+30*86400000).toISOString():null};
}

function hscCompositeStore(){
  const core=loadHumanSignalCore();
  const net=loadHumanSignalNetwork();
  const contrib=loadHumanSignal();
  return {
    ...core,
    storageRecovered:Boolean(core.storageRecovered || net.storageRecovered || contrib.storageRecovered),
    profiles:net.profiles||[],
    contributions:contrib.records||[]
  };
}

async function anchorHscStateDevnet(){
  if(process.env.ALLOW_HSC_DEVNET_ANCHOR!=="true") throw new Error("HSC_DEVNET_ANCHOR_LOCKED");
  const composite=hscCompositeStore();
  if(composite.storageRecovered || !verifyEventChain(composite.events||[]).valid || (pohaDatabaseRequired && !pohaDatabase))throw new Error("HSC_ANCHOR_STORAGE_UNAVAILABLE");
  const state=trustStateRoot(pohaDatabase?{...composite,...await pohaDatabase.snapshot()}:composite);
  const core=loadHumanSignalCore();
  core.anchors=Array.isArray(core.anchors)?core.anchors:[];
  const existing=core.anchors.find(a=>a.network==="devnet"&&a.stateRoot===state.stateRoot);
  if(existing) return existing;
  const payload={
    protocol:"HUMAN_SIGNAL_TRUST",
    version:"HS_TRUST_STATE_V1",
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
  const connection=await ensureDevnetFunding(DEVNET_PAYER);
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
  const latestCore=loadHumanSignalCore();
  if(latestCore.storageRecovered || !verifyEventChain(latestCore.events||[]).valid)throw new Error("HSC_ANCHOR_STORAGE_UNAVAILABLE");
  latestCore.anchors=Array.isArray(latestCore.anchors)?latestCore.anchors:[];
  latestCore.anchors.push(anchorRecord);
  appendCoreEvent(latestCore,{type:"STATE_ROOT_ANCHORED",actor:"SYSTEM",subject:anchorRecord.id,data:{network:"devnet",stateRoot:state.stateRoot,signature}});
  saveHumanSignalCore(latestCore);
  return anchorRecord;
}

function emitHsc(type,actor="SYSTEM",subject=null,data={}){
  const core=loadHumanSignalCore();
  const event=appendCoreEvent(core,{type,actor,subject,data});
  saveHumanSignalCore(core);
  return event;
}

function guardHscMutation(profileId,action,receiptData={}){
  const core=loadHumanSignalCore();
  if(core.storageRecovered || !verifyEventChain(core.events||[]).valid) throw new Error("HUMAN_SIGNAL_CORE_UNAVAILABLE");
  const out=guardDirectHumanMutation(core,{profileId,action,receiptData});
  if(out.verdict!=="ALLOW") throw new Error("HUMAN_SIGNAL_"+String(out.reason||"DENY"));
  saveHumanSignalCore(core);
  return out.receipt;
}


function loadHumanSignalNetwork(){return readAccountState(HUMAN_SIGNAL_NETWORK_FILE,{schemaVersion:"1.0",profiles:[],challenges:[],sessions:[],updatedAt:null},s=>Array.isArray(s.profiles)&&Array.isArray(s.challenges)&&Array.isArray(s.sessions));}

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
function authHumanSignalSession(req,store){
  const auth=String(req.headers.authorization||"");
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token) throw new Error("HUMAN_SIGNAL_AUTH_REQUIRED");
  const hash=hashSessionToken(token);
  const session=store.sessions.find(x=>x.tokenHash===hash);
  if(!isSessionValid(session)) throw new Error("HUMAN_SIGNAL_SESSION_INVALID");
  return {token,hash,session};
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
  const resource=resourceContributionScore(profile);
  return calculateMiningRate({
    profile,
    profileCount:networkStore.profiles.length,
    verifiedReputation30d:verifiedReputationForProfile(profile.id,contributionStore.records),
    meaningfulActions7d:meaningfulActions7d(profile),
    referralBoostInput:referralBoost(verifiedReferrals),
    eligibilityFactor:support.eligibility.factor,
    resourceScoreInput:resource.score
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
    const r=await providerFetch(base+"/2fa/2/applications",{
      method:"POST",headers,
      body:JSON.stringify({
        name:"COHIBA Human Verification",
        configuration:{
          pinAttempts:5,
          allowMultiplePinVerifications:false,
          pinTimeToLive:"5m",
          verifyPinLimit:"1/3s",
          sendPinPerApplicationLimit:"10000/1d",
          sendPinPerPhoneNumberLimit:"10/1d"
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

  if(cfg.applicationId && cfg.rateLimitVersion!=="10-per-day-v1"){
    try{
      const r=await providerFetch(base+"/2fa/2/applications/"+encodeURIComponent(cfg.applicationId),{
        method:"PUT",
        headers,
        body:JSON.stringify({
          name:"COHIBA Human Verification",
          configuration:{
            pinAttempts:5,
            allowMultiplePinVerifications:false,
            pinTimeToLive:"5m",
            verifyPinLimit:"1/3s",
            sendPinPerApplicationLimit:"10000/1d",
            sendPinPerPhoneNumberLimit:"10/1d"
          },
          enabled:true
        })
      });
      const x=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error("INFOBIP_2FA_APPLICATION_UPDATE_FAILED_"+String(r.status));
      cfg.rateLimitVersion="10-per-day-v1";
      cfg.applicationUpdatedAt=new Date().toISOString();
      saveInfobip2faConfig(cfg);
    }catch(error){
      console.error("COHIBA_INFOBIP_CONFIG_UPDATE_FAILED",String(error?.message||error));
    }
  }

  if(!cfg.messageId){
    const r=await providerFetch(base+"/2fa/2/applications/"+encodeURIComponent(cfg.applicationId)+"/messages",{
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
  const r=await providerFetch(infobipBaseUrl()+"/2fa/2/pin",{
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
  if(!r.ok || !x.pinId){
    const providerCode=String(x?.requestError?.serviceException?.messageId||x?.errorCode||x?.code||r.status||"UNKNOWN").slice(0,80);
    console.error("COHIBA_INFOBIP_SEND_FAILED",JSON.stringify({httpStatus:r.status,providerCode}));
    if(r.status===429 || /LIMIT|RATE|TOO_MANY/i.test(providerCode)) throw new Error("OTP_PROVIDER_DAILY_LIMIT");
    throw new Error("PHONE_VERIFY_SEND_FAILED");
  }
  return {
    status:"accepted",
    provider:"infobip",
    pinId:String(x.pinId),
    acceptedAt:new Date().toISOString()
  };
}

async function infobipVerifyCheck(pinId,code){
  if(!pinId) throw new Error("PHONE_VERIFICATION_CONTEXT_MISMATCH");
  const r=await providerFetch(infobipBaseUrl()+"/2fa/2/pin/"+encodeURIComponent(pinId)+"/verify",{
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
  const r=await providerFetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,{
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
  const r=await providerFetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,{
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
  const tr=await providerFetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({code,client_id:id,client_secret:secret,redirect_uri:redirect,grant_type:"authorization_code"})
  });
  const tx=await tr.json().catch(()=>({}));
  if(!tr.ok||!tx.access_token) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  const ur=await providerFetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:"Bearer "+tx.access_token}});
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
        const r=await providerFetch("https://verify.twilio.com/v2/Services/"+encodeURIComponent(service),{
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
  const tr=await providerFetch(`https://graph.facebook.com/${encodeURIComponent(version)}/oauth/access_token?${tq.toString()}`);
  const tx=await tr.json().catch(()=>({}));
  if(!tr.ok||!tx.access_token) throw new Error("FACEBOOK_TOKEN_EXCHANGE_FAILED");
  const ur=await providerFetch(`https://graph.facebook.com/${encodeURIComponent(version)}/me?fields=id&access_token=${encodeURIComponent(tx.access_token)}`);
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
  const proof=publicHumanProof(profile);
  const walletActivated=Boolean(profile.cohWallet?.ownerAddress);
  const reviewStatus=String(profile.mainnetReviewStatus||"PENDING");
  const mainnetEligible=proof.confidence.tier==="HUMAN_VERIFIED" && walletActivated && reviewStatus==="APPROVED";
  return {
    id:profile.id,
    displayName:profile.displayName||profile.id,
    walletVerified:Boolean(profile.wallet),
    piIdentity:{linked:Boolean(profile.externalIdentities?.pi),verifiedAt:profile.externalIdentities?.pi?.verifiedAt||null,validUntil:profile.externalIdentities?.pi?.validUntil||null,executionAuthorized:false},
    walletPublic:Boolean(profile.walletPublic),
    wallet:profile.walletPublic?profile.wallet:null,
    cohWallet:{
      activated:walletActivated,
      ownerAddress:walletActivated?profile.cohWallet.ownerAddress:null,
      custody:"NON_CUSTODIAL",
      network:"SOLANA",
      phase:walletActivated?(profile.cohWallet.phase||"PRE_MAINNET"):"NOT_ACTIVATED",
      tokenAccount:profile.cohWallet?.tokenAccount||null,
      recoveryByCohiba:false
    },
    mining:{
      signalPoints:Number(profile.signalPoints||0),
      pendingCoh:Number(profile.pendingCoh||0),
      pendingCohClass:"PROVISIONAL_OFFCHAIN",
      transferable:false,
      sellable:false,
      finalDistributionGuaranteed:false
    },
    humanProofTier:proof.confidence.tier,
    mainnetReviewStatus:reviewStatus,
    mainnetEligible,
    activeDays:Number(profile.activeDays||0),
    streak:Number(profile.streak||0),
    lastActiveDay:profile.lastActiveDay||null,
    trustConnections:(profile.trustConnections||[]).length,
    trustScore:trustScore(profile),
    roles:deriveRoles(profile,contributions),
    createdAt:profile.createdAt
  };
}


function loadHumanSignal(){return readAccountState(HUMAN_SIGNAL_FILE,{schemaVersion:"1.0",records:[],updatedAt:null},s=>Array.isArray(s.records));}

function saveHumanSignal(store){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  store.updatedAt=new Date().toISOString();
  atomicWriteJson(HUMAN_SIGNAL_FILE,store);
}

function allowedHumanSignalOrigins(){
  return configuredHumanOrigins({canonical:CANONICAL_PUBLIC_ORIGIN,publicBase:PUBLIC_BASE_URL,railwayDomain:process.env.RAILWAY_PUBLIC_DOMAIN,extraOrigins:String(process.env.HUMAN_SIGNAL_ALLOWED_ORIGINS||"" ).split(",").map(value=>value.trim()).filter(Boolean)});
}
function requireHumanSignalOrigin(req){validateHumanOrigin(req,allowedHumanSignalOrigins());}

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

function loadCommunityMetrics(){return readJson(COMMUNITY_METRICS_FILE,{schemaVersion:"1.0",totals:{},days:{},updatedAt:null},s=>typeof s.totals==="object"&&typeof s.days==="object");}
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

async function handleRequest(req,res){
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

  if(raw.startsWith("/api/") && !req.hsRateLimitChecked && !rateLimitApi(req)){
    res.writeHead(429,{...headers,"content-type":"application/json; charset=utf-8","cache-control":"no-store","retry-after":"60"});
    res.end(JSON.stringify({ok:false,error:"RATE_LIMITED"}));
    return;
  }


  if(req.method==="GET" && raw==="/api/integrations/config"){
    const checkout=checkoutReadiness(process.env,Boolean(accountDatabase));
    json(res,200,{ok:true,ousd:{network:"solana-mainnet",mint:"ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB",walletApprovalRequired:true},pi:{enabled:process.env.PI_APP_ENABLED==="true",sandbox:process.env.PI_APP_SANDBOX!=="false",registrationRequired:true,paymentsEnabled:checkout.pi.enabled},checkout});return;
  }
  if(req.method==="GET" && raw==="/api/integrations/checkout/config"){
    json(res,200,{ok:true,...checkoutReadiness(process.env,Boolean(accountDatabase))});return;
  }
  const checkoutActions={"/api/integrations/checkout/order":"create","/api/integrations/checkout/status":"status","/api/integrations/checkout/ousd/prepare":"ousdPrepare","/api/integrations/checkout/ousd/settle":"ousdSettle","/api/integrations/checkout/pi/approve":"approve","/api/integrations/checkout/pi/complete":"complete","/api/integrations/checkout/pi/reconcile":"reconcile"};
  if(req.method==="POST" && checkoutActions[raw]){
    try{
      requireHumanSignalOrigin(req);
      let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)throw Error("REQUEST_TOO_LARGE");}
      const input=JSON.parse(body||"{}");if(!input||typeof input!=="object"||Array.isArray(input))throw Error("INVALID_SCHEMA");
      if(!accountDatabase)throw Error("PAYMENT_STORAGE_UNAVAILABLE");
      const connection=new Connection(process.env.OUSD_SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),{commitment:"finalized",disableRetryOnRateLimit:true,fetch:providerFetch});
      const checkout=new IntegrationCheckout({database:accountDatabase,authenticate:request=>authHumanSignalProfile(request,loadHumanSignalNetwork()),env:process.env,connection,
        pi:new PiPlatformPayments({apiKey:process.env.PI_SERVER_API_KEY}),verifyPi:verifyPiAccessToken,hashUid:uid=>hashIdentity("pi",uid,identityPepper())});
      // Authenticate before mint/provider I/O; each ledger mutation rechecks the session.
      await checkout.local(req,()=>true);
      const action=checkoutActions[raw];
      const result=["approve","complete","reconcile"].includes(action)?await checkout.piAction(req,input,action):await checkout[action](req,input);
      json(res,200,{ok:true,...result});
    }catch(error){
      const message=String(error?.message||"");
      const safe=/^(PAYMENT_|PI_|OUSD_|HUMAN_SIGNAL_|REQUEST_TOO_LARGE|INVALID_|EXCESS_|IDENTITY_PEPPER_)/.test(message)?message:"PAYMENT_SERVICE_UNAVAILABLE";
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID","PI_TOKEN_INVALID"].includes(safe)?401:safe==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:safe==="REQUEST_TOO_LARGE"?413:safe.includes("UNAVAILABLE")||safe.includes("UNCERTAIN")||safe.includes("RECONCILIATION_REQUIRED")?503:409;
      json(res,status,{ok:false,error:safe,retryThroughReconciliation:true});
    }return;
  }
  if(req.method==="GET" && raw==="/api/integrations/ousd/mint"){
    try{const conn=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),{commitment:"finalized",disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})});json(res,200,{ok:true,...await inspectOpenUsdSolana(conn)});}catch{json(res,503,{ok:false,error:"OUSD_RPC_UNAVAILABLE"});}return;
  }
  if(req.method==="POST" && ["/api/integrations/ousd/request","/api/integrations/ousd/prepare","/api/integrations/ousd/verify","/api/integrations/pi/link","/api/integrations/pi/unlink"].includes(raw)){
    try{
      requireHumanSignalOrigin(req);
      let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)throw Error("REQUEST_TOO_LARGE");}
      const input=JSON.parse(body||"{}");if(!input||typeof input!=="object"||Array.isArray(input))throw Error("INVALID_SCHEMA");
      if(raw.startsWith("/api/integrations/pi/")){
        if(!raw.endsWith("/unlink") && process.env.PI_APP_ENABLED!=="true")throw Error("PI_APP_REGISTRATION_REQUIRED");
        // Authenticate before contacting Pi, then reload state after awaiting /me.
        const initial=authHumanSignalProfile(req,loadHumanSignalNetwork());
        if(!initial.wallet)throw Error("PI_LINK_SOLANA_IDENTITY_REQUIRED");
        if(raw.endsWith("/unlink")){
          const store=loadHumanSignalNetwork(),profile=authHumanSignalProfile(req,store);
          if(profile.externalIdentities)delete profile.externalIdentities.pi;
          saveHumanSignalNetwork(store);json(res,200,{ok:true,linked:false});return;
        }
        const identity=await verifyPiAccessToken(input.accessToken);
        const store=loadHumanSignalNetwork(),profile=authHumanSignalProfile(req,store);
        const result=bindPiIdentity({store,profileId:profile.id,identityHash:hashIdentity("pi",identity.uid,identityPepper()),validUntil:identity.validUntil});
        saveHumanSignalNetwork(store);json(res,200,{ok:true,...result});return;
      }
      const conn=new Connection(process.env.SOLANA_RPC_URL||clusterApiUrl("mainnet-beta"),{commitment:"finalized",disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})});
      const mint=await inspectOpenUsdSolana(conn);
      if(raw.endsWith("/request")){
        if(mint.paused||mint.transferHook||mint.transferFeeConfigured)throw Error("OUSD_WALLET_EXTENSION_REVIEW_REQUIRED");
        const request=createOpenUsdPaymentRequest({recipient:input.recipient,amount:input.amount,decimals:mint.decimals,reference:Keypair.generate().publicKey.toBase58(),message:input.message||""});
        json(res,200,{ok:true,request});return;
      }
      if(raw.endsWith("/prepare")){
        json(res,200,{ok:true,...await prepareOpenUsdTransfer({connection:conn,mint,request:input.request,payer:input.payer})});return;
      }
      if(input.request?.decimals!==mint.decimals)throw Error("PAYMENT_TOKEN_METADATA_MISMATCH");
      const result=await verifyOpenUsdPayment({connection:conn,signature:input.signature,request:input.request,payer:input.payer});
      json(res,200,{ok:true,...result});
    }catch(error){
      const message=String(error?.message||"");
      const known=/^(PI_|PAYMENT_|OUSD_|INVALID_|EXCESS_|UNIQUE_|HUMAN_SIGNAL_|REQUEST_TOO_LARGE|IDENTITY_PEPPER_)/.test(message);
      const safe=known?message:"INTEGRATION_UNAVAILABLE";
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID","PI_TOKEN_INVALID"].includes(safe)?401:safe==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:safe==="REQUEST_TOO_LARGE"?413:safe==="PI_APP_REGISTRATION_REQUIRED"?409:!known||safe.includes("UNAVAILABLE")?503:400;
      json(res,status,{ok:false,error:safe});
    }return;
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
      const onboardingToken=String(parsed.onboardingToken||"");
      const store=loadHumanSignalNetwork();
      const challenge=store.challenges.find(x=>x.challengeId===String(parsed.challengeId||""));
      if(!challenge || challenge.used || Date.parse(challenge.expiresAt)<=Date.now()) throw new Error("CHALLENGE_INVALID_OR_EXPIRED");
      if(!verifySolanaMessage(challenge.wallet,challenge.message,String(parsed.signature||""))) throw new Error("SIGNATURE_INVALID");
      challenge.used=true;
      const walletProfileId=profileIdForWallet(challenge.wallet);
      let onboarding=null;
      if(onboardingToken){
        const onboardingStore=loadAccountOnboarding();
        onboarding=onboardingStore.records.find(x=>x.tokenHash===onboardingTokenHash(onboardingToken));
        if(!validOnboardingRecord(onboarding)) throw new Error("ONBOARDING_TOKEN_INVALID");
      }

      // If the caller already has a valid phone-created session, bind the signed wallet
      // to that same profile instead of creating a second wallet-only identity.
      let authenticatedProfile=null;
      try{ authenticatedProfile=authHumanSignalProfile(req,store); }catch{}
      const walletOwner=store.profiles.find(p=>p.wallet===challenge.wallet);
      if(walletOwner && authenticatedProfile && walletOwner.id!==authenticatedProfile.id) throw new Error("WALLET_ALREADY_BOUND");

      let profile=authenticatedProfile || walletOwner || store.profiles.find(x=>x.id===walletProfileId);
      if(!profile){
        profile={id:walletProfileId,wallet:challenge.wallet,walletPublic:false,displayName:onboarding?.displayName||walletProfileId,createdAt:new Date().toISOString(),activeDays:0,streak:0,lastActiveDay:null,trustConnections:[],reviewCount:0,signalPoints:0,pendingCoh:0,mainnetReviewStatus:"PENDING",humanProofs:{}};
        store.profiles.push(profile);
      }

      if(profile.wallet && profile.wallet!==challenge.wallet) throw new Error("PROFILE_WALLET_ALREADY_BOUND");
      profile.wallet=challenge.wallet;
      profile.cohWallet={
        ownerAddress:challenge.wallet,
        custody:"NON_CUSTODIAL",
        network:"SOLANA",
        phase:"PRE_MAINNET",
        tokenAccount:null,
        activatedAt:profile.cohWallet?.activatedAt||new Date().toISOString()
      };

      if(onboarding){
        const phoneInUse=store.profiles.some(p=>p.id!==profile.id && p.humanProofs?.phone?.identityHash===onboarding.phoneHash);
        if(phoneInUse) throw new Error("PHONE_ALREADY_REGISTERED");
        profile.displayName=onboarding.displayName||profile.displayName;
        profile.humanProofs=profile.humanProofs&&typeof profile.humanProofs==="object"?profile.humanProofs:{};
        profile.humanProofs.phone={verified:true,identityHash:onboarding.phoneHash,verifiedAt:onboarding.phoneVerifiedAt||new Date().toISOString(),provider:onboarding.provider||"infobip"};
        const onboardingStore=loadAccountOnboarding();
        const rec=onboardingStore.records.find(x=>x.id===onboarding.id);
        if(rec){rec.usedAt=new Date().toISOString();rec.status="BOUND_TO_WALLET";rec.profileId=profile.id;saveAccountOnboarding(onboardingStore);}
      }
      const session=newSession(profile.id);
      store.sessions=store.sessions.filter(x=>isSessionValid(x)).slice(-5000);
      store.sessions.push(session.record);
      saveHumanSignalNetwork(store);
      emitHsc("PROFILE_VERIFIED",profile.id,profile.id,{walletProof:true});
      emitHsc("COH_WALLET_ACTIVATED",profile.id,profile.id,{ownerAddress:profile.wallet,custody:"NON_CUSTODIAL"});
      const contributions=loadHumanSignal().records;
      json(res,200,{ok:true,token:session.token,expiresAt:session.record.expiresAt,profile:publicHumanProfile(profile,contributions)});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:message==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/wallet/activate"){
    try{
      requireHumanSignalOrigin(req);
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,store);
      if(!profile.wallet) throw new Error("PROFILE_WALLET_MISSING");
      profile.cohWallet={
        ownerAddress:profile.wallet,
        custody:"NON_CUSTODIAL",
        network:"SOLANA",
        phase:"PRE_MAINNET",
        tokenAccount:null,
        activatedAt:profile.cohWallet?.activatedAt||new Date().toISOString()
      };
      saveHumanSignalNetwork(store);
      emitHsc("COH_WALLET_ACTIVATED",profile.id,profile.id,{ownerAddress:profile.wallet,custody:"NON_CUSTODIAL"});
      json(res,200,{ok:true,profile:publicHumanProfile(profile,loadHumanSignal().records)});
    }catch(error){
      const message=String(error?.message||error);
      const status=message==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(message)?401:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/mainnet-review"){
    try{
      requireHumanSignalOrigin(req);
      requireHumanSignalReviewKey(req);
      let body="";
      for await(const chunk of req){
        body+=chunk;
        if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");
      }
      const parsed=body?JSON.parse(body):{};
      const profileId=String(parsed.profileId||"").trim();
      const decision=String(parsed.decision||"").trim().toUpperCase();
      if(!["APPROVED","REJECTED","PENDING"].includes(decision)) throw new Error("INVALID_REVIEW_DECISION");
      const store=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=store.profiles.find(x=>x.id===profileId);
      if(!profile) throw new Error("HUMAN_SIGNAL_PROFILE_NOT_FOUND");
      const proof=publicHumanProof(profile);
      if(decision==="APPROVED"){
        if(proof.confidence.tier!=="HUMAN_VERIFIED") throw new Error("HUMAN_VERIFICATION_REQUIRED");
        if(!profile.cohWallet?.ownerAddress) throw new Error("COH_WALLET_REQUIRED");
      }
      profile.mainnetReviewStatus=decision;
      profile.mainnetReviewedAt=new Date().toISOString();
      profile.mainnetReviewNote=String(parsed.note||"").slice(0,500)||null;
      saveHumanSignalNetwork(store);
      emitHsc("MAINNET_PROFILE_REVIEWED","REVIEWER",profile.id,{decision});
      json(res,200,{ok:true,profile:publicHumanProfile(profile,loadHumanSignal().records)});
    }catch(error){
      const message=String(error?.message||error);
      const status=["HUMAN_SIGNAL_ORIGIN_INVALID","HUMAN_SIGNAL_REVIEW_KEY_INVALID"].includes(message)?403:
        message==="HUMAN_SIGNAL_REVIEW_KEY_NOT_CONFIGURED"?409:
        message==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/dashboard"){
    try{
      const networkStore=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,networkStore);
      networkStore.miningSessions=Array.isArray(networkStore.miningSessions)?networkStore.miningSessions:[];
      const contributionStore=loadHumanSignal();
      const proof=publicHumanProof(profile);
      const publicProfile=publicHumanProfile(profile,contributionStore.records);
      const providers=humanProofProvidersReady();
      const enforce=process.env.MINING_HUMAN_PROOF_MODE==="enforced" && providers.ready;
      const pioneer=publicPioneerSupport(profile,{providersReady:providers.ready,enforceHumanProof:enforce});
      const sessions=networkStore.miningSessions
        .filter(x=>x.profileId===profile.id)
        .slice()
        .reverse()
        .slice(0,20)
        .map(x=>publicMiningSession(x));
      const active=sessions.find(x=>x.status==="ACTIVE")||null;
      const rate=miningRateForProfile(profile,networkStore,contributionStore);
      const reviewStatus=String(profile.mainnetReviewStatus||"PENDING");
      const walletActive=Boolean(profile.cohWallet?.ownerAddress);
      const humanVerified=proof.confidence.tier==="HUMAN_VERIFIED";
      const mainnetEligible=humanVerified && walletActive && reviewStatus==="APPROVED";
      const verifiedContribs=contributionStore.records.filter(x=>x.profileId===profile.id && x.status==="VERIFIED").length;
      const checklist=[
        {id:"wallet",label:"Ví Solana đã xác minh (tuỳ chọn)",done:Boolean(profile.wallet),required:false},
        {id:"coh_wallet",label:"COH Wallet đã kích hoạt (tuỳ chọn trước Mainnet)",done:walletActive,required:false},
        {id:"phone",label:"Số điện thoại đã xác minh",done:Boolean(proof.phone?.verified),required:true},
        {id:"social",label:"Google hoặc Facebook đã xác minh",done:Boolean(proof.google?.verified||proof.facebook?.verified),required:true},
        {id:"human",label:"Đạt HUMAN_VERIFIED",done:humanVerified,required:true},
        {id:"review",label:"Mainnet Review được phê duyệt",done:reviewStatus==="APPROVED",required:true}
      ];
      json(res,200,{
        ok:true,
        network:"COHIBA_HUMAN_SIGNAL",
        profile:publicProfile,
        humanProof:proof,
        pioneer,
        accountStatus:{
          networkRole:(publicProfile.roles||[])[0]||"SIGNALER",
          memberSince:profile.createdAt,
          activeDays:Number(profile.activeDays||0),
          streak:Number(profile.streak||0),
          trustConnections:(profile.trustConnections||[]).length,
          verifiedContributions:verifiedContribs,
          referralCode:profile.referralCode||null,
          invitedBy:profile.invitedBy||null
        },
        mining:{
          signalPoints:Number(profile.signalPoints||0),
          pendingCoh:Number(profile.pendingCoh||0),
          pendingCohClass:"PROVISIONAL_OFFCHAIN",
          currentRate:rate,
          activeSession:active,
          sessions,
          sessionCount:networkStore.miningSessions.filter(x=>x.profileId===profile.id).length
        },
        mainnet:{
          reviewStatus,
          eligible:mainnetEligible,
          distributionStatus:mainnetEligible?"ELIGIBLE_WAITING_MAINNET":"NOT_ELIGIBLE",
          tokenAccount:profile.cohWallet?.tokenAccount||null,
          note:mainnetEligible
            ?"Profile meets current eligibility gates. On-chain distribution still waits for official Mainnet and distribution activation."
            :"Complete all required verification and review gates before Mainnet eligibility."
        },
        checklist
      });
    }catch(error){
      const message=String(error?.message||error);
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(message)?401:400;
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
    try{
    const composite=hscCompositeStore();
    if(composite.storageRecovered || (pohaDatabaseRequired && !pohaDatabase))throw new Error("STATE_UNAVAILABLE");
    const integrity=verifyEventChain(composite.events||[]);
    if(!integrity.valid)throw new Error("STATE_UNAVAILABLE");
    json(res,200,{
      ok:true,
      version:"0.1",
      eventChain:integrity,
      state:coreStateRoot(composite),
      trustState:trustStateRoot(pohaDatabase?{...composite,...await pohaDatabase.snapshot()}:composite),
      anchoredOnSolana:false,
      note:"Current HSC root is deterministic off-chain application state. Solana anchoring is a later Devnet phase."
    });
    }catch{json(res,503,{ok:false,error:"TRUST_STATE_UNAVAILABLE"});}
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

  if(req.method==="GET" && raw==="/api/v1/sovereignty/status"){
    json(res,200,{ok:true,...sovereigntyStatus(),directSessionGate:true,signedPohaGate:Boolean(pohaDatabase),signedPohaExecutionEnabled:Boolean(pohaDatabase&&process.env.ALLOW_POHA_AUTHORIZATION==="true"),localDraftCommitEnabled:Boolean(pohaDatabase&&accountDatabase&&accountDatabaseRequired&&process.env.ALLOW_POHA_AUTHORIZATION==="true"&&process.env.ALLOW_SI_DRAFT_COMMIT==="true"),productionScope:"SIGNED_LOCAL_DRAFT_COMMIT",independentAuditComplete:false,continuityMode:"PRIVATE_CHECKPOINT_RESTORE_FENCED",quorumMode:"PINNED_COMMITTEE_CERTIFICATE_VALIDATION"});
    return;
  }

  if(req.method==="GET" && raw==="/api/v1/status"){
    try{if(!pohaDatabase)throw new Error("DB_UNAVAILABLE");json(res,200,{ok:true,...await pohaDatabase.health(),executionEnabled:process.env.ALLOW_POHA_AUTHORIZATION==="true",checkpoint:checkpointWorker?checkpointWorker.status:null,accountStorage:accountDatabaseRequired?(accountDatabase?"POSTGRESQL":"UNAVAILABLE"):"JSON",trustRootVersion:"HS_TRUST_STATE_V1",backup:backupWorker?{enabled:true,lastSuccess:backupWorker.status.lastSuccess,lastError:backupWorker.status.lastError}:{enabled:false}});}
    catch{json(res,503,{ok:false,ready:false,executionEnabled:false,error:"POHA_STORAGE_UNAVAILABLE"});}return;
  }
  if(req.method==="GET" && raw==="/api/v1/checkpoints"){
    try{if(!pohaDatabase)throw Error("UNAVAILABLE");json(res,200,{ok:true,checkpoints:await pohaDatabase.checkpoints()});}catch{json(res,503,{ok:false,error:"TRUST_STATE_UNAVAILABLE"});}return;
  }
  if(req.method==="GET" && raw==="/api/v1/agency/graph"){
    try{
      const profile=authHumanSignalProfile(req,loadHumanSignalNetwork());if(!pohaDatabase)throw Error("UNAVAILABLE");
      const records=await pohaDatabase.graphRecords(profile.id);
      json(res,200,{ok:true,graph:agencyGraph({profile,agents:records.pohaAgents,delegations:records.pohaDelegations,receipts:records.receipts,principal:records.principal,contributions:loadHumanSignal().records})});
    }catch(error){const auth=String(error.message).startsWith("HUMAN_SIGNAL_");json(res,auth?401:503,{ok:false,error:auth?"HUMAN_SIGNAL_AUTH_REQUIRED":"TRUST_STATE_UNAVAILABLE"});}return;
  }
  if(req.method==="GET" && raw.startsWith("/api/v1/services/")){
    try{if(!pohaDatabase)throw new Error("DB_UNAVAILABLE");const service=await pohaDatabase.service(raw.slice("/api/v1/services/".length));if(!service){json(res,404,{ok:false,error:"SERVICE_NOT_FOUND"});return;}json(res,200,{ok:true,service});}catch{json(res,503,{ok:false,error:"POHA_STORAGE_UNAVAILABLE"});}return;
  }
  if(req.method==="POST" && raw==="/api/v1/actions/commit-draft"){
    try{
      if(!pohaDatabase||!accountDatabase||!accountDatabaseRequired||process.env.ALLOW_POHA_AUTHORIZATION!=="true"||process.env.ALLOW_SI_DRAFT_COMMIT!=="true")throw Error("SI_DRAFT_COMMIT_UNAVAILABLE");
      let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>24576)throw Error("REQUEST_TOO_LARGE");}
      const request=JSON.parse(body);
      const auth={id:String(req.headers["x-hs-service-id"]||""),time:String(req.headers["x-hs-time"]||""),nonce:String(req.headers["x-hs-nonce"]||""),signature:String(req.headers["x-hs-signature"]||"")};
      const result=await pohaDatabase.commitDraft(auth,Buffer.from(body),request,resolvePohaPrincipal);
      json(res,200,{ok:true,saved:result.effectCommitted===true,result});
    }catch(error){const code=String(error.message);const safe=["SI_DRAFT_COMMIT_UNAVAILABLE","REQUEST_TOO_LARGE","SERVICE_AUTH_INVALID","SERVICE_REQUEST_REPLAY","INVALID_PRINCIPAL","PRINCIPAL_REVOKED","APPROVAL_REPLAY","IDENTITY_CHANGED_RETRY","PROOF_EXPIRED_RETRY","PROOF_EXPIRED_AT_COMMIT"].includes(code)?code:"SI_DRAFT_STORAGE_UNAVAILABLE";json(res,safe.startsWith("SERVICE_")?401:safe==="REQUEST_TOO_LARGE"?413:safe.endsWith("UNAVAILABLE")?503:400,{ok:false,saved:false,error:safe});}
    return;
  }

  if(req.method==="POST" && raw==="/api/v1/actions/authorize"){
    try{
      if(!pohaDatabase || process.env.ALLOW_POHA_AUTHORIZATION!=="true")throw new Error("POHA_AUTHORIZATION_UNAVAILABLE");
      let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>24576)throw new Error("REQUEST_TOO_LARGE");}
      const request=JSON.parse(body);
      const auth={id:String(req.headers["x-hs-service-id"]||""),time:String(req.headers["x-hs-time"]||""),nonce:String(req.headers["x-hs-nonce"]||""),signature:String(req.headers["x-hs-signature"]||"")};
      const result=await pohaDatabase.authorize(auth,Buffer.from(body),request,resolvePohaPrincipal);
      json(res,200,{ok:true,result});
    }catch(error){const code=String(error.message);const allowed=["SERVICE_AUTH_INVALID","SERVICE_REQUEST_REPLAY","INVALID_PRINCIPAL","IDENTITY_CHANGED_RETRY","PROOF_EXPIRED_RETRY","PRINCIPAL_REVOKED","APPROVAL_REPLAY","REQUEST_TOO_LARGE","POHA_AUTHORIZATION_UNAVAILABLE"];const safe=allowed.includes(code)?code:"POHA_STORAGE_UNAVAILABLE";json(res,safe.startsWith("SERVICE_")?401:safe==="REQUEST_TOO_LARGE"?413:["POHA_STORAGE_UNAVAILABLE","POHA_AUTHORIZATION_UNAVAILABLE"].includes(safe)?503:400,{ok:false,error:safe});}return;
  }

  if(raw==="/api/v1/disclosure/pilot"){
    try{
      requireHumanSignalOrigin(req);
      if(!pohaDatabase || !disclosurePilot || process.env.ALLOW_POHA_AUTHORIZATION!=="true")throw Error("DISCLOSURE_PILOT_UNAVAILABLE");
      if(req.method==="GET"){
        authHumanSignalProfile(req,loadHumanSignalNetwork());
        json(res,200,{ok:true,service:{id:disclosurePilot.id,audience:CANONICAL_PUBLIC_ORIGIN,disclosurePolicy:disclosurePilot.policy},transport:"BROWSER_MOCK_ONLY"});return;
      }
      if(req.method!=="POST"){json(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});return;}
      let body="";for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000)throw Error("REQUEST_TOO_LARGE");}
      const request=JSON.parse(body);
      const profile=authHumanSignalProfile(req,loadHumanSignalNetwork());
      if(request?.proof?.payload?.principalId!==profile.id)throw Error("DISCLOSURE_OWNER_MISMATCH");
      const auth={id:disclosurePilot.id,time:new Date().toISOString(),nonce:crypto.randomBytes(24).toString("base64url")};
      auth.signature=crypto.sign(null,serviceSigningBytes(auth.id,auth.time,auth.nonce,Buffer.from(body)),disclosurePilot.key).toString("base64");
      const result=await pohaDatabase.authorize(auth,Buffer.from(body),request,resolvePohaPrincipal);
      json(res,200,{ok:true,result,transport:"BROWSER_MOCK_ONLY"});
    }catch(error){
      const code=String(error.message),safe=["HUMAN_SIGNAL_ORIGIN_INVALID","HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID","DISCLOSURE_PILOT_UNAVAILABLE","DISCLOSURE_OWNER_MISMATCH","REQUEST_TOO_LARGE","PRINCIPAL_REVOKED","APPROVAL_REPLAY"].includes(code)?code:"DISCLOSURE_VERIFICATION_UNAVAILABLE";
      json(res,safe==="HUMAN_SIGNAL_ORIGIN_INVALID"||safe==="DISCLOSURE_OWNER_MISMATCH"?403:safe.startsWith("HUMAN_SIGNAL_")?401:safe==="REQUEST_TOO_LARGE"?413:safe.endsWith("UNAVAILABLE")?503:400,{ok:false,error:safe});
    }return;
  }

  if(req.method==="GET" && raw==="/api/v1/openapi.json"){json(res,200,humanSignalOpenAPI);return;}

  if(req.method==="GET" && raw==="/api/v1/protocol"){
    json(res,200,{ok:true,protocol:"Human Signal PoHA",version:"1",milestone:pohaDatabase?"DURABLE_AUTHORIZATION":"SIGNED_INSPECTION",algorithm:"Ed25519",canonicalization:"HS_RESTRICTED_JSON_V1",executionEnabled:Boolean(pohaDatabase && process.env.ALLOW_POHA_AUTHORIZATION==="true"),actionNonceConsumption:Boolean(pohaDatabase),policyVersion:"PHONE_BOUND_DRAFT_V1",developerLab:"/poha-lab.html"});
    return;
  }

  if(["/api/v1/agency","/api/v1/identity/revoke","/api/v1/agents/register","/api/v1/delegations","/api/v1/revocations","/api/v1/actions/inspect"].includes(raw)){
    try{
      const isRead=raw==="/api/v1/agency" && req.method==="GET";
      if(!isRead && (raw==="/api/v1/agency" || req.method!=="POST")){json(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});return;}
      requireHumanSignalOrigin(req);
      let body="";
      for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>16384)throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))throw new Error("INVALID_SCHEMA");
      // Resolve authoritative identity and core only after the asynchronous body read.
      const network=loadHumanSignalNetwork();
      if(network.storageRecovered)throw new Error("POHA_STORAGE_UNAVAILABLE");
      const profile=authHumanSignalProfile(req,network);
      if(!profile.wallet)throw new Error("AGENCY_WALLET_REQUIRED");
      let audience=new URL(PUBLIC_BASE_URL).origin;
      if(parsed.payload?.audience && parsed.payload.audience!==audience){
        if(!pohaDatabase || !(await pohaDatabase.pool.query('SELECT document FROM hs_services')).rows.some(r=>r.document.enabled && r.document.audience===parsed.payload.audience))throw new Error("AUDIENCE_MISMATCH");
        audience=parsed.payload.audience;
      }
      const context=resolvePohaPrincipal(profile.id,audience);
      if(!context)throw new Error("POHA_STORAGE_UNAVAILABLE");
      if(pohaDatabaseRequired && !pohaDatabase)throw new Error("POHA_STORAGE_UNAVAILABLE");
      if(pohaDatabase){
        if(raw==="/api/v1/identity/revoke"){json(res,200,{ok:true,...await pohaDatabase.revokePrincipal(profile.id)});return;}
        if(isRead){const records=await pohaDatabase.listing(profile.id);json(res,200,{ok:true,version:"1",audience,principalId:context.principalId,principalKey:context.principalKey,identityAssurance:context.identityAssurance,executionEnabled:process.env.ALLOW_POHA_AUTHORIZATION==="true",agents:records.pohaAgents,delegations:records.pohaDelegations});return;}
        if(raw.endsWith("/inspect")){const expected=parsed.expected;if(!expected||typeof expected.requireApproval!=="boolean")throw new Error("INVALID_EXPECTED_CONTEXT");const inspectContext=resolvePohaPrincipal(profile.id,expected.audience);json(res,200,{ok:true,result:await pohaDatabase.inspect(inspectContext,parsed.proof,expected)});return;}
        const kind=raw.endsWith("/register")?"AGENT":raw.endsWith("/delegations")?"DELEGATION":"REVOKE";
        const record=await pohaDatabase.mutate(context,kind,parsed);json(res,kind==="REVOKE"?200:201,{ok:true,record});return;
      }
      const core=loadHumanSignalCore();
      if(core.storageRecovered || !verifyEventChain(core.events||[]).valid)throw new Error("POHA_STORAGE_UNAVAILABLE");
      if(isRead){
        json(res,200,{ok:true,version:"1",audience:context.audience,identityAssurance:context.identityAssurance,executionEnabled:false,
          agents:(core.pohaAgents||[]).filter(r=>r.payload.principalId===profile.id),
          delegations:(core.pohaDelegations||[]).filter(r=>r.payload.principalId===profile.id)});return;
      }
      if(raw.endsWith("/inspect")){
        // Caller-supplied expected context is diagnostic only; no execution receipt is issued.
        const expected=parsed.expected;
        if(!expected || typeof expected!=="object" || Array.isArray(expected) || typeof expected.requireApproval!=="boolean")throw new Error("INVALID_EXPECTED_CONTEXT");
        const result=inspectAction(core,context,parsed.proof,expected);
        json(res,200,{ok:true,result});return;
      }
      let record,type,changed=true;
      if(raw.endsWith("/register")){record=bindAgent(core,context,parsed);type="AGENT_REGISTERED";}
      else if(raw.endsWith("/delegations")){record=createSignedDelegation(core,context,parsed);type="DELEGATION_GRANTED";}
      else{const output=revokeSignedRecord(core,context,parsed);record=output.record;changed=output.changed;type=parsed.type==="AGENT"?"AGENT_REVOKED":"DELEGATION_REVOKED";}
      if(changed){appendCoreEvent(core,{type,actor:profile.id,subject:record.id,data:{protocolVersion:"1",proofClass:"ED25519_SIGNED",record}});saveHumanSignalCore(core);}
      json(res,raw.endsWith("/revocations")?200:201,{ok:true,record,executionEnabled:false});
    }catch(error){
      const message=error.code?"POHA_STORAGE_UNAVAILABLE":String(error?.message||error);
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID","HUMAN_SIGNAL_PROFILE_NOT_FOUND"].includes(message)?401:
        ["HUMAN_SIGNAL_ORIGIN_INVALID","AGENCY_WALLET_REQUIRED"].includes(message)?403:
        message==="POHA_STORAGE_UNAVAILABLE"?503:message==="REQUEST_TOO_LARGE"?413:400;
      json(res,status,{ok:false,error:message});
    }
    return;
  }

  if(raw==="/api/hsc/agency" || ["/api/hsc/agency/agents","/api/hsc/agency/grant","/api/hsc/agency/revoke"].includes(raw)){
    try{
      const isRead=raw==="/api/hsc/agency" && req.method==="GET";
      const isWrite=raw!=="/api/hsc/agency" && req.method==="POST";
      if(!isRead && !isWrite){json(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});return;}
      if(isWrite) requireHumanSignalOrigin(req);
      const network=loadHumanSignalNetwork();
      const profile=authHumanSignalProfile(req,network);
      if(!profile.wallet) throw new Error("AGENCY_WALLET_REQUIRED");
      if(isRead){json(res,200,{ok:true,...agencyForOwner(loadHumanSignalCore(),profile.id)});return;}
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      if(!parsed || typeof parsed!=="object" || Array.isArray(parsed)) throw new Error("INVALID_AGENCY_REQUEST");
      // Load after reading the body so concurrent requests cannot overwrite newer grants.
      const core=loadHumanSignalCore();
      if(core.storageRecovered || !verifyEventChain(core.events||[]).valid) throw new Error("AGENCY_STORAGE_UNAVAILABLE");
      let record,changed=true,type;
      if(raw.endsWith("/agents")){
        record=registerAgent(core,profile.id,parsed);type="AGENT_REGISTERED";
      }else if(raw.endsWith("/grant")){
        const gate=guardDirectHumanMutation(core,{profileId:profile.id,action:"AGENT_GRANT",receiptData:{route:raw,agentId:parsed.agentId||null}});
        if(gate.verdict!=="ALLOW") throw new Error("HUMAN_SIGNAL_"+String(gate.reason||"DENY"));
        record=grantDelegation(core,profile.id,parsed);type="DELEGATION_GRANTED";
      }else{
        const gate=guardDirectHumanMutation(core,{profileId:profile.id,action:"AGENT_REVOKE",receiptData:{route:raw,delegationId:parsed.delegationId||null}});
        if(gate.verdict!=="ALLOW") throw new Error("HUMAN_SIGNAL_"+String(gate.reason||"DENY"));
        const out=revokeDelegation(core,profile.id,parsed.delegationId);
        record=out.delegation;changed=out.changed;type="DELEGATION_REVOKED";
      }
      if(changed){
        appendCoreEvent(core,{type,actor:profile.id,subject:record.id,data:record});
        saveHumanSignalCore(core);
      }
      json(res,raw.endsWith("/revoke")?200:201,{ok:true,record,...agencyForOwner(core,profile.id)});
    }catch(error){
      const m=String(error?.message||error);
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID","HUMAN_SIGNAL_PROFILE_NOT_FOUND"].includes(m)?401:
        ["HUMAN_SIGNAL_ORIGIN_INVALID","AGENCY_WALLET_REQUIRED"].includes(m)?403:
        ["AGENT_NOT_FOUND","DELEGATION_NOT_FOUND"].includes(m)?404:
        m==="REQUEST_TOO_LARGE"?413:["AGENCY_STORAGE_UNAVAILABLE","STORAGE_UNAVAILABLE","STORAGE_WRITE_CONFLICT"].includes(m)?503:400;
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
      const gate=guardDirectHumanMutation(core,{profileId:profile.id,action:"APP_REGISTER",receiptData:{route:"/api/hsc/apps/register"}});
      if(gate.verdict!=="ALLOW") throw new Error("HUMAN_SIGNAL_"+String(gate.reason||"DENY"));
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
    const providersReady=phone&&(google||facebook);
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

  if(req.method==="GET" && raw==="/api/ads/config"){
    const publisherId=String(process.env.ADSENSE_PUBLISHER_ID||"").trim();
    const slotId=String(process.env.ADSENSE_SLOT_ID||"").trim();
    json(res,200,{
      ok:true,
      provider:publisherId?"google-adsense":"unconfigured",
      configured:Boolean(publisherId),
      publisherId:publisherId||null,
      slotId:slotId||null,
      rewardedAds:{
        enabled:process.env.ADSENSE_REWARDED_ENABLED==="true" && Boolean(publisherId),
        rewardClass:"NON_MONETARY_SITE_UTILITY",
        miningReward:false,
        pendingCohReward:false
      },
      payoutManagedByProvider:true,
      bankingDataStoredByCohiba:false
    });
    return;
  }

  if(req.method==="GET" && raw==="/api/economy/status"){
    const mainnetRecord=loadLaunchRecord("mainnet-beta");
    const mainnetLive=Boolean(mainnetRecord?.locked&&mainnetRecord?.mint);
    const ownerApproved=process.env.COHIBA_MAINNET_OWNER_APPROVAL==="APPROVE MAINNET COHIBA";
    const marketEnabled=process.env.COHIBA_MARKET_TRADING_ENABLED==="true";
    const distributionEnabled=process.env.COHIBA_COMMUNITY_DISTRIBUTION_ENABLED==="true";
    json(res,200,{
      ok:true,
      project:"COHIBA",
      phase:mainnetLive?"POST_MAINNET":"PRE_MAINNET",
      mining:{
        model:"HYBRID_HUMAN_RESOURCE",
        accounting:["Signal Points (SP)","Pending COH (provisional off-chain ledger)"],
        transferable:false,
        sellable:false,
        tradable:false,
        claimableOnSite:true,
        splCohEmission:false,
        pendingCohProvisional:true,
        pendingCohTransferable:false
      },
      coh:{
        mainnetLive,
        ownerApproved,
        distributionEnabled,
        marketEnabled,
        transferable:mainnetLive&&distributionEnabled,
        tradingAllowed:mainnetLive&&distributionEnabled&&marketEnabled,
        guaranteedSpConversion:false
      },
      notice:mainnetLive
        ?"COH trading remains gated by community distribution policy and explicit market enablement."
        :"Mining records Signal Points and provisional Pending COH off-chain. No transferable SPL COH is minted, sold, transferred or distributed before Mainnet."
    });
    return;
  }

  if(req.method==="POST" && raw==="/api/account/onboarding/phone/start"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      if(parsed.consent!==true) throw new Error("PHONE_CONSENT_REQUIRED");
      const phone=normalizePhone(parsed.phone);
      const phoneHash=hashIdentity("phone",phone,identityPepper());
      enforceOtpRateLimit(req,phoneHash,"start");
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const existingProfile=network.profiles.find(p=>p.humanProofs?.phone?.identityHash===phoneHash)||null;
      const verification=await phoneVerifyStart(phone);
      const store=loadAccountOnboarding();
      store.records=store.records.filter(x=>Date.parse(x.expiresAt)>Date.now() && !x.usedAt).slice(-2000);
      const record={
        id:"ONB-"+crypto.randomBytes(10).toString("hex").toUpperCase(),
        phoneHash,
        provider:verification.provider||"twilio",
        pinId:verification.pinId||null,
        providerStatus:verification.status||"accepted",
        acceptedAt:verification.acceptedAt||new Date().toISOString(),
        status:"OTP_SENT",
        createdAt:new Date().toISOString(),
        expiresAt:new Date(Date.now()+20*60*1000).toISOString(),
        tokenHash:null,
        tokenExpiresAt:null,
        displayName:existingProfile?.displayName||null,
        existingProfileId:existingProfile?.id||null,
        usedAt:null
      };
      store.records.push(record); saveAccountOnboarding(store);
      json(res,200,{
        ok:true,
        onboardingId:record.id,
        status:"OTP_ACCEPTED_BY_PROVIDER",
        provider:record.provider,
        delivery:"PENDING_OR_UNKNOWN",
        expiresAt:record.expiresAt,
        note:"Provider accepted the OTP request. SMS handset delivery is asynchronous and may still fail or be delayed."
      });
    }catch(error){
      const m=String(error?.message||error);
      const status=["OTP_RATE_LIMITED","OTP_PROVIDER_DAILY_LIMIT"].includes(m)?429:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["PHONE_CONSENT_REQUIRED","INVALID_E164_PHONE"].includes(m)?400:
        m==="PHONE_ALREADY_REGISTERED"?409:
        m==="PHONE_VERIFY_NOT_CONFIGURED"?409:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/account/onboarding/otp/status"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>1024) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const store=loadAccountOnboarding();
      const record=store.records.find(x=>x.id===String(parsed.onboardingId||""));
      if(!record) throw new Error("ONBOARDING_NOT_FOUND");
      json(res,200,{
        ok:true,
        onboardingId:record.id,
        provider:record.provider||null,
        providerAccepted:Boolean(record.pinId),
        providerStatus:record.providerStatus||null,
        accountStage:record.status||null,
        expiresAt:record.expiresAt||null,
        delivery:"UNKNOWN_WITHOUT_DLR",
        trialNotice:"If Infobip is still in free trial, OTP SMS can be delivered only to recipient numbers verified in the Infobip account."
      });
    }catch(error){
      const m=String(error?.message||error);
      json(res,m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:400,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/account/onboarding/phone/check"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const phone=normalizePhone(parsed.phone);
      const phoneHash=hashIdentity("phone",phone,identityPepper());
      const store=loadAccountOnboarding();
      const record=store.records.find(x=>x.id===String(parsed.onboardingId||""));
      if(!record || record.usedAt || Date.parse(record.expiresAt)<=Date.now()) throw new Error("ONBOARDING_EXPIRED");
      if(record.phoneHash!==phoneHash) throw new Error("PHONE_VERIFICATION_CONTEXT_MISMATCH");
      enforceOtpRateLimit(req,phoneHash,"check");
      await phoneVerifyCheck({pendingPhoneProvider:record.provider,pendingPhonePinId:record.pinId},phone,String(parsed.code||""));
      const token=crypto.randomBytes(32).toString("base64url");
      record.status="PHONE_VERIFIED";
      record.phoneVerifiedAt=new Date().toISOString();
      record.tokenHash=onboardingTokenHash(token);
      record.tokenExpiresAt=new Date(Date.now()+30*60*1000).toISOString();
      saveAccountOnboarding(store);
      json(res,200,{ok:true,status:"PHONE_VERIFIED",onboardingToken:token,expiresAt:record.tokenExpiresAt});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="OTP_RATE_LIMITED"?429:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["PHONE_CODE_INVALID","PHONE_VERIFICATION_CONTEXT_MISMATCH","INVALID_E164_PHONE","ONBOARDING_EXPIRED"].includes(m)?400:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/account/onboarding/profile"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const token=String(parsed.onboardingToken||"");
      const password=validateAccountPassword(parsed.password);
      const onboardingStore=loadAccountOnboarding();
      const record=onboardingStore.records.find(x=>x.tokenHash===onboardingTokenHash(token));
      if(!record || record.status!=="PHONE_VERIFIED" || Date.parse(record.tokenExpiresAt)<=Date.now() || record.usedAt) throw new Error("ONBOARDING_TOKEN_INVALID");

      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      let profile=record.existingProfileId?network.profiles.find(x=>x.id===record.existingProfileId):network.profiles.find(x=>x.humanProofs?.phone?.identityHash===record.phoneHash);
      let created=false;
      if(!profile){
        const displayName=cleanDisplayName(parsed.displayName);
        const lower=displayName.toLocaleLowerCase("vi");
        if(network.profiles.some(p=>String(p.displayName||"").toLocaleLowerCase("vi")===lower)) throw new Error("DISPLAY_NAME_TAKEN");
        const id="COH-"+record.phoneHash.slice(0,12).toUpperCase();
        profile={
          id,
          wallet:null,
          walletPublic:false,
          displayName,
          createdAt:new Date().toISOString(),
          activeDays:0,
          streak:0,
          lastActiveDay:null,
          trustConnections:[],
          reviewCount:0,
          signalPoints:0,
          pendingCoh:0,
          mainnetReviewStatus:"PENDING",
          humanProofs:{
            phone:{verified:true,identityHash:record.phoneHash,verifiedAt:record.phoneVerifiedAt||new Date().toISOString(),provider:record.provider||"infobip"}
          },
          accountType:"PHONE_MINING",
          passwordCredential:createPasswordCredential(password)
        };
        network.profiles.push(profile);
        created=true;
      }else{
        profile.passwordCredential=createPasswordCredential(password);
        profile.humanProofs=profile.humanProofs&&typeof profile.humanProofs==="object"?profile.humanProofs:{};
        profile.humanProofs.phone={verified:true,identityHash:record.phoneHash,verifiedAt:record.phoneVerifiedAt||new Date().toISOString(),provider:record.provider||"infobip"};
      }

      const session=newSession(profile.id);
      // OTP recovery replaces credentials: revoke previous sessions for this profile.
      network.sessions=network.sessions.filter(x=>x.profileId!==profile.id && isSessionValid(x)).slice(-5000);
      network.sessions.push(session.record);
      saveHumanSignalNetwork(network);

      record.displayName=profile.displayName;
      record.status="ACCOUNT_READY";
      record.usedAt=new Date().toISOString();
      record.profileId=profile.id;
      saveAccountOnboarding(onboardingStore);
      emitHsc("PROFILE_VERIFIED",profile.id,profile.id,{phoneVerified:true,accountType:"PHONE_MINING",created});

      json(res,200,{
        ok:true,
        status:"ACCOUNT_READY",
        created,
        token:session.token,
        expiresAt:session.record.expiresAt,
        profile:publicHumanProfile(profile,loadHumanSignal().records)
      });
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["DISPLAY_NAME_LENGTH","DISPLAY_NAME_INVALID","ONBOARDING_TOKEN_INVALID","PASSWORD_LENGTH","PASSWORD_COMPLEXITY"].includes(m)?400:
        m==="DISPLAY_NAME_TAKEN"?409:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/account/login"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const phone=normalizePhone(parsed.phone);
      const phoneHash=hashIdentity("phone",phone,identityPepper());
      enforceLoginRateLimit(req,phoneHash);
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=network.profiles.find(p=>p.humanProofs?.phone?.identityHash===phoneHash);
      if(!profile || !verifyPasswordCredential(String(parsed.password||""),profile.passwordCredential)) throw new Error("INVALID_CREDENTIALS");
      const session=newSession(profile.id);
      network.sessions=network.sessions.filter(x=>isSessionValid(x)).slice(-5000);
      network.sessions.push(session.record);
      saveHumanSignalNetwork(network);
      emitHsc("ACCOUNT_LOGIN",profile.id,profile.id,{method:"PHONE_PASSWORD"});
      json(res,200,{ok:true,token:session.token,expiresAt:session.record.expiresAt,profile:publicHumanProfile(profile,loadHumanSignal().records)});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="LOGIN_RATE_LIMITED"?429:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["INVALID_CREDENTIALS","INVALID_E164_PHONE"].includes(m)?401:500;
      json(res,status,{ok:false,error:m==="INVALID_CREDENTIALS"?"PHONE_OR_PASSWORD_INVALID":m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/account/password"){
    try{
      requireHumanSignalOrigin(req);
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>2048) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const password=validateAccountPassword(parsed.password);
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const current=authHumanSignalSession(req,network);
      const profile=network.profiles.find(x=>x.id===current.session.profileId);
      if(!profile) throw new Error("HUMAN_SIGNAL_PROFILE_NOT_FOUND");
      profile.passwordCredential=createPasswordCredential(password);

      // Password rotation revokes every previous session and returns one fresh session.
      network.sessions=network.sessions.filter(x=>x.profileId!==profile.id && isSessionValid(x)).slice(-5000);
      const fresh=newSession(profile.id);
      network.sessions.push(fresh.record);
      saveHumanSignalNetwork(network);
      emitHsc("ACCOUNT_PASSWORD_UPDATED",profile.id,profile.id,{method:"AUTHENTICATED_SESSION",sessionsRevoked:true});
      json(res,200,{ok:true,passwordConfigured:true,updatedAt:profile.passwordCredential.updatedAt,token:fresh.token,expiresAt:fresh.record.expiresAt});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(m)?401:
        ["PASSWORD_LENGTH","PASSWORD_COMPLEXITY"].includes(m)?400:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/account/logout"){
    try{
      requireHumanSignalOrigin(req);
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const current=authHumanSignalSession(req,network);
      const profileId=current.session.profileId;
      network.sessions=network.sessions.filter(x=>x.tokenHash!==current.hash && isSessionValid(x)).slice(-5000);
      saveHumanSignalNetwork(network);
      emitHsc("ACCOUNT_LOGOUT",profileId,profileId,{sessionRevoked:true});
      json(res,200,{ok:true});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(m)?401:500;
      json(res,status,{ok:false,error:m});
    }
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
      const phoneHash=hashIdentity("phone",phone,identityPepper());
      enforceOtpRateLimit(req,phoneHash,"start");
      const verification=await phoneVerifyStart(phone);
      profile.pendingPhoneHash=phoneHash;
      profile.pendingPhoneProvider=verification.provider||"twilio";
      profile.pendingPhonePinId=verification.pinId||null;
      saveHumanSignalNetwork(store);
      json(res,200,{ok:true,status:"OTP_SENT"});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="OTP_RATE_LIMITED"?429:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:["PHONE_VERIFY_NOT_CONFIGURED"].includes(m)?409:["PHONE_CONSENT_REQUIRED","INVALID_E164_PHONE"].includes(m)?400:500;
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
      enforceOtpRateLimit(req,phoneHash,"check");
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
      const status=m==="OTP_RATE_LIMITED"?429:m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:m==="PHONE_VERIFY_NOT_CONFIGURED"?409:["PHONE_CODE_INVALID","PHONE_VERIFICATION_CONTEXT_MISMATCH","INVALID_E164_PHONE"].includes(m)?400:500;
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

  if(req.method==="GET" && raw==="/api/v1/release-readiness"){
    let registry=null;
    try{registry=JSON.parse(fs.readFileSync(path.join(__dirname,'release/human-signal-gates.json'),'utf8'));}catch{}
    json(res,200,humanSignalReleaseReadiness(registry,process.env.RAILWAY_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null));
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
        ...(!providers.phone?["INFOBIP_2FA"]:[]),
        ...(!providers.google?["GOOGLE_OAUTH"]:[]),
        ...(!providers.facebook?["FACEBOOK_OAUTH"]:[]),
        ...(!process.env.HUMAN_SIGNAL_REVIEW_KEY?["HUMAN_SIGNAL_REVIEW_KEY"]:[])
      ]
    });
    return;
  }

  if(req.method==="POST" && raw==="/api/node/jobs/request"){
    try{
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,network);
      network.miningSessions=Array.isArray(network.miningSessions)?network.miningSessions:[];
      const active=network.miningSessions.some(x=>x.profileId===profile.id && x.status==="ACTIVE" && Date.parse(x.endsAt)>Date.now());
      if(!active) throw new Error("ACTIVE_MINING_SESSION_REQUIRED");

      profile.resourceProof=profile.resourceProof&&typeof profile.resourceProof==="object"?profile.resourceProof:{};
      profile.resourceProof.nodeJobs=Array.isArray(profile.resourceProof.nodeJobs)?profile.resourceProof.nodeJobs:[];
      const now=Date.now();
      for(const job of profile.resourceProof.nodeJobs){
        if(job.status==="ISSUED" && Date.parse(job.expiresAt)<=now) job.status="EXPIRED";
      }
      const pending=profile.resourceProof.nodeJobs.find(x=>x.status==="ISSUED" && Date.parse(x.expiresAt)>now);
      if(pending){
        json(res,200,{ok:true,status:"PENDING_JOB",job:publicNodeJob(pending),retryAfterMs:0});
        return;
      }

      const remaining=jobCooldownRemaining(profile.resourceProof.nodeJobs,now);
      if(remaining>0){
        json(res,200,{ok:true,status:"COOLDOWN",job:null,retryAfterMs:remaining});
        return;
      }

      const job=createNodeJob(profile.id,{now});
      profile.resourceProof.nodeJobs.push(job);
      profile.resourceProof.nodeJobs=profile.resourceProof.nodeJobs.slice(-100);
      saveHumanSignalNetwork(network);
      json(res,201,{ok:true,status:"ISSUED",job:publicNodeJob(job),retryAfterMs:0});
    }catch(error){
      const m=String(error?.message||error);
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(m)?401:
        m==="ACTIVE_MINING_SESSION_REQUIRED"?409:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/node/jobs/submit"){
    try{
      let body=""; for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body,"utf8")>4096) throw new Error("REQUEST_TOO_LARGE");}
      const parsed=body?JSON.parse(body):{};
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,network);
      profile.resourceProof=profile.resourceProof&&typeof profile.resourceProof==="object"?profile.resourceProof:{};
      profile.resourceProof.nodeJobs=Array.isArray(profile.resourceProof.nodeJobs)?profile.resourceProof.nodeJobs:[];
      profile.resourceProof.jobs=Array.isArray(profile.resourceProof.jobs)?profile.resourceProof.jobs:[];

      const job=profile.resourceProof.nodeJobs.find(x=>x.id===String(parsed.jobId||""));
      if(!job || job.profileId!==profile.id) throw new Error("NODE_JOB_NOT_FOUND");
      const checked=verifyNodeJob(job,parsed.result,Date.now());
      job.completedAt=new Date().toISOString();
      job.status=checked.ok?"VERIFIED":"REJECTED";
      delete job.expectedResult;

      profile.resourceProof.jobs.push({
        jobId:job.id,
        type:job.type,
        verified:checked.ok,
        verifiedAt:checked.ok?job.completedAt:null,
        rejectedAt:checked.ok?null:job.completedAt
      });
      profile.resourceProof.jobs=profile.resourceProof.jobs.slice(-500);
      saveHumanSignalNetwork(network);

      if(!checked.ok){
        json(res,400,{ok:false,error:checked.error,verified:false,resource:resourceContributionScore(profile)});
        return;
      }
      emitHsc("RESOURCE_JOB_VERIFIED",profile.id,job.id,{type:job.type,protocolVersion:job.protocolVersion});
      json(res,200,{ok:true,verified:true,resource:resourceContributionScore(profile)});
    }catch(error){
      const m=String(error?.message||error);
      const status=["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(m)?401:
        m==="REQUEST_TOO_LARGE"?413:
        ["NODE_JOB_NOT_FOUND","NODE_JOB_NOT_ACTIVE","NODE_JOB_EXPIRED","NODE_JOB_RESULT_INVALID","NODE_JOB_RESULT_MISMATCH"].includes(m)?400:500;
      json(res,status,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/node/self-test"){
    try{
      const startedAt=Date.now();
      const profileId="SELFTEST";
      const job=createNodeJob(profileId,{now:startedAt,nonce:"cohiba-production-self-test"});
      const publicJob=publicNodeJob(job);

      // Reproduce the shipped agent's deterministic calculation without touching persistent user data.
      const canonical=JSON.stringify({
        protocol:"COHIBA_NODE",
        version:"0.1",
        type:"DATA_INTEGRITY_V1",
        nonce:String(publicJob.payload?.nonce||""),
        chunks:(Array.isArray(publicJob.payload?.chunks)?publicJob.payload.chunks:[]).map(x=>String(x))
      });
      const agentResult=crypto.createHash("sha256").update(canonical,"utf8").digest("hex");
      const checked=verifyNodeJob(job,agentResult,startedAt+1);

      const fakeProfile={resourceProof:{heartbeats:[],jobs:[],storageProofs:[],networkJobs:[]}};
      const before=resourceContributionScore(fakeProfile,startedAt);
      if(checked.ok){
        fakeProfile.resourceProof.jobs.push({
          jobId:job.id,
          type:job.type,
          verified:true,
          verifiedAt:new Date(startedAt+1).toISOString()
        });
      }
      const after=resourceContributionScore(fakeProfile,startedAt+1);

      json(res,200,{
        ok:checked.ok && after.score>before.score,
        mode:"EPHEMERAL_PRODUCTION_SELF_TEST",
        persistentDataModified:false,
        protocolVersion:job.protocolVersion,
        jobType:job.type,
        publicPayloadOnly:!("expectedResult" in publicJob),
        verificationPassed:checked.ok,
        resourceScoreBefore:before.score,
        resourceScoreAfter:after.score,
        usefulWorkBefore:before.components.usefulWork,
        usefulWorkAfter:after.components.usefulWork,
        durationMs:Date.now()-startedAt
      });
    }catch{
      json(res,500,{ok:false,error:"NODE_SELF_TEST_FAILED"});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/resource/status"){
    try{
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,network);
      json(res,200,{ok:true,resource:resourceContributionScore(profile)});
    }catch(error){
      const m=String(error?.message||error);
      json(res,["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(m)?401:500,{ok:false,error:m});
    }
    return;
  }

  if(req.method==="POST" && raw==="/api/human-signal/resource/heartbeat"){
    try{
      requireHumanSignalOrigin(req);
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      const profile=authHumanSignalProfile(req,network);
      network.miningSessions=Array.isArray(network.miningSessions)?network.miningSessions:[];
      const active=network.miningSessions.some(x=>x.profileId===profile.id && x.status==="ACTIVE" && Date.parse(x.endsAt)>Date.now());
      if(!active) throw new Error("ACTIVE_MINING_SESSION_REQUIRED");
      const heartbeat=recordResourceHeartbeat(profile,Date.now());
      if(heartbeat.accepted) saveHumanSignalNetwork(network);
      json(res,200,{ok:true,heartbeat,resource:resourceContributionScore(profile)});
    }catch(error){
      const m=String(error?.message||error);
      const status=m==="HUMAN_SIGNAL_ORIGIN_INVALID"?403:
        ["HUMAN_SIGNAL_AUTH_REQUIRED","HUMAN_SIGNAL_SESSION_INVALID"].includes(m)?401:
        m==="ACTIVE_MINING_SESSION_REQUIRED"?409:500;
      json(res,status,{ok:false,error:m});
    }
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
      guardHscMutation(profile.id,"MINING_START",{route:"/api/human-signal/mining/start"});
      const session=newMiningSession(profile.id,rate);
      networkStore.miningSessions.push(session);
      saveHumanSignalNetwork(networkStore);
      emitHsc("MINING_STARTED",profile.id,session.id,{rate:session.rateSnapshot.rate,version:session.version});
      json(res,201,{ok:true,session:publicMiningSession(session),profile:{id:profile.id,signalPoints:Number(profile.signalPoints||0),pendingCoh:Number(profile.pendingCoh||0),pioneer:Boolean(profile.pioneer)}});
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
      guardHscMutation(profile.id,"MINING_CLAIM",{route:"/api/human-signal/mining/claim",sessionId:session.id});
      const claim=applyClaim(session,profile,Date.now());
      saveHumanSignalNetwork(networkStore);
      emitHsc("MINING_CLAIMED",profile.id,session.id,{amount:claim.amount,ended:claim.ended});
      json(res,200,{ok:true,claim,session:publicMiningSession(session),profile:{id:profile.id,signalPoints:Number(profile.signalPoints||0),pendingCoh:Number(profile.pendingCoh||0),pioneer:Boolean(profile.pioneer)}});
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
        unit:"PENDING_COH_AND_SIGNAL_POINTS",
        transferable:false,
        token:false,
        conversionPromised:false,
        pendingCohProvisional:true,
        pendingCohTransferable:false,
        profile:{id:profile.id,signalPoints:Number(profile.signalPoints||0),pendingCoh:Number(profile.pendingCoh||0),pioneer:Boolean(profile.pioneer)},
        currentRate:rate,
        resource:resourceContributionScore(profile),
        rateUnits:rateUnits(rate.rate),
        reserve:miningReserveState(networkStore.profiles||[]),
        session:active?publicMiningSession(active):null
      });
    }catch(error){
      json(res,401,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(req.method==="GET" && raw==="/api/human-signal/mining/economics"){
    const networkStore=loadHumanSignalNetwork();
    const reserve=miningReserveState(networkStore.profiles||[]);
    let personal=null;
    try{
      const profile=authHumanSignalProfile(req,networkStore);
      const contributionStore=loadHumanSignal();
      const rate=miningRateForProfile(profile,networkStore,contributionStore);
      personal={profileId:profile.id,rate:rateUnits(rate.rate),rateDetail:rate,pendingCoh:Number(profile.pendingCoh||0)};
    }catch{}
    json(res,200,{ok:true,...reserve,personal,generatedAt:new Date().toISOString()});
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

  if(req.method==="GET" && raw==="/api/community/mining-dashboard"){
    try{
      const network=ensureHumanProofStore(loadHumanSignalNetwork());
      network.miningSessions=Array.isArray(network.miningSessions)?network.miningSessions:[];
      const profiles=Array.isArray(network.profiles)?network.profiles:[];
      const sessions=network.miningSessions;
      const now=Date.now();

      const phoneVerified=profiles.filter(p=>Boolean(p.humanProofs?.phone?.verified)).length;
      const walletBound=profiles.filter(p=>Boolean(p.wallet)).length;
      const cohWalletActive=profiles.filter(p=>Boolean(p.cohWallet?.ownerAddress)).length;
      const pioneerProfiles=profiles.filter(p=>Boolean(p.pioneer)).length;
      const humanVerified=profiles.filter(p=>publicHumanProof(p).confidence.tier==="HUMAN_VERIFIED").length;
      const minerIds=new Set(sessions.map(x=>x.profileId).filter(Boolean));
      const activeMinerIds=new Set(
        sessions.filter(x=>x.status==="ACTIVE" && Date.parse(x.endsAt)>now).map(x=>x.profileId).filter(Boolean)
      );
      const pendingCoh=profiles.reduce((sum,p)=>sum+Number(p.pendingCoh||0),0);
      const signalPoints=profiles.reduce((sum,p)=>sum+Number(p.signalPoints||0),0);
      const referralAttributed=profiles.filter(p=>Boolean(p.invitedBy)).length;
      const trustConnections=profiles.reduce((sum,p)=>sum+(Array.isArray(p.trustConnections)?p.trustConnections.length:0),0);

      const dayKey=value=>{
        const t=Date.parse(value||"");
        return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null;
      };
      const days=[];
      for(let i=13;i>=0;i--){
        const d=new Date(now-i*86400000).toISOString().slice(0,10);
        days.push(d);
      }
      const growth=days.map(day=>({
        day,
        newProfiles:profiles.filter(p=>dayKey(p.createdAt)===day).length,
        miningStarts:sessions.filter(x=>dayKey(x.startedAt||x.createdAt)===day).length
      }));

      json(res,200,{
        ok:true,
        generatedAt:new Date().toISOString(),
        phase:"PRE_MAINNET",
        privacy:"AGGREGATE_ONLY",
        totals:{
          profiles:profiles.length,
          phoneVerified,
          humanVerified,
          walletBound,
          cohWalletActive,
          minersEver:minerIds.size,
          activeMiners:activeMinerIds.size,
          pioneerProfiles,
          miningSessions:sessions.length,
          pendingCoh:Number(pendingCoh.toFixed(8)),
          signalPoints:Number(signalPoints.toFixed(8)),
          referralAttributed,
          trustConnections
        },
        growth,
        notes:{
          pendingCoh:"Provisional off-chain accounting; not transferable COH SPL.",
          activeMiner:"Distinct profile with an ACTIVE mining session whose endsAt is still in the future.",
          privacy:"No phone numbers, wallet addresses, session tokens or profile identifiers are returned."
        }
      });
    }catch(error){
      json(res,500,{ok:false,error:"MINING_DASHBOARD_UNAVAILABLE"});
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
      ...(raw==="/wallet-integrations.html"?{"cross-origin-opener-policy":"same-origin-allow-popups","content-security-policy":"default-src 'self'; script-src 'self' https://sdk.minepi.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.minepi.com; object-src 'none'; frame-src https://*.minepi.com https://*.pi.network; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"}:{}),
      ...(raw==="/poha-lab.html"?{"cross-origin-opener-policy":"same-origin-allow-popups"}:{}),
      "content-type":types[path.extname(target)]||"application/octet-stream",
      "cache-control":[".html",".js"].includes(path.extname(target))?"no-cache, no-store, must-revalidate":"public, max-age=300"
    });
    res.end(data);
  });
}

const server=http.createServer((req,res)=>{
  if(accountDatabaseRequired && String(req.url).startsWith("/api/") && !String(req.url).startsWith("/api/integrations/checkout/") && !["/api/health","/api/v1/status","/api/integrations/config","/api/integrations/ousd/mint","/api/integrations/ousd/request","/api/integrations/ousd/prepare","/api/integrations/ousd/verify"].includes(req.url)){
    if(!accountDatabase){json(res,503,{ok:false,error:"ACCOUNT_STORAGE_UNAVAILABLE"});return;}
    if(!rateLimitApi(req)){json(res,429,{ok:false,error:"RATE_LIMITED"});return;}
    req.hsRateLimitChecked=true;
    void transactionalResponse(accountDatabase,handleRequest,req,res);return;
  }
  void handleRequest(req,res).catch(()=>{if(!res.headersSent)json(res,503,{ok:false,error:"SERVICE_UNAVAILABLE"});else res.destroy();});
});

async function maybeBootstrapInfobip2fa(){
  if(!(process.env.INFOBIP_API_KEY&&process.env.INFOBIP_BASE_URL)){
    console.log("COHIBA_INFOBIP_BOOTSTRAP_SKIPPED");
    return;
  }
  try{
    const cfg=await ensureInfobip2faConfig();
    console.log("COHIBA_INFOBIP_BOOTSTRAP_READY", JSON.stringify({
      provider:"infobip",
      applicationConfigured:Boolean(cfg.applicationId),
      messageConfigured:Boolean(cfg.messageId),
      persisted:true
    }));
  }catch(error){
    console.error("COHIBA_INFOBIP_BOOTSTRAP_FAILED", String(error?.message||error));
  }
}

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

if(pohaDatabaseRequired){
  try{
    const database=new PohaDatabase({connectionString:process.env.HUMAN_SIGNAL_DATABASE_URL});
    await database.initialize();
    if(accountDatabaseRequired){
      const specs={
        network:{file:HUMAN_SIGNAL_NETWORK_FILE,fallback:{profiles:[],sessions:[],challenges:[]},validate:s=>Boolean(s&&Array.isArray(s.profiles)&&Array.isArray(s.sessions)&&Array.isArray(s.challenges))},
        onboarding:{file:ACCOUNT_ONBOARDING_FILE,fallback:{records:[]},validate:s=>Boolean(s&&Array.isArray(s.records))},
        core:{file:HUMAN_SIGNAL_CORE_FILE,fallback:{events:[],apps:[],appUtility:[]},validate:s=>Boolean(s&&Array.isArray(s.events)&&verifyEventChain(s.events).valid)},
        contributions:{file:HUMAN_SIGNAL_FILE,fallback:{records:[]},validate:s=>Boolean(s&&Array.isArray(s.records))}
      };
      const stores=Object.fromEntries(Object.entries(specs).map(([id,spec])=>[id,{validate:spec.validate,readLegacy:()=>readJson(spec.file,spec.fallback,spec.validate)}]));
      stores[CHECKOUT_STORE]=checkoutStoreSpec;
      const accounts=new AccountStateDatabase({connectionString:process.env.HUMAN_SIGNAL_DATABASE_URL,stores});
      await accounts.initialize();accountDatabase=accounts;
    }
    const core=accountDatabase?await accountDatabase.transaction(()=>loadHumanSignalCore()):loadHumanSignalCore();if(core.storageRecovered||!verifyEventChain(core.events||[]).valid)throw new Error("INVALID_CORE");await database.importLegacy(core);
    if(process.env.HS_PILOT_PUBLIC_KEY && process.env.HS_PILOT_AUDIENCE)await database.enrollService({id:"draft-board",publicKey:process.env.HS_PILOT_PUBLIC_KEY,audience:process.env.HS_PILOT_AUDIENCE,scopes:["DRAFT_APP_ACTION"],resourcePrefix:"draft:",requireApproval:false});
    if(process.env.ALLOW_POHA_AUTHORIZATION==="true"){
      // Separate per-process service key: never returned to the browser or reused across replicas.
      const keys=crypto.generateKeyPairSync("ed25519");
      const pilot={id:"disclosure-pilot-"+crypto.randomBytes(8).toString("hex"),key:keys.privateKey,policy:{version:DISCLOSURE_POLICY_VERSION,endpoint:"mock://wellness/v1",model:"mock-wellness-v1",purpose:"GENERAL_WELLNESS",maxBytes:4096}};
      await database.enrollService({id:pilot.id,publicKey:keys.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("base64"),audience:CANONICAL_PUBLIC_ORIGIN,scopes:["DRAFT_APP_ACTION"],resourcePrefix:"draft:disclosure-",requireApproval:false,disclosurePolicy:pilot.policy});
      disclosurePilot=pilot;
    }
    pohaDatabase=database;
    checkpointWorker=new CheckpointWorker({database,accounts:accountDatabase,readComposite:hscCompositeStore});checkpointWorker.start();
    if(process.env.HS_BACKUP_BUCKET && process.env.HS_BACKUP_ENDPOINT && process.env.HS_BACKUP_ACCESS_KEY && process.env.HS_BACKUP_SECRET_KEY){
      backupWorker=new BackupWorker({directory:DATA_DIR,database,excludeFiles:accountDatabase?[HUMAN_SIGNAL_NETWORK_FILE,ACCOUNT_ONBOARDING_FILE,HUMAN_SIGNAL_CORE_FILE,HUMAN_SIGNAL_FILE].map(file=>path.basename(file)):[],bucket:process.env.HS_BACKUP_BUCKET,endpoint:process.env.HS_BACKUP_ENDPOINT,region:process.env.HS_BACKUP_REGION||"auto",accessKeyId:process.env.HS_BACKUP_ACCESS_KEY,secretAccessKey:process.env.HS_BACKUP_SECRET_KEY});backupWorker.start();
    }
  }catch{console.error("Human Signal PostgreSQL unavailable; PoHA routes fail closed.");}
}

server.listen(port,"0.0.0.0",()=>{
  console.log(`COHIBA web listening on :${port}`);
  setTimeout(()=>{ void maybeBootstrapInfobip2fa(); },700);
  setTimeout(()=>{ void maybeAutoLaunchMainnet(); },1500);
});
