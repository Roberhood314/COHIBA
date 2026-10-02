# COHIBA Multisig Activation Packet v1.0

## Status
**READY FOR EXECUTION — REQUIRES REAL SIGNERS**

The technical/policy work is complete enough to activate treasury once three independently controlled public signer wallets are supplied.

## Fixed activation target
- network: Solana Mainnet
- custody: multisig vault
- threshold: 2-of-3
- signer roles: Operations / Security / Recovery-Oversight
- launch payer: separate from treasury
- production secret material: never stored in GitHub, Railway chat, screenshots or public documents

## Inputs still required from humans
- Signer A public key
- Signer B public key
- Signer C public key
- chosen reviewed multisig provider/program
- out-of-band verification that each signer is independently controlled

## Execution evidence required
Record only public identifiers:
- multisig address;
- vault address;
- three member public keys;
- threshold;
- creation transaction;
- low-value 2-of-3 test transaction;
- proof that 1 signer alone cannot execute;
- recovery/replacement test record.

## Completion rule
Until those real public identifiers and tests exist:
**TREASURY MULTISIG = PREPARED / NOT ACTIVATED**

No placeholder wallet may be used to claim completion.
