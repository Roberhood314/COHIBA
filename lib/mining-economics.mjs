export const COH_TOTAL_SUPPLY=1_000_000_000;
export const COMMUNITY_ALLOCATION=100_000_000;
export const COMMUNITY_MINING_RESERVE=COMMUNITY_ALLOCATION;

export function pendingAllocated(profiles=[]){
  return Number(profiles.reduce((sum,p)=>sum+Math.max(0,Number(p.pendingCoh||0)),0).toFixed(8));
}

export function miningReserveState(profiles=[]){
  const allocated=pendingAllocated(profiles);
  return {
    totalSupplyFixed:COH_TOTAL_SUPPLY,
    totalSupplyRemaining:COH_TOTAL_SUPPLY,
    communityAllocation:COMMUNITY_ALLOCATION,
    miningReserve:COMMUNITY_MINING_RESERVE,
    pendingAllocated:allocated,
    miningReserveRemaining:Number(Math.max(0,COMMUNITY_MINING_RESERVE-allocated).toFixed(8)),
    supplyModel:"FIXED_SUPPLY_WITH_PROVISIONAL_COMMUNITY_RESERVE",
    note:"Mining does not reduce total supply. Pending COH reduces only the provisional Community Mining Reserve."
  };
}

export function rateUnits(ratePerHour){
  const h=Math.max(0,Number(ratePerHour)||0);
  return {
    perHour:Number(h.toFixed(8)),
    perMinute:Number((h/60).toFixed(10)),
    perSecond:Number((h/3600).toFixed(12)),
    projected24h:Number((h*24).toFixed(8))
  };
}
