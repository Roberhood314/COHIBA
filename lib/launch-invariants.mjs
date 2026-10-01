export const COH_DECIMALS = 9;
export const COH_UI_SUPPLY = 1_000_000_000n;
export const COH_BASE_SUPPLY = COH_UI_SUPPLY * 10n ** BigInt(COH_DECIMALS);

export const LAUNCH_STATES = Object.freeze([
  "NEW","MINT_CREATED","ATA_READY","SUPPLY_MINTED","METADATA_READY",
  "FREEZE_REVOKED","MINT_REVOKED","LOCKED_VERIFIED"
]);

export function validateFinalLaunchRecord(record){
  const errors=[];
  if(!record || typeof record!=="object") return {ok:false,errors:["record must be an object"]};
  if(record.status!=="LOCKED_VERIFIED") errors.push("status must be LOCKED_VERIFIED");
  if(record.locked!==true) errors.push("locked must be true");
  if(record.decimals!==COH_DECIMALS) errors.push("decimals mismatch");
  if(String(record.baseUnitSupply)!==COH_BASE_SUPPLY.toString()) errors.push("base-unit supply mismatch");
  if(record.mintAuthority!==null) errors.push("mint authority must be null");
  if(record.freezeAuthority!==null) errors.push("freeze authority must be null");
  if(record.metadataImmutable!==true) errors.push("metadata must be immutable");
  if(!record.mint) errors.push("mint required");
  if(!record.destinationWallet) errors.push("destination wallet required");
  if(!record.destinationAta) errors.push("destination ATA required");
  return {ok:errors.length===0,errors};
}

export function validateTransition(from,to){
  const a=LAUNCH_STATES.indexOf(from);
  const b=LAUNCH_STATES.indexOf(to);
  return a>=0 && b>=0 && b===a+1;
}

export function verifyOnChainSnapshot(snapshot){
  const errors=[];
  if(String(snapshot?.supplyBaseUnits)!==COH_BASE_SUPPLY.toString()) errors.push("supply mismatch");
  if(snapshot?.decimals!==COH_DECIMALS) errors.push("decimals mismatch");
  if(snapshot?.mintAuthority!==null) errors.push("mint authority not revoked");
  if(snapshot?.freezeAuthority!==null) errors.push("freeze authority not revoked");
  if(String(snapshot?.destinationAmount)!==COH_BASE_SUPPLY.toString()) errors.push("destination balance mismatch");
  return {ok:errors.length===0,errors};
}
