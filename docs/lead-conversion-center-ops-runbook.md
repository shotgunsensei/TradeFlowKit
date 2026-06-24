# Lead Conversion Center Operations Runbook

Use this runbook for daily support, incident response, and rollback of the Lead Conversion Center.

## Daily operational checks

1. Sign in to the correct contractor org.
2. Open `/api/leads/health` while authenticated and confirm the lead tables are reachable.
3. Review the current mode: demo, dry-run, live, or needs attention.
4. Check new leads, hot leads, overdue follow-ups, and failed message attempts.
5. Confirm the last lead received time matches expected website and phone activity.
6. Confirm the follow-up worker is started and has completed a recent run.
7. Review Twilio or SendGrid logs only when the org is intentionally live.

The health response is org-scoped and returns booleans, counts, timestamps, blockers, and warnings. It does not return credentials.

## Common issues

### Leads are not arriving

- Confirm the public form is enabled.
- Confirm the Lead Conversion Center entitlement is active.
- Confirm the website is using the current public token.
- Check recent lead source events.
- Confirm the request is JSON and smaller than 64 KB.
- Check whether the public endpoint is returning `404`, `400`, `413`, or `429`.

### Follow-ups are overdue

- Check `/api/leads/health` for worker status and pending follow-up count.
- Confirm follow-up is enabled in Lead Settings.
- Confirm the lead is not converted, lost, or spam.
- Review failed follow-up tasks and lead activities.
- Restart the application process if the worker is not started.

### Messages are blocked

- Confirm the org is intentionally in live mode.
- Confirm the channel is enabled.
- Confirm the provider and from address/number are configured.
- Confirm SMS consent exists before sending SMS.
- Confirm templates and SMS opt-out wording are present.
- Review duplicate-attempt protection before retrying immediately.

### Provider outage

1. Turn dry-run on for the affected org.
2. Disable the affected channel.
3. Leave lead capture enabled if staff can follow up manually.
4. Review provider status pages and account logs.
5. Record affected leads and failed attempts.
6. Send a staff-owned test message before restoring live mode.

## Immediate dry-run rollback

1. Open `/leads`.
2. Open Lead Settings as an owner or admin.
3. Turn dry-run on.
4. Disable SMS and email if a full stop is required.
5. Confirm `/api/leads/health` reports dry-run mode.
6. Review recent live message activity and provider logs.

## Disable public intake

- Disable each public capture form.
- Remove or pause the website form embed.
- Disable calls from external source tools.
- Confirm the public endpoint returns a generic not-found response.

Disabling intake does not delete existing leads.

## Disable lead sources

- Disable the associated capture form/token.
- Remove the endpoint from the external source.
- Review recent source events for malformed or abusive traffic.
- Rotate the public token only through a future supported token-rotation procedure; do not edit tokens directly in production.

## Confirm no outbound queue

Lead follow-ups use database tasks processed by the reminder worker.

- Turn dry-run on.
- Turn follow-up off if processing must stop.
- Check the health endpoint pending follow-up count.
- Review pending and failed tasks on affected leads.
- Review recent lead message activities.
- Confirm Twilio and SendGrid logs show no unexpected sends.

## Backup and restore notes

- Back up the PostgreSQL database before schema pushes or material production changes.
- Use the database provider's managed snapshot or point-in-time recovery feature.
- Verify backup retention and restore access before launch.
- Restore into a separate recovery database first when possible.
- After restore, keep dry-run on until tenant settings, forms, tasks, and activities are verified.
- Never restore production data into a public development environment.

## Escalation checklist

- Contractor org and affected user
- Incident start time and timezone
- Current mode and enabled channels
- Health endpoint output with secrets removed
- Affected lead IDs
- Failed activity/task IDs
- Provider incident or message IDs when safe
- Last successful lead capture and follow-up times
- Rollback actions already taken
- Required business owner decision

