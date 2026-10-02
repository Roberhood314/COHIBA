import crypto from "node:crypto";
import { humanConfidence } from "./human-proof.mjs";

export const PIONEER_SUPPORT_VERSION="0.1";

export function miningEligibility(profile,{providersReady=false,enforceHumanProof=false}={}){
  const confidence=humanConfidence(profile);
  const walletVerified=Boolean(profile?.wallet);
  let factor=walletVerified?1:0;
  let status=walletVerified?"WALLET_READY":"BLOCKED";
  let reason=walletVerified?null:"WALLET_VERIFICATION_REQUIRED";

  if(walletVerified && enforceHumanProof){
    if(confidence.tier==="HUMAN_VERIFIED"){factor=1;status="FULL";}
    else if(confidence.tier==="STRONG_SIGNAL"){factor=0.8;status="LIMITED";}
    else {factor=0.5;status="LIMITED";reason="COMPLETE_HUMAN_PROOF";}
  }else if(walletVerified && providersReady && confidence.tier!=="HUMAN_VERIFIED"){
    status="GRACE_PERIOD";
    reason="HUMAN_PROOF_RECOMMENDED";
  }
  return {eligible:factor>0,factor,status,reason,humanProofTier:confidence.tier};
}

export function onboardingChecklist(profile){
  const c=humanConfidence(profile);
  return [
    {id:"wallet",label:"Verify Solana wallet",done:Boolean(profile?.wallet),required:true},
    {id:"daily",label:"Activate Daily Signal",done:Boolean(profile?.lastActiveDay),required:false},
    {id:"phone",label:"Verify phone OTP",done:Boolean(profile?.humanProofs?.phone?.verified),required:false},
    {id:"social",label:"Verify Google or Facebook",done:Boolean(profile?.humanProofs?.google?.verified||profile?.humanProofs?.facebook?.verified),required:false},
    {id:"human",label:"Reach HUMAN_VERIFIED",done:c.tier==="HUMAN_VERIFIED",required:false},
    {id:"trust",label:"Add a trusted Human Signal connection",done:(profile?.trustConnections||[]).length>0,required:false},
    {id:"contribute",label:"Submit a contribution proof",done:Boolean(profile?.hasContribution),required:false},
    {id:"mine",label:"Start first Signal Mining session",done:Boolean(profile?.hasMined),required:false}
  ];
}

export function pioneerMissions(profile){
  const missions=[
    {id:"MISSION_DAILY_7",title:"7-Day Human Signal",description:"Activate Daily Signal for a 7-day streak.",target:7,progress:Math.min(7,Number(profile?.streak||0)),rewardClass:"REPUTATION"},
    {id:"MISSION_TRUST_3",title:"Build a Trust Triangle",description:"Create three valid trust connections.",target:3,progress:Math.min(3,(profile?.trustConnections||[]).length),rewardClass:"RATE_INPUT"},
    {id:"MISSION_HUMAN_PROOF",title:"Prove Human Control",description:"Complete the HUMAN_VERIFIED confidence tier.",target:1,progress:humanConfidence(profile).tier==="HUMAN_VERIFIED"?1:0,rewardClass:"ELIGIBILITY"},
    {id:"MISSION_CONTRIBUTOR",title:"Make the Network Better",description:"Submit at least one public contribution proof.",target:1,progress:profile?.hasContribution?1:0,rewardClass:"REPUTATION"}
  ];
  return missions.map(m=>({...m,complete:m.progress>=m.target}));
}

export function ensureReferralCode(profile){
  if(profile.referralCode) return profile.referralCode;
  profile.referralCode="HS-"+crypto.randomBytes(5).toString("hex").toUpperCase();
  return profile.referralCode;
}

export function referralBoost(verifiedReferralCount){
  const n=Math.max(0,Number(verifiedReferralCount)||0);
  return Math.min(0.25,Math.log2(1+n)*0.05);
}

export function publicPioneerSupport(profile,opts={}){
  return {
    version:PIONEER_SUPPORT_VERSION,
    eligibility:miningEligibility(profile,opts),
    checklist:onboardingChecklist(profile),
    missions:pioneerMissions(profile),
    referralCode:ensureReferralCode(profile),
    verifiedReferrals:Number(profile?.verifiedReferralCount||0),
    referralBoost:referralBoost(profile?.verifiedReferralCount||0)
  };
}
