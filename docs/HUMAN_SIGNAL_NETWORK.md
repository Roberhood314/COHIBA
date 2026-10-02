# Human Signal Network — Pi-inspired architecture

COHIBA studies successful network-design patterns without copying another project's chain or branding.

Pi Network's public design uses differentiated roles, recurring participation, a social trust graph, app utility and staged network growth. COHIBA adapts those ideas to a Solana application layer rather than creating a new L1.

## Mapping

| Pi pattern | COHIBA Human Signal adaptation |
|---|---|
| Pioneer | SIGNALER — verified wallet participant |
| Contributor / Security Circle | CONNECTOR — capped trust attestations |
| Ambassador | future COMMUNITY BUILDER / referral attribution |
| Node | future independent verifier/indexer, not claimed in MVP |
| daily mining session | daily Human Signal session / streak, **no COH emission** |
| mining reward | non-financial reputation score pre-Mainnet |
| KYC / identity gating | wallet-signature identity first; stronger identity optional later |
| app usage reward | future utility/app participation score |
| trust graph feeds consensus | trust graph feeds reputation/community discovery only; **not Solana consensus** |
| phased Beta/Testnet/Mainnet | COHIBA MVP → Devnet proof anchoring → reviewed production release |

## v0.2 identity layer
A user proves control of a Solana wallet by signing a human-readable challenge. The challenge explicitly states that it authorizes no transaction or token transfer.

Successful verification creates a pseudonymous Human Signal profile:
- deterministic profile ID;
- wallet ownership verified;
- daily activity state;
- trust connections capped at five;
- derived roles;
- reputation/trust score.

## Trust graph
A verified profile may attest to up to five other verified profiles. This mirrors the useful *social trust graph* idea without pretending those edges secure Solana consensus.

Trust edges:
- are opt-in;
- do not transfer assets;
- do not create token entitlement;
- can be removed later;
- contribute only to Human Signal discovery/reputation.

## Daily session
A verified profile can activate once per UTC day. The session tracks:
- active days;
- current streak;
- last active day.

It does **not** mint COH or promise future COH.

## Roles
- SIGNALER: wallet verified.
- CONTRIBUTOR: at least one verified contribution.
- BUILDER: verified CODE or SECURITY contribution.
- CONNECTOR: at least three trust attestations.
- VERIFIER: later role for approved contribution reviewers.

## Independence boundary
Human Signal remains an application protocol on Solana. Solana provides settlement and wallet cryptography. COHIBA supplies the contribution registry, proof model, trust graph, reputation and application UX.
