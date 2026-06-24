# Lead Conversion Center Production Environment

Configure production values in Replit Secrets or the deployment platform's server-side secret store. Never place secret values in browser code, screenshots, repository files, or support tickets.

## Required application variables

| Variable | Purpose | Safe default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Drizzle, sessions, leads, and follow-up tasks | None; required |
| `SESSION_SECRET` | Signs Express sessions and protects internal authenticated flows | None in production; use a strong random value |
| `NODE_ENV` | Enables production cookies, logging, and static serving | `production` |
| `REPLIT_DOMAINS` | Public deployment hostname used for links and managed webhooks | Deployment hostname |

The deployed database must receive the current Drizzle schema with `npm run db:push` before production traffic is enabled.

## Lead messaging variables

### SMS

Use either the Replit Twilio connector or all required direct environment variables:

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio server credential |
| `TWILIO_PHONE_NUMBER` | Approved outbound/from phone |

SMS remains blocked unless the org is live, SMS is enabled, the provider and from phone are ready, the lead has a valid phone and SMS consent, and a template is present.

### Email

| Variable | Purpose |
| --- | --- |
| `SENDGRID_API_KEY` | SendGrid server credential |
| `SENDGRID_FROM_EMAIL` | Verified outbound sender |

Email remains blocked unless the org is live, email is enabled, both values are configured, the lead has a valid email, and subject/body templates are present.

### AI

| Variable | Purpose | Behavior when missing |
| --- | --- | --- |
| `OPENAI_API_KEY` | Call Recovery AI conversation completion | Uses the existing fallback conversation logic |

## OperatorOS and application variables

These are required when the deployment uses OperatorOS SSO and entitlement management:

- `MODULE_SSO_SECRET`
- `OPERATOROS_BASE_URL`
- `OPERATOROS_API_URL` when different from the base URL
- `OPERATOROS_SSO_AUDIENCE`
- `OPERATOROS_SSO_ENV`
- `OPERATOROS_SERVICE_TOKEN` when used by the configured sync flow

Stripe and Stripe Connect variables remain application-level requirements but are not changed by the Lead Conversion Center. Preserve the existing Replit Stripe connector and any configured `STRIPE_CLIENT_ID` or `PLATFORM_FEE_PERCENT`.

## Optional operational variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Express listening port | `5000` |
| `LOG_LEVEL` | Pino log verbosity | `info` in production |
| `SOFT_DELETE_RETENTION_DAYS` | Soft-delete retention | `30` |

## Safe defaults

- New lead settings default to dry-run.
- SMS and email default to disabled.
- Public intake requires an enabled token-scoped form and active module entitlement.
- Public intake is rate-limited and limited to 64 KB JSON payloads.
- Live mode requires owner/admin access, production readiness, and the confirmation phrase.
- Provider status APIs return booleans and mode labels only.

## Environment differences

### Local development

- Use a dedicated development PostgreSQL database.
- Keep dry-run on.
- Provider credentials are optional.
- Do not reuse production public form tokens.

### Automated tests

- Use a disposable test PostgreSQL database through `DATABASE_URL`.
- Mock Twilio and SendGrid.
- Never use production provider credentials.
- DB-backed tests skip when `DATABASE_URL` is absent.

### Production

- Use managed PostgreSQL backups and point-in-time recovery when available.
- Set `SESSION_SECRET`; the development fallback is not acceptable.
- Use verified Twilio and SendGrid sender identities.
- Complete the production readiness checklist before disabling dry-run.
- Restrict Replit Secret access to production administrators.

## Production verification

Run in the Replit shell without printing secret values:

```bash
npm run check
npm run build
npx vitest run tests/lead-scoring.test.ts
npx vitest run tests/leads-routes.test.ts
npm test
```

Then open `/api/leads/health` as an authenticated org user and verify the selected org's status.

