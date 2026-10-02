import crypto from "node:crypto";

export const NODE_PAIRING_TTL_MS=10*60*1000;
export const NODE_SESSION_TTL_MS=30*24*60*60*1000;

export function generateNodePairingCode(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes=crypto.randomBytes(10);
  let out="";
  for(let i=0;i<10;i++) out+=alphabet[bytes[i]%alphabet.length];
  return out;
}

export function hashNodePairingCode(code,secret){
  const normalized=String(code||"").trim().toUpperCase().replace(/[^A-Z2-9]/g,"");
  if(normalized.length!==10) throw new Error("NODE_PAIRING_CODE_INVALID");
  if(!secret) throw new Error("NODE_PAIRING_SECRET_MISSING");
  return crypto.createHmac("sha256",String(secret)).update("cohiba-node-pair:"+normalized).digest("hex");
}

export function newNodeSession(profileId,now=Date.now()){
  const token=crypto.randomBytes(32).toString("base64url");
  return {
    token,
    record:{
      profileId:String(profileId),
      tokenHash:crypto.createHash("sha256").update(token).digest("hex"),
      createdAt:new Date(now).toISOString(),
      expiresAt:new Date(now+NODE_SESSION_TTL_MS).toISOString(),
      lastSeenAt:new Date(now).toISOString()
    }
  };
}

export function nodeTokenHash(token){
  return crypto.createHash("sha256").update(String(token||"")).digest("hex");
}

export function isNodeSessionValid(record,now=Date.now()){
  return Boolean(record && !record.revokedAt && Date.parse(record.expiresAt)>now);
}
