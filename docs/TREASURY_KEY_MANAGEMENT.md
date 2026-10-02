# COHIBA Treasury & Key Management Policy v1.0

## Status
**PRE-MAINNET POLICY — NOT A MAINNET AUTHORIZATION**

## Objective
Protect COHIBA treasury assets, launch authority and privileged project accounts from single-key failure, phishing, device loss and unauthorized signing.

## Treasury architecture
- Production treasury must use a Solana multisig.
- Default operating threshold: **2-of-3**.
- A 1-of-N threshold is prohibited for production treasury.
- An all-signers-required threshold is avoided as the default because one lost key can make assets inaccessible.
- The multisig **Vault address**, not the multisig configuration account, is the address that may hold assets or be assigned asset authority.
- Each signer uses a separate wallet and separate recovery material.
- At least two signers should use hardware-backed or cold-wallet signing where practical.

## Signer roles
### Signer A — Operations
Routine operational approvals. No independent unilateral authority.

### Signer B — Security
Reviews destination, amount, transaction intent and security implications.

### Signer C — Recovery / Oversight
Acts as continuity signer and participates in high-risk or recovery actions.

No single signer may control two production signer keys.

## Key handling rules
- Never store seed phrases, private keys or wallet JSON in GitHub, Railway variables, browser local storage, analytics, chat, screenshots or shared cloud notes.
- Recovery material is kept offline and physically separated.
- Signer devices use device encryption, strong local authentication and current OS security updates.
- Privileged GitHub, registrar, hosting and social accounts use MFA; phishing-resistant MFA is preferred where available.
- Keys are never copied into scripts merely for convenience.
- Public keys may be documented; secret material may not.

## Transaction approval standard
Before signing a treasury transaction, reviewers must verify:
1. purpose;
2. destination address;
3. token mint;
4. amount and decimals;
5. network/cluster;
6. expected fee;
7. whether the transaction changes authority or custody;
8. whether the action matches an approved governance record.

High-risk actions require an evidence record:
- signer/member change;
- threshold change;
- authority transfer;
- liquidity removal;
- treasury transfer above an approved operating limit;
- emergency recovery.

## Treasury exposure policy
- Keep only operationally necessary SOL in any hot payer.
- Long-lived treasury assets remain in multisig custody.
- Mainnet launch payer and treasury are separate responsibilities.
- Launch payer is not treated as the treasury.
- No treasury funds are used to create artificial volume or circular trading.

## Rotation and signer replacement
A signer must be replaced when:
- a device is lost;
- secret material may have been exposed;
- the signer leaves the project;
- abnormal signing activity is observed;
- recovery material cannot be verified.

Replacement process:
1. declare the signer at risk;
2. suspend discretionary treasury actions;
3. verify remaining clean signers;
4. create and verify the replacement wallet;
5. execute multisig membership update;
6. verify the new member set and threshold;
7. document transaction signature and timestamp;
8. invalidate/resecure affected recovery material.

## Emergency rules
If compromise is suspected:
- stop non-essential treasury activity;
- do not lower threshold to "move faster";
- rotate affected signer(s);
- revoke active sessions on privileged platforms;
- verify canonical registry and official communications;
- follow the Incident Response Runbook.

## Mainnet activation gate
This policy is considered **ACTIVE** only after:
- the production multisig exists;
- signer public keys are verified;
- threshold is verified;
- recovery test is completed;
- treasury Vault address is published in the canonical registry;
- no secret material has been committed to the repository.

Until then, treasury status is **PREPARED / NOT ACTIVE**.
