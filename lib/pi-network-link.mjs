// Pi /me verifies token control. It never grants PoHA authority or KYC status.
export async function verifyPiAccessToken(accessToken, fetchImpl = fetch) {
  if(typeof accessToken !== 'string' || accessToken.length < 16 || accessToken.length > 4096 || /\s/.test(accessToken)) throw Error('PI_TOKEN_INVALID');
  let response;
  try { response = await fetchImpl('https://api.minepi.com/v2/me', {
    headers:{authorization:'Bearer '+accessToken}, redirect:'error', signal:AbortSignal.timeout(8000)
  }); } catch { throw Error('PI_PROVIDER_UNAVAILABLE'); }
  if(response.status === 401 || response.status === 403) throw Error('PI_TOKEN_INVALID');
  if(!response.ok) throw Error('PI_PROVIDER_UNAVAILABLE');
  let user; try { user = await response.json(); } catch { throw Error('PI_PROVIDER_INVALID_RESPONSE'); }
  const until = user?.credentials?.valid_until?.iso8601;
  if(typeof user?.uid !== 'string' || !user.uid || user.uid.length > 256 || !Array.isArray(user.credentials?.scopes) || !Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now()) throw Error('PI_PROVIDER_INVALID_RESPONSE');
  return {uid:user.uid, validUntil:until, scopes:user.credentials.scopes};
}
export function bindPiIdentity({store, profileId, identityHash, validUntil, now=new Date().toISOString()}) {
  const profile=store.profiles.find(p=>p.id===profileId);
  if(!profile || !profile.wallet) throw Error('PI_LINK_SOLANA_IDENTITY_REQUIRED');
  if(store.profiles.some(p=>p.id!==profileId && p.externalIdentities?.pi?.identityHash===identityHash)) throw Error('PI_IDENTITY_ALREADY_LINKED');
  if(profile.externalIdentities?.pi && profile.externalIdentities.pi.identityHash!==identityHash) throw Error('PI_UNLINK_REQUIRED');
  profile.externalIdentities={...profile.externalIdentities,pi:{identityHash,verifiedAt:now,validUntil,provider:'pi-network'}};
  return {linked:true,verifiedAt:now,validUntil,executionAuthorized:false};
}
