export const HUMAN_SIGNAL_GATES = Object.freeze(['independentAudit','liveIssuer','externalService','publicAdversarialTesting']);
// Evidence is maintainer-recorded, not cryptographically certified auditor acceptance.
// This is a publication/readiness gate; it never grants action authority or launches COH.
export function humanSignalReleaseReadiness(registry, sourceCommit) {
 const valid=registry?.schemaVersion==='HS_RELEASE_GATES_1'&&typeof registry.auditPreparationComplete==='boolean'&&registry.gates&&Object.keys(registry.gates).length===4&&HUMAN_SIGNAL_GATES.every(k=>Object.hasOwn(registry.gates,k));
 const gates=Object.fromEntries(HUMAN_SIGNAL_GATES.map(name=>{
  const e=valid?registry.gates[name]:null;
  const complete=Boolean(e&&typeof sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(sourceCommit)&&e.reviewedCommit===sourceCommit&&typeof e.operator==='string'&&e.operator.trim()&&typeof e.evidenceUrl==='string'&&/^https:\/\/[^\s]+$/.test(e.evidenceUrl)&&/^[a-f0-9]{64}$/.test(e.reportSha256||'')&&e.accepted===true&&e.retestComplete===true&&e.unresolvedCriticalHigh===0);
  return [name,{status:complete?'RECORDED_COMPLETE':'BLOCKED',reason:!valid?'INVALID_REGISTRY':complete?'EVIDENCE_REQUIRES_INDEPENDENT_VALIDATION':e?'INCOMPLETE_OR_DIFFERENT_COMMIT':'NO_ACCEPTANCE_EVIDENCE'}];
 }));
 const allRecorded=Object.values(gates).every(g=>g.status==='RECORDED_COMPLETE');
 return {schemaVersion:'HS_RELEASE_READINESS_1',sourceCommit:sourceCommit||null,status:allRecorded?'EVIDENCE_RECORDED':valid&&registry.auditPreparationComplete?'AUDIT_READY':'PRE_AUDIT',openReleaseEligible:allRecorded,gates,blockedBy:HUMAN_SIGNAL_GATES.filter(k=>gates[k].status==='BLOCKED'),claim:'Maintainer evidence registry; not an independent security certification. Tests and builds do not establish safety.'};
}
