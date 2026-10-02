# COHIBA Treasury Multisig Activation Checklist v1.0

## Status
**PREPARED — NOT ACTIVATED**

This checklist prepares treasury infrastructure. It does not create a wallet, request private keys or authorize Mainnet.

## Target architecture
- Solana multisig
- threshold: 2-of-3
- three independently controlled signer wallets
- Vault address published only after creation/verification
- launch payer separate from treasury custody

## Pre-creation requirements
- [ ] Signer A assigned — Operations
- [ ] Signer B assigned — Security
- [ ] Signer C assigned — Recovery/Oversight
- [ ] No person controls more than one signer key
- [ ] At least two signers use hardware/cold-wallet protection where practical
- [ ] Offline recovery procedure documented
- [ ] Signer devices use encryption and strong authentication
- [ ] Public keys verified out-of-band

## Creation verification
After the multisig is created, record only public information:
- provider/program:
- multisig address:
- Vault address:
- member public keys:
- threshold:
- creation transaction:
- timestamp:
- independent explorer verification:

Never record seed phrases/private keys in this repository.

## Functional test
Before holding material assets:
- [ ] receive minimal test SOL
- [ ] create a low-value 2-of-3 transfer proposal
- [ ] approve with two independent signers
- [ ] execute
- [ ] verify destination
- [ ] test signer-replacement procedure on a non-production/test setup where practical
- [ ] verify one signer alone cannot execute

## Activation gate
Treasury may change from `NOT_ACTIVATED` to `ACTIVE` only after:
1. multisig exists;
2. 2-of-3 threshold verified;
3. public member keys verified;
4. Vault address verified;
5. low-value transaction test passes;
6. recovery procedure documented;
7. canonical registry is updated with public identifiers;
8. no secret material has entered source control.

## Mainnet separation
Treasury activation does not authorize token launch.
Mainnet still requires all independent audit, legal, release and owner-approval gates.
