# COHIBA Human Signal Core (HSC)

## Thesis

COHIBA does not need to clone Pi's blockchain to learn from Pi's architecture.

Pi's strongest architectural pattern is layered:
1. human onboarding and recurring participation;
2. trust graph / Security Circles;
3. differentiated network roles;
4. identity/KYC before stronger network privileges;
5. Browser + SDK + Developer Platform;
6. utility applications;
7. staged Beta → Testnet → Mainnet / enclosed → open growth.

COHIBA adapts this pattern into a Solana-native application protocol.

## COHIBA Core

**Solana = settlement / public anchoring layer.**

**Human Signal Core = COHIBA's proprietary coordination layer.**

HSC owns:
- Human Proof identity confidence;
- trust graph;
- contribution proof registry;
- reputation;
- Signal Mining policy;
- developer app registry;
- app utility events;
- network roles;
- append-only core event ledger;
- deterministic state roots;
- future Solana anchoring.

## Architecture

```
Web / Mobile PWA
      |
Human Proof Gateway
      |
Human Signal Identity
      |
Trust Graph -------- Contribution Registry
      |                    |
Signal Mining         Reputation Engine
      \                    /
       Human Signal Core
        |      |      |
   Event Log  Apps  Utility Index
        |
   State Root / Merkle Root
        |
   Solana Devnet Anchor
        |
   Reviewed Production Anchor
```

## Core Ledger

Every security-sensitive state change emits a core event.

Each event contains the previous event hash, creating a tamper-evident append-only hash chain.

Examples:
- PROFILE_VERIFIED
- DAILY_SIGNAL
- TRUST_EDGE_ADDED
- CONTRIBUTION_VERIFIED
- APP_REGISTERED
- MINING_CLAIMED

HSC also creates a deterministic state root covering profiles, contributions, apps and the event Merkle root.

This is not a new blockchain. It is a verifiable application-state ledger whose roots can be anchored to Solana.

## Developer ecosystem

Inspired by the useful Pi Browser / Developer Platform pattern, COHIBA will expose:
- App Registry;
- Human Signal identity API;
- Proof API;
- Reputation API;
- utility-event API;
- future payment/COH API only after Mainnet/legal approval.

Apps begin as CANDIDATE and must accumulate real utility evidence before VERIFIED/ACTIVE status.

## Network phases

### HSC Alpha
Central COHIBA service, public source, deterministic evidence.

### HSC Devnet
State roots anchored to Solana Devnet; developer apps integrate Human Signal APIs.

### HSC Verified Network
External security review, identity controls, app verification and operational evidence.

### HSC Open Utility
After legal/security/Mainnet gates: public integrations, COH utility and third-party ecosystem.

No document or HSC phase bypasses the explicit COH Mainnet owner approval gate.
