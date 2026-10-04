// Optional adapter only. Not imported or activated by the production web server.
import {createAuthorityIssuer} from '../packages/authority-verifier/issuer.mjs';
export function createPohaAuthorityIssuer({database,resolveContext,...config}){
 return createAuthorityIssuer({...config,resolveSnapshot:async(principalId,request)=>database.transaction(principalId,async c=>{
  const context=resolveContext(principalId,request.audience);if(!context)return null;
  const before=JSON.stringify(context),principal=await database.principal(c,context),store=await database.store(c,principalId);
  const d=request.performer==='AGENT'?store.pohaDelegations.find(x=>x.id===request.delegationId):null;
  const b=d?store.pohaAgents.find(x=>x.id===d.payload.bindingId):null;
  const portable=r=>{if(!r)return null;const {revokedAt,...signed}=r;return signed;};
  if(JSON.stringify(resolveContext(principalId,request.audience))!==before)throw Error('IDENTITY_CHANGED_RETRY');
  return {principalId,principalKey:principal.principalKey,identityAssurance:principal.identityAssurance,assuranceExpiresAt:principal.assuranceExpiresAt,credentialEpoch:principal.credentialEpoch,principalRevoked:Boolean(principal.revokedAt),binding:portable(b),delegation:portable(d),bindingRevoked:!b||Boolean(b.revokedAt),delegationRevoked:!d||Boolean(d.revokedAt)};
 })});
}
