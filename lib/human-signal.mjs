import crypto from "node:crypto";

export const HUMAN_SIGNAL_TYPES = new Set([
  "CODE","SECURITY","RESEARCH","TRANSLATION","CREATIVE","DOCUMENTATION","COMMUNITY"
]);

export function normalizeText(value,max){
  return String(value??"").trim().replace(/\s+/g," ").slice(0,max);
}

export function normalizeUrl(value){
  const raw=normalizeText(value,500);
  if(!raw) return "";
  const u=new URL(raw);
  if(!["https:","http:"].includes(u.protocol)) throw new Error("INVALID_EVIDENCE_URL");
  u.hash="";
  return u.toString();
}

export function normalizeContribution(input={}){
  const type=normalizeText(input.type,32).toUpperCase();
  if(!HUMAN_SIGNAL_TYPES.has(type)) throw new Error("INVALID_CONTRIBUTION_TYPE");
  const title=normalizeText(input.title,120);
  const summary=normalizeText(input.summary,1200);
  const evidenceUrl=normalizeUrl(input.evidenceUrl);
  const contributor=normalizeText(input.contributor,80)||"anonymous";
  if(title.length<4) throw new Error("TITLE_TOO_SHORT");
  if(summary.length<20) throw new Error("SUMMARY_TOO_SHORT");
  if(!evidenceUrl) throw new Error("EVIDENCE_URL_REQUIRED");
  return {type,title,summary,evidenceUrl,contributor};
}

export function contributionDigest(normalized){
  const canonical=[
    "cohiba-human-signal-v1",
    normalized.type,
    normalized.title,
    normalized.summary,
    normalized.evidenceUrl,
    normalized.contributor
  ].join("\n");
  return crypto.createHash("sha256").update(canonical,"utf8").digest("hex");
}

export function contributionId(digest){
  return "HSP-"+digest.slice(0,16).toUpperCase();
}

export function scoreContribution(record){
  if(record.status!=="VERIFIED") return 0;
  const weights={
    SECURITY:30,
    CODE:25,
    RESEARCH:20,
    DOCUMENTATION:15,
    TRANSLATION:12,
    CREATIVE:10,
    COMMUNITY:8
  };
  return weights[record.type]||5;
}

export function publicContribution(record){
  return {
    id:record.id,
    proofHash:record.proofHash,
    type:record.type,
    title:record.title,
    summary:record.summary,
    evidenceUrl:record.evidenceUrl,
    contributor:record.contributor,
    status:record.status,
    reputationPoints:scoreContribution(record),
    submittedAt:record.submittedAt,
    reviewedAt:record.reviewedAt||null,
    reviewNote:record.reviewNote||null,
    proofClass:"COHIBA_HUMAN_SIGNAL_OFFCHAIN_SHA256_V1",
    onChainAnchored:Boolean(record.onChain?.signature),
    onChain:record.onChain||null
  };
}

export function reputationTable(records){
  const by=new Map();
  for(const r of records){
    if(r.status!=="VERIFIED") continue;
    const key=r.contributor||"anonymous";
    const item=by.get(key)||{contributor:key,reputationPoints:0,verifiedContributions:0,types:{}};
    const pts=scoreContribution(r);
    item.reputationPoints+=pts;
    item.verifiedContributions+=1;
    item.types[r.type]=(item.types[r.type]||0)+1;
    by.set(key,item);
  }
  return [...by.values()].sort((a,b)=>b.reputationPoints-a.reputationPoints||a.contributor.localeCompare(b.contributor));
}
