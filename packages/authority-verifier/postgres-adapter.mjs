// Inject a PostgreSQL pool owned by the integrating service. No COHIBA connection.
export async function createPostgresReplayStore(pool){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS hs_verifier_epochs(issuer text NOT NULL,principal_id text NOT NULL,credential_epoch bigint NOT NULL,PRIMARY KEY(issuer,principal_id));
 CREATE TABLE IF NOT EXISTS hs_verifier_actions(signer_key text NOT NULL,nonce text NOT NULL,action_digest text NOT NULL,PRIMARY KEY(signer_key,nonce));
 CREATE TABLE IF NOT EXISTS hs_verifier_approvals(principal_key text NOT NULL,nonce text NOT NULL,PRIMARY KEY(principal_key,nonce));
 CREATE TABLE IF NOT EXISTS hs_verifier_challenges(audience text NOT NULL,nonce text NOT NULL,PRIMARY KEY(audience,nonce));`);
 return async admission=>{
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
   await c.query('COMMIT');return true;
  }catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.message==='REJECT')return false;throw e;}finally{c.release();}
 };
}
