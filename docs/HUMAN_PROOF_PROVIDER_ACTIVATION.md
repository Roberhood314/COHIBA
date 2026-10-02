# Human Verification Provider Activation

Human Verification is production-safe only when provider credentials are issued by the user's own provider accounts and stored as Railway secrets.

## Internal secrets
Configured on production:
- HUMAN_IDENTITY_PEPPER
- HUMAN_SIGNAL_REVIEW_KEY

Do not expose either value in logs, client JavaScript, screenshots or documentation.

## Twilio Verify
Required:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_VERIFY_SERVICE_SID

Flow:
1. Create/choose a Twilio Verify Service.
2. Enable SMS channel for the target countries.
3. Set the three variables above in Railway.
4. Verify /api/human-proof/readiness reports providers.phone=true.
5. Test send/check using a real consenting phone number.

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