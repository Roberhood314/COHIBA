# Human Proof — Multi-signal person verification

## Goal
Increase confidence that one Human Signal profile is controlled by a real person using multiple independent proofs.

This system deliberately does **not** claim global one-person-one-account uniqueness. Phone numbers, Google accounts and Facebook accounts can be shared, recycled, duplicated or compromised. The product therefore exposes a confidence tier rather than a binary legal identity claim.

## Factors
1. Solana wallet signature — possession proof.
2. Phone OTP — possession of an E.164 phone number.
3. Google identity — OAuth/OpenID Connect account control.
4. Facebook identity — OAuth account control.
5. Anti-bot challenge — optional independent challenge signal.

## Privacy
Raw phone numbers and external provider user IDs should not be persisted in the Human Signal profile. The server stores HMAC-SHA256 identifiers using a private `HUMAN_IDENTITY_PEPPER`.

Public APIs expose only verification status and timestamps, never phone/email/provider subject identifiers.

## Confidence model
- Wallet: 15
- Phone OTP: 30
- Google: 25
- Facebook: 20
- Anti-bot: 10

`HUMAN_VERIFIED` requires:
- total score >= 70;
- verified phone;
- at least one verified Google or Facebook account.

This tier is a Sybil-resistance signal, not a government-ID KYC result.

## Phone OTP
Production provider: Infobip 2FA SMS.

Required secrets:
- `INFOBIP_API_KEY`
- `INFOBIP_BASE_URL`

The backend bootstraps and persists its Infobip 2FA application/message identifiers when they are not supplied explicitly. Consent/opt-in is required before sending SMS. Server-side abuse protection limits OTP starts and verification attempts per IP + keyed phone identity, in addition to Infobip's provider-side limits.

## Google
Use OAuth 2.0/OpenID Connect with minimum scopes:
`openid email profile`

Required:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- exact authorized redirect URI:
  `https://cohibameme.site/api/human-proof/google/callback`

The implementation stores the Google subject only as a keyed hash.

## Facebook
Use Facebook Login / OAuth. Required:
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_GRAPH_VERSION` configured explicitly from the app's supported Meta Graph API version
- redirect URI:
  `https://cohibameme.site/api/human-proof/facebook/callback`

Do not scrape Facebook profiles and do not ask for passwords.

## Mining policy
Human verification may become an eligibility gate or modest anti-Sybil modifier for Signal Mining, but must not automatically issue COH or promise financial value.


## Recovery and relink policy
- A provider proof is not silently transferred between profiles.
- Re-verification of the same factor must pass the provider challenge again.
- Phone replacement requires a fresh OTP to the replacement number before the new keyed identity replaces the old proof.
- Google/Facebook relink requires a fresh OAuth state and callback; stale OAuth states are rejected.
- Public APIs must never reveal raw phone, email, provider subject IDs, API keys or OAuth secrets.
- Administrative proof changes require an auditable server-side event; client-side flags are never authoritative.

## Abuse controls
- General API rate limiting applies to all API requests.
- Phone OTP has an additional dedicated limiter.
- Infobip application policy limits PIN attempts and send frequency.
- Invalid verification context fails closed.
- Human Proof enforcement for Signal Mining remains disabled until real phone OTP and at least one OAuth provider pass production E2E testing.
