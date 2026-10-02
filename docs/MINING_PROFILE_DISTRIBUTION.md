# COHIBA Mining, Profile and Mainnet Distribution Lifecycle

## Purpose

This document defines how a pre-Mainnet Human Signal profile accrues provisional mining value and how that profile can later become eligible for an on-chain COH distribution.

## 1. Profile creation

A user first proves control of a Solana wallet by signing the COHIBA Human Signal challenge.

The profile stores the public wallet address but COHIBA does not store the user's private key or recovery phrase.

## 2. COH Wallet activation

The user activates a COH Wallet record inside the Human Signal profile.

The current wallet model is non-custodial:
- owner address = the verified Solana wallet address;
- COHIBA has no signing authority over the user's wallet;
- recovery by COHIBA is impossible;
- losing the wallet's private key/recovery phrase can permanently remove access.

Before Mainnet, the wallet phase is PRE_MAINNET and no COH token account is created or funded.

## 3. Mining ledger

Each valid mining claim records two values:
- Signal Points (SP), used for participation/reputation accounting;
- Pending COH, a provisional off-chain mining ledger.

Pending COH:
- is not an SPL token;
- is not transferable;
- cannot be sold or traded;
- is not deposited into the user's wallet before Mainnet;
- does not create an unconditional legal or technical entitlement to on-chain COH;
- remains subject to Human Verification, review, final distribution policy and available community allocation.

## 4. Human Verification

A profile must reach HUMAN_VERIFIED before Mainnet eligibility can be approved.

Current confidence rule:
- verified phone ownership;
- at least one verified Google or Facebook account;
- total confidence score >= 70.

Human Verification is a Sybil-resistance confidence system, not government-ID KYC.

## 5. Mainnet review

A protected reviewer workflow records one of:
- PENDING
- APPROVED
- REJECTED

APPROVED requires:
- HUMAN_VERIFIED;
- activated COH Wallet.

A profile is MAINNET_ELIGIBLE only when all requirements are satisfied.

## 6. Post-Mainnet distribution

Mainnet eligibility does not itself transfer tokens.

Actual COH distribution is permitted only after:
- the official COH Mainnet mint exists and is verified;
- the owner explicitly authorizes Mainnet;
- the community allocation/distribution policy is published and approved;
- legal/compliance requirements are satisfied where applicable;
- the distribution gate is enabled.

Only then may an approved distribution process transfer on-chain COH to the user's Solana wallet / derived COH associated token account.

## 7. No automatic 1:1 guarantee

The mining ledger currently records Pending COH using the same accrued session amount used for SP accounting so that the project can preserve a deterministic pre-Mainnet record.

This does **not** guarantee that one Pending COH ledger unit will equal one on-chain COH at distribution time. The final distribution formula must be explicitly approved and published before any Mainnet distribution occurs.

## 8. Safety invariants

- no pre-Mainnet COH transfer;
- no Pending COH trading;
- no private key storage by COHIBA;
- no automatic Mainnet activation;
- no automatic distribution without explicit distribution policy/gates;
- no silent change of a user's destination wallet.
