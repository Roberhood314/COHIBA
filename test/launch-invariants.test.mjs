import test from "node:test";
import assert from "node:assert/strict";
import {
  COH_BASE_SUPPLY,COH_DECIMALS,LAUNCH_STATES,
  validateFinalLaunchRecord,validateTransition,verifyOnChainSnapshot
} from "../lib/launch-invariants.mjs";

const goodRecord={
  status:"LOCKED_VERIFIED",locked:true,decimals:COH_DECIMALS,
  baseUnitSupply:COH_BASE_SUPPLY.toString(),mintAuthority:null,freezeAuthority:null,
  metadataImmutable:true,mint:"mint",destinationWallet:"wallet",destinationAta:"ata"
};

test("canonical base supply is exact",()=>{
  assert.equal(COH_BASE_SUPPLY,1_000_000_000_000_000_000n);
});

test("final record accepts only the locked verified invariant",()=>{
  assert.equal(validateFinalLaunchRecord(goodRecord).ok,true);
  for(const mutation of [
    {baseUnitSupply:"999"},
    {decimals:8},
    {mintAuthority:"x"},
    {freezeAuthority:"x"},
    {metadataImmutable:false},
    {locked:false},
    {status:"MINT_REVOKED"}
  ]){
    assert.equal(validateFinalLaunchRecord({...goodRecord,...mutation}).ok,false);
  }
});

test("launch state machine allows only adjacent forward transitions",()=>{
  for(let i=0;i<LAUNCH_STATES.length-1;i++){
    assert.equal(validateTransition(LAUNCH_STATES[i],LAUNCH_STATES[i+1]),true);
  }
  assert.equal(validateTransition("NEW","SUPPLY_MINTED"),false);
  assert.equal(validateTransition("LOCKED_VERIFIED","NEW"),false);
  assert.equal(validateTransition("MINT_CREATED","MINT_CREATED"),false);
});

test("on-chain snapshot requires exact supply, destination amount and revoked authorities",()=>{
  const good={
    supplyBaseUnits:COH_BASE_SUPPLY.toString(),decimals:COH_DECIMALS,
    mintAuthority:null,freezeAuthority:null,destinationAmount:COH_BASE_SUPPLY.toString()
  };
  assert.equal(verifyOnChainSnapshot(good).ok,true);
  const fields=["supplyBaseUnits","decimals","mintAuthority","freezeAuthority","destinationAmount"];
  for(const f of fields){
    const bad={...good};
    bad[f]=f==="decimals"?6:(f.includes("Authority")?"attacker":"1");
    assert.equal(verifyOnChainSnapshot(bad).ok,false);
  }
});

test("deterministic mutation/fuzz corpus cannot bypass final invariant",()=>{
  let seed=0xC0A1BA;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let i=0;i<2000;i++){
    const r={...goodRecord};
    const pick=rnd()%7;
    if(pick===0) r.baseUnitSupply=String(rnd());
    if(pick===1) r.decimals=rnd()%18;
    if(pick===2) r.mintAuthority="unauthorized-"+rnd();
    if(pick===3) r.freezeAuthority="unauthorized-"+rnd();
    if(pick===4) r.metadataImmutable=false;
    if(pick===5) r.locked=false;
    if(pick===6) r.status=LAUNCH_STATES[rnd()%(LAUNCH_STATES.length-1)];
    const shouldPass =
      r.baseUnitSupply===goodRecord.baseUnitSupply &&
      r.decimals===goodRecord.decimals &&
      r.mintAuthority===null && r.freezeAuthority===null &&
      r.metadataImmutable===true && r.locked===true &&
      r.status==="LOCKED_VERIFIED";
    assert.equal(validateFinalLaunchRecord(r).ok,shouldPass);
  }
});
