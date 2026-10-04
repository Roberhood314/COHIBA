# Human Signal Node SDK 1.0.0

Install the versioned `.tgz` from the `human-signal-sdk-v1` GitHub Actions artifact:

```sh
npm install ./cohiba-human-signal-1.0.0.tgz
```

This package is self-contained, uses Node's built-in crypto/fetch, and has no runtime dependencies. It has not been published to the npm registry. Node >=22 is required.

```js
import {HumanSignalServiceClient,payloadDigest,proofDigest,verifyCheckpoint} from '@cohiba/human-signal';
const client = new HumanSignalServiceClient({baseUrl:'https://cohibameme.site',serviceId:'your-service',privateKey});
const result = await client.authorize({proof,action:'DRAFT_APP_ACTION',resource:'draft:article',payloadBase64:Buffer.from(actualOperationBytes).toString('base64')});
if (result.decision !== 'ALLOW' || result.executionAuthorized !== true || result.serviceId !== 'your-service' || Date.parse(result.expiresAt) <= Date.now()) throw Error('Not authorized');
if (result.actionDigest !== proofDigest('ACTION',proof.payload)) throw Error('Receipt mismatch');
// Before authorize(), compare proof.payload to your own audience/action/resource and payloadDigest(actualOperationBytes).
// Persist/execute the actual operation only after those comparisons; use a UNIQUE actionDigest.
```

`HumanSignalClient` is for the Human owner's bearer session: agency(), registerAgent(), delegate(), revoke(), inspect(). Never send the Human session to an external service. `HumanSignalServiceClient` signs each raw request with the service's local Ed25519 key, timestamp and fresh nonce. No automatic retry after authorization: a consumed nonce requires a fresh proof if execution fails. Online receipts are not portable signed receipts.

`agentBindingPayload`, `delegationPayload`, `actionPayload`, `signProof`, `signingBytes`, `proofDigest`, `payloadDigest`, `publicKeyBase64`, `POHA_SCOPES`, `SDK_VERSION` support local proof construction. Human binding and delegation signatures must originate from the actual owner wallet. Agent keys are independent. Scope is restricted to public/read and draft operations; no transfers.

Verify signed checkpoints with a public key and issuer pinned independently:

```js
verifyCheckpoint(checkpoint, {issuer:'https://cohibameme.site',publicKey:trustedCheckpointKey});
```

Do not trust a checkpoint merely because its embedded key verifies its signature. Obtain/pin the trusted key separately. A valid signature does not establish that state is correct, fresh or anchored. Domain hashes commit private state without disclosing it; this version has no per-record inclusion proof.

Enrollment is operator-reviewed. Submit public key, HTTPS audience, allowed scopes, resource prefix and approval policy. Never submit private keys. The operator uses `scripts/service-policy.mjs`. Set `enabled:false` to disable the service; enroll a replacement public key to rotate. Policies have an audit record in PostgreSQL. See `docs/protocol/PUBLIC_PILOT_READINESS.md` for exact boundaries and gates.
