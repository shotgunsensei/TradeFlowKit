# Lead Conversion Center Testing

This guide documents how to test and demo the TradeFlowKit Lead Conversion Center without enabling real outbound SMS or email.

## Required environment

DB-backed tests require PostgreSQL and these environment variables:

```bash
DATABASE_URL=postgres://tradeflow_user:tradeflow_password@localhost:5432/tradeflowkit_dev
SESSION_SECRET=replace-with-a-local-dev-secret-at-least-32-chars
NODE_ENV=development
```

Use placeholder values only in docs and examples. Do not commit real database credentials or provider secrets.

Optional provider variables can remain unset for Lead Conversion Center dry-run testing:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
OPENAI_API_KEY=
```

When these are missing, provider status should show not configured or fallback mode, and the Lead Center should still load.

## Create a local Postgres database

Example local setup:

```bash
createdb tradeflowkit_dev
```

Or with Docker:

```bash
docker run --name tradeflowkit-postgres -e POSTGRES_PASSWORD=tradeflow_password -e POSTGRES_USER=tradeflow_user -e POSTGRES_DB=tradeflowkit_dev -p 5432:5432 -d postgres:16
```

Then push the Drizzle schema:

```bash
npm run db:push
```

## Seed demo lead data

The demo seed script is blocked in production and requires an explicit org id:

```bash
npm run seed:lead-demo -- --org-id=<org_id>
```

Optionally associate created demo activities with a user:

```bash
npm run seed:lead-demo -- --org-id=<org_id> --user-id=<user_id>
```

The script seeds one org only and marks rows with `metadata.demoLeadSeed=true` plus a stable `metadata.demoScenario`. Re-running the script skips existing demo scenarios instead of creating duplicates.

Demo scenarios include:

- Emergency HVAC no cooling, high-score hot lead
- Commercial electrical panel upgrade
- Plumbing leak with overdue follow-up tasks
- Roofing estimate warm lead
- Landscaping quote normal lead
- Missed-call recovery lead
- Converted water heater lead linked to a customer and job

## Run lead-related tests

Run the non-DB scoring tests:

```bash
npx vitest run tests/lead-scoring.test.ts
```

Run DB-backed lead route tests after `DATABASE_URL` and schema are ready:

```bash
npx vitest run tests/leads-routes.test.ts
```

Run existing DB-backed lead storage tests:

```bash
npx vitest run tests/leads-storage.test.ts
```

Run the full suite:

```bash
npm test
```

If `DATABASE_URL` is not set, the existing DB-backed suites fail at import time with `DATABASE_URL must be set`. That is an environment readiness failure, not a Lead Conversion Center code failure.

## Run browser smoke coverage

The repo already uses Playwright under `e2e/`. Start the app with a configured database, then run:

```bash
npm run test:e2e -- e2e/leads-smoke.spec.ts
```

The smoke test covers:

- Dashboard Lead Conversion widget
- Navigation to `/leads`
- New Lead dialog
- Manual lead creation
- Lead detail rendering
- Score/SLA/pipeline visibility
- Re-score action
- Dry-run SMS and email actions
- Conversion into linked customer/job workflow

The smoke test skips when `DATABASE_URL` is not set. Playwright is configured to capture screenshots on failure under the existing Playwright output directory. The lead smoke spec also writes successful evidence screenshots to `test-results` through `testInfo.outputPath`; these are generated artifacts and should not be committed unless the repo intentionally starts storing snapshots.

## Manual smoke test for `/leads`

1. Log in.
2. Confirm an org is selected.
3. Open Dashboard.
4. Click the Lead Conversion widget.
5. Confirm `/leads` loads.
6. Create a manual lead.
7. Confirm the lead appears in the table and pipeline.
8. Open lead detail.
9. Re-score the lead.
10. Run dry-run SMS.
11. Run dry-run email.
12. Confirm both messages appear in the timeline as prepared/dry-run.
13. Add or view follow-up tasks.
14. Move the lead to contacted or qualified.
15. Convert the lead to customer/job.
16. Open the linked customer and job.
17. Confirm the dashboard Lead Conversion widget updates.

## Verify dry-run SMS/email behavior

Lead GUI message actions should call only:

- `POST /api/leads/:id/send-sms`
- `POST /api/leads/:id/send-email`

These endpoints record lead activities through `server/leadMessaging.ts`.

Expected activity markers:

- `type = "message"`
- `channel = "sms"` or `"email"`
- `direction = "outbound"`
- `status = "dry_run"`
- `metadata.dryRun = true`

No Twilio or SendGrid send method should be called by these GUI endpoints.

## Confirm no real outbound messages are sent

1. Leave Twilio and SendGrid env vars unset.
2. Open `/leads`.
3. Confirm dry-run mode is shown.
4. Trigger dry-run SMS and email.
5. Check the activity timeline for prepared messages.
6. Check server logs for absence of Twilio/SendGrid send attempts.
7. Confirm provider status does not show secret values.

Lead follow-up worker processing also uses dry-run lead activity helpers for lead follow-up tasks.
