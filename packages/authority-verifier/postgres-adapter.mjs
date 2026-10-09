// Inject a PostgreSQL pool owned by the integrating service. No COHIBA connection.
export async function createPostgresReplayStore(pool){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS hs_verifier_epochs(issuer text NOT NULL,principal_id text NOT NULL,credential_epoch bigint NOT NULL,PRIMARY KEY(issuer,principal_id));
 CREATE TABLE IF NOT EXISTS hs_verifier_actions(signer_key text NOT NULL,nonce text NOT NULL,action_digest text NOT NULL,PRIMARY KEY(signer_key,nonce));
 CREATE TABLE IF NOT EXISTS hs_verifier_approvals(principal_key text NOT NULL,nonce text NOT NULL,PRIMARY KEY(principal_key,nonce));
 CREATE TABLE IF NOT EXISTS hs_verifier_challenges(audience text NOT NULL,nonce text NOT NULL,PRIMARY KEY(audience,nonce));`);
 return async (admission,{onAdmit}={})=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const x=admission;
   await c.query('INSERT INTO hs_verifier_epochs(issuer,principal_id,credential_epoch) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[x.issuer,x.principalId,x.credentialEpoch]);
   const row=(await c.query('SELECT credential_epoch FROM hs_verifier_epochs WHERE issuer=$1 AND principal_id=$2 FOR UPDATE',[x.issuer,x.principalId])).rows[0];
   if(BigInt(row.credential_epoch)>BigInt(x.credentialEpoch))throw Error('REJECT');
   const insert=async(sql,args)=>{if(!(await c.query(sql+' ON CONFLICT DO NOTHING RETURNING nonce',args)).rows.length)throw Error('REJECT');};
   await insert('INSERT INTO hs_verifier_actions(signer_key,nonce,action_digest) VALUES($1,$2,$3)',[x.signerKey,x.actionNonce,x.actionDigest]);
   if(x.approval)await insert('INSERT INTO hs_verifier_approvals(principal_key,nonce) VALUES($1,$2)',[x.approval.principalKey,x.approval.nonce]);
   await insert('INSERT INTO hs_verifier_challenges(audience,nonce) VALUES($1,$2)',[x.audience,x.challenge]);
   await c.query('UPDATE hs_verifier_epochs SET credential_epoch=$3 WHERE issuer=$1 AND principal_id=$2',[x.issuer,x.principalId,x.credentialEpoch]);
   if(Date.parse(x.validUntil)<=Date.now())throw Error('REJECT');
   if(onAdmit){if(typeof onAdmit!=='function')throw Error('INVALID_ADMISSION_HOOK');await onAdmit(c,admission);}
   if(Date.parse(x.validUntil)<=Date.now())throw Error('REJECT');
   await c.query('COMMIT');return true;
  }catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.message==='REJECT')return false;throw e;}finally{c.release();}
 };
}

// Local revocation and business SQL share the same principal row lock.
// These functions are operator APIs: never expose revoke without authentication.
export async function createPostgresCommitGate(pool,{onCommit}={}){
 if(typeof onCommit!=='function')throw Error('ATOMIC_COMMIT_HOOK_REQUIRED');
 const consume=await createPostgresReplayStore(pool);
 await pool.query(`CREATE TABLE IF NOT EXISTS hs_verifier_revocations(
 issuer text NOT NULL,principal_id text NOT NULL,authority_id text NOT NULL,
 PRIMARY KEY(issuer,principal_id,authority_id));
 CREATE TABLE IF NOT EXISTS hs_verifier_commits(action_digest text PRIMARY KEY,valid_until timestamptz NOT NULL);
 CREATE OR REPLACE FUNCTION hs_verifier_check_commit_expiry() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'AUTHORITY_EXPIRED_AT_COMMIT'; END IF;
  RETURN NEW;
 END; $$;
 DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='hs_verifier_commits'::regclass AND tgname='hs_verifier_commit_expiry') THEN
   CREATE CONSTRAINT TRIGGER hs_verifier_commit_expiry AFTER INSERT OR UPDATE ON hs_verifier_commits
   DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hs_verifier_check_commit_expiry();
  END IF;
 END; $$;`);
 return {
  async commit(admission){
   return consume(admission,{onAdmit:async(c,x)=>{
    if(!Array.isArray(x.authorityIds)||x.authorityIds.length>2||x.authorityIds.some(id=>typeof id!=='string'||!/^(AGENT|DELEGATION)-[a-f0-9]{64}$/.test(id)))throw Error('REJECT');
    const revoked=await c.query('SELECT authority_id FROM hs_verifier_revocations WHERE issuer=$1 AND principal_id=$2 AND authority_id = ANY($3::text[])',[x.issuer,x.principalId,['*',...x.authorityIds]]);
    if(revoked.rows.length)throw Error('REJECT');
    await c.query('INSERT INTO hs_verifier_commits(action_digest,valid_until) VALUES($1,$2)',[x.actionDigest,x.validUntil]);
    // Pass only frozen verified context. Effects must use this transaction client.
    await onCommit(c,Object.freeze({...x,authorityIds:Object.freeze([...x.authorityIds]),approval:x.approval?Object.freeze({...x.approval}):null}));
   }});
  },
  async revoke({issuer,principalId,authorityId='*'}){
   if(typeof issuer!=='string'||!/^[a-z0-9-]{3,64}$/.test(issuer)||typeof principalId!=='string'||!/^(HUMAN|COH)-[A-F0-9]{12}$/.test(principalId)||typeof authorityId!=='string'||authorityId!=='*'&&!/^(AGENT|DELEGATION)-[a-f0-9]{64}$/.test(authorityId))throw Error('INVALID_REVOCATION');
   const c=await pool.connect();try{
    await c.query('BEGIN');
    await c.query('INSERT INTO hs_verifier_epochs(issuer,principal_id,credential_epoch) VALUES($1,$2,1) ON CONFLICT DO NOTHING',[issuer,principalId]);
    await c.query('SELECT credential_epoch FROM hs_verifier_epochs WHERE issuer=$1 AND principal_id=$2 FOR UPDATE',[issuer,principalId]);
    await c.query('INSERT INTO hs_verifier_revocations(issuer,principal_id,authority_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[issuer,principalId,authorityId]);
    await c.query('COMMIT');return {revoked:true};
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
 };
}
