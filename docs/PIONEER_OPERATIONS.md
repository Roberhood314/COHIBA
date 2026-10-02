# COHIBA Pioneer Operations Guide

## What a Pioneer needs
A Pioneer should be able to complete the entire pre-Mainnet participation journey from the public website:

1. Open Human Signal.
2. Verify a Solana wallet.
3. See Pioneer status and mining readiness.
4. Activate Daily Signal.
5. Complete Human Proof when providers are available.
6. Start one 24-hour Signal Mining session.
7. See exact SP/hour and every rate component.
8. Claim Signal Points.
9. Add legitimate trust connections.
10. Complete missions.
11. Apply or share a referral code.
12. Submit evidence-backed contributions.
13. Use utility apps and gain utility input.
14. Verify public Core state/evidence.

## Required UX support
- Mobile-first layout.
- One clear primary action at a time.
- Explain why buttons are disabled.
- Show provider readiness rather than generic errors.
- Show session end time in local-friendly ISO data.
- Show claimable SP and total SP.
- Show Pioneer cohort status.
- Show referral policy and anti-Sybil rule.
- Show SP is not COH and has no promised conversion.
- Link to Core state, open review and security evidence.

## Support states
### READY
Wallet verification and mining API available.

### LIMITED
External Human Proof providers not yet configured. Mining remains in grace mode.

### VERIFIED NETWORK
Phone/social verification, review key and Devnet anchoring operational; production can consider announced migration to enforced Human Proof.

## External activation checklist
Before switching mining from grace to enforced:
- HUMAN_IDENTITY_PEPPER configured.
- Twilio Verify production service configured and consent text reviewed.
- Google OAuth app configured with exact production redirect.
- Facebook Login app configured with exact production redirect.
- Human Signal review key configured.
- Abuse/rate-limit review completed.
- Privacy policy updated with identity providers and retention.
- End-to-end test with at least two independent test users.
- Public notice of enforcement date.
- Rollback path tested.

## Pioneer safety
Never ask users for:
- seed phrases;
- private keys;
- Gmail/Facebook passwords;
- OTPs outside the official verification field;
- payment to unlock Signal Mining.

Human Signal signatures must remain human-readable and must not authorize transactions.

## Operational metrics
Track aggregate:
- wallet-verified profiles;
- Human Proof tier distribution;
- active mining sessions;
- Daily Signal activation;
- 7-day streak completion;
- verified contribution rate;
- trust-edge growth;
- verified referral conversion;
- utility actions by app;
- support/error rate.

Do not publish raw PII or claim unique-human counts beyond the evidence supported by Human Proof.
