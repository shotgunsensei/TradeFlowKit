# Lead Conversion Center Rollback Guide

Use this runbook when an org needs to stop live lead messaging or pause public intake.

## Immediate rollback

1. Open `/leads`.
2. Open Lead Settings.
3. Turn **Dry-run mode** on.
4. Save settings.
5. Confirm the mode says dry-run.

Normal lead SMS/email actions should now log prepared messages instead of sending live provider messages.

## Disable live channels

- Turn **SMS enabled** off to stop live SMS.
- Turn **Email enabled** off to stop live email.
- Keep dry-run mode on until templates and provider settings are verified again.

## Disable public intake

- Open the public capture form settings.
- Turn the form off if website traffic should stop creating leads.
- Remove or pause embedded forms on the website if needed.
- Disable or remove external lead-source endpoints from third-party tools.

## Stop follow-up scheduling

- Open Lead Settings.
- Turn **Follow-up enabled** off.
- Save settings.
- Review due follow-up tasks on active leads.

## Confirm no outbound messages are queued

- Review Lead Settings and confirm dry-run is on.
- Review due follow-ups for pending tasks.
- Check recent lead activity for `blocked`, `error`, or live message entries.
- Check Twilio and SendGrid provider logs for recent sends.

## Review recent activity

- Open recently captured leads.
- Review message activity and follow-up history.
- Confirm whether any live SMS/email was sent.
- Export or screenshot provider logs if a client incident needs documentation.

## Bad template recovery

1. Re-enable dry-run immediately.
2. Disable the affected channel.
3. Correct the SMS or email template.
4. Send a staff-owned test message.
5. Review all leads that received the bad template.
6. Decide whether a corrective manual message is appropriate.
7. Re-enable live mode only after the Go Live Checklist is clear.

## Provider-side checks

- Twilio message logs for SMS delivery.
- SendGrid activity logs for email delivery.
- Suppression, bounce, and unsubscribe lists where applicable.
- Provider account status and sender verification.

## Restore service

1. Complete the production activation checklist again.
2. Send explicit test SMS/email messages.
3. Confirm opt-out wording and templates.
4. Type `ENABLE LIVE LEADS` only when the org is ready for real lead messaging.
