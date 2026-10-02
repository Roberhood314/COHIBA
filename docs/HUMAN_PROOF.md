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
Production provider: Twilio Verify (or a compatible provider).
Required secrets:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Twilio's official Verify flow sends an OTP and then checks the submitted code. Consent/opt-in must be obtained before sending SMS.

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
