// Provenance and risk evidence, independent of COH and of humanity decisions.
export function agencyGraph({profile,agents=[],delegations=[],receipts=[],contributions=[],principal=null},now=new Date()){
 const nodes=new Map([[profile.id,{id:profile.id,type:'HUMAN_PROFILE'}]]),edges=[];
 const active=r=>!r.revokedAt&&Date.parse(r.payload.expiresAt)>now.getTime();
 for(const other of [...new Set(profile.trustConnections||[])].sort()){
  nodes.set(other,{id:other,type:'HUMAN_PROFILE'});edges.push({from:profile.id,to:other,relation:'trusts',assurance:'SELF_ASSERTED'});
 }
 for(const agent of agents){nodes.set(agent.id,{id:agent.id,type:'AGENT',publicKey:agent.payload.agentKey,status:active(agent)?'ACTIVE':agent.revokedAt?'REVOKED':'EXPIRED'});}
 for(const grant of delegations){
  const binding=agents.find(a=>a.id===grant.payload.bindingId);if(!binding)continue;
  const enabled=active(grant)&&active(binding)&&!principal?.revokedAt;
  edges.push({from:profile.id,to:binding.id,relation:'delegates',delegationId:grant.id,scopes:grant.payload.scopes,resource:grant.payload.resource,audience:grant.payload.audience,expiresAt:grant.payload.expiresAt,status:enabled?'ACTIVE':'INACTIVE'});
  edges.push({from:binding.id,to:profile.id,relation:'acts_for',delegationId:grant.id,status:enabled?'ACTIVE':'INACTIVE'});
 }
 for(const receipt of receipts){
  const performer=receipt.actorClass==='VERIFIED_HUMAN'?profile.id:agents.find(a=>a.payload.agentKey===receipt.performerKey)?.id;
  const actionId='ACTION-'+receipt.actionDigest,serviceId='SERVICE-'+receipt.serviceId;
  nodes.set(serviceId,{id:serviceId,type:'SERVICE'});nodes.set(actionId,{id:actionId,type:'ACTION',actorClass:receipt.actorClass,checkedAt:receipt.checkedAt});
  if(performer)edges.push({from:performer,to:serviceId,relation:'interacts_with',actionId});
  if(receipt.actorClass==='VERIFIED_HUMAN'||receipt.humanApprovalDigest)edges.push({from:profile.id,to:actionId,relation:'authorizes',approvalDigest:receipt.humanApprovalDigest||null});
 }
 const verified=contributions.filter(c=>c.profileId===profile.id&&c.status==='VERIFIED');
 const counts=Object.fromEntries(['SECURITY','CODE','RESEARCH','DOCUMENTATION','TRANSLATION','CREATIVE','COMMUNITY'].map(type=>[type,verified.filter(c=>c.type===type).length]));
 const weights={SECURITY:30,CODE:25,RESEARCH:20,DOCUMENTATION:15,TRANSLATION:12,CREATIVE:10,COMMUNITY:8};
 const risks=[];const phone=profile.humanProofs?.phone;
 if(!phone?.verified||phone.revokedAt||!Number.isFinite(Date.parse(phone.verifiedAt))||now.getTime()-Date.parse(phone.verifiedAt)>=30*86400000)risks.push('PHONE_ASSURANCE_ABSENT_OR_EXPIRED');
 if(principal?.revokedAt)risks.push('PRINCIPAL_REVOKED');
 if(principal?.principalKey&&profile.wallet&&principal.identityAssurance==='NONE')risks.push('PRINCIPAL_ASSURANCE_NONE');
 return {version:'HS_AGENCY_GRAPH_V1',principalId:profile.id,nodes:[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id)),edges,
  signals:{version:'HS_TRUST_SIGNALS_V1',contributionScore:verified.reduce((n,c)=>n+(weights[c.type]||0),0),verifiedContributions:verified.length,contributionTypes:counts,authorizedActions:receipts.length,selfAssertedTrustEdges:(profile.trustConnections||[]).length,riskSignals:risks,economicInputsUsed:false,determinesHumanity:false},
  limitations:['Trust edges are self-asserted.','Phone policy does not establish unique biological personhood.','Risk signals do not grant or revoke authority.']};
}
