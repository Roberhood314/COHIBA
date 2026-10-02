# Human Verification Provider Activation

Human Verification is production-safe only when provider credentials are issued by the user's own provider accounts and stored as Railway secrets.

## Internal secrets
Configured on production:
- HUMAN_IDENTITY_PEPPER
- HUMAN_SIGNAL_REVIEW_KEY

Do not expose either value in logs, client JavaScript, screenshots or documentation.

## Infobip 2FA SMS
Production phone verification uses Infobip first.

Required:
- INFOBIP_API_KEY
- INFOBIP_BASE_URL

Optional overrides:
- INFOBIP_2FA_APPLICATION_ID
- INFOBIP_2FA_MESSAGE_ID
- INFOBIP_SENDER_ID

Current production behavior:
1. On startup, if INFOBIP_API_KEY and INFOBIP_BASE_URL are configured, the backend bootstraps a dedicated 2FA application and message template when IDs are not already persisted.
2. The generated application/message identifiers are stored on the persistent Railway volume under /data and are not exposed through public APIs.
3. OTP send stores only the pending provider context and Infobip pinId needed for verification.
4. OTP check verifies the submitted PIN against Infobip and then records phone proof status.
5. Twilio remains a legacy fallback only when Infobip is not configured.

Acceptance for phone verification requires the production log marker:
COHIBA_INFOBIP_BOOTSTRAP_READY

and a real consenting end-to-end OTP send/check test before enforcement is enabled.

## Google OAuth
Required:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET

Authorized redirect URI:
https://cohibameme.site/api/human-proof/google/callback

Authorized origin:
https://cohibameme.site

After storing credentials in Railway, /api/human-proof/readiness must report providers.google=true.

## Facebook Login
Required:
- FACEBOOK_APP_ID
- FACEBOOK_APP_SECRET
- FACEBOOK_GRAPH_VERSION

OAuth redirect URI:
https://cohibameme.site/api/human-proof/facebook/callback

After storing credentials, /api/human-proof/readiness must report providers.facebook=true.

## Enforcement
Keep ENFORCE_HUMAN_PROOF_FOR_MINING=false until all providers are live-tested successfully and the migration policy for existing Pioneer accounts is announced.

Only then consider ENFORCE_HUMAN_PROOF_FOR_MINING=true.

## Acceptance criteria
Full Human Verification is ready only when:
- all three provider readiness flags are true;
- identity pepper and review key readiness are true;
- OTP send/check passes;
- Google OAuth callback passes;
- Facebook OAuth callback passes;
- public APIs expose no raw phone/email/provider subject IDs;
- account recovery and provider unlink/relink rules are documented;
- abuse/rate limits are tested;
- mining remains fail-closed on invalid sessions.