# Lead Conversion Center Production Activation

Use this checklist before moving a contractor org from demo or dry-run into live lead messaging.

## Pre-live checklist

- Confirm the correct org is selected.
- Confirm the Lead Conversion Center module is enabled for the org.
- Choose the trade template.
- Add business phone, email, address, and service area.
- Enable at least one public lead capture form.
- Connect or label at least one lead source.
- Review SMS and email templates with the contractor.
- Review follow-up timing and channels.
- Confirm dry-run activity looks correct on a test lead.

## Provider setup checklist

- Twilio is configured if live SMS will be used.
- Twilio from phone is configured and belongs to the contractor workflow.
- SendGrid is configured if live email will be used.
- SendGrid from email is configured and approved.
- OpenAI may be configured, but fallback mode is acceptable.
- No provider secrets are visible in browser responses or screenshots.

## SMS consent cautions

- Do not send SMS to leads without consent.
- Keep opt-out copy visible in the SMS template or footer.
- Use plain wording such as `Reply STOP to opt out.`
- Confirm public forms collect SMS consent before SMS follow-up.
- Do not present this checklist as legal advice or a compliance guarantee.

## Dry-run verification

1. Create a test lead.
2. Confirm the lead appears in the pipeline.
3. Confirm scoring and urgency look reasonable.
4. Trigger dry-run SMS and email from the lead detail view.
5. Confirm activities are recorded as prepared only.
6. Confirm no live provider message was sent from a normal lead action.

## Test lead procedure

1. Use a real staff-owned test phone/email.
2. Submit the public form or create the lead manually.
3. Confirm the source, service type, urgency, score, and follow-up due date.
4. Confirm the lead can convert to customer/job in a non-production test org first when possible.

## Test SMS/email procedure

1. Keep dry-run mode on.
2. Enable only the channel being tested.
3. Enter an explicit staff-owned test destination.
4. Confirm the browser prompt.
5. Verify the message arrives.
6. Check the Go Live Checklist for the passed test status.

## Go-live procedure

1. Open `/leads`.
2. Open Lead Settings.
3. Review the Go Live Checklist.
4. Resolve all blockers.
5. Turn off Dry-run mode.
6. Read the confirmation warning.
7. Type `ENABLE LIVE LEADS`.
8. Save and confirm the checklist shows Live or Ready.

## Rollback procedure

1. Open Lead Settings.
2. Turn Dry-run mode back on.
3. Save settings.
4. Disable SMS and/or email if needed.
5. Disable public forms or lead sources if bad traffic is arriving.
6. Review recent lead activities and provider logs.

## Post-launch monitoring checklist

- Review new leads daily for the first week.
- Confirm follow-ups are due at expected times.
- Check failed attempts.
- Confirm opt-out wording remains in SMS templates.
- Confirm provider logs match TradeFlowKit activity.
- Keep dry-run enabled for any new channel until that channel is tested.

## Troubleshooting

- **Live mode blocked:** Review the Go Live Checklist blocker text.
- **Test SMS blocked:** Check Twilio readiness, from phone, SMS enabled, and destination.
- **Test email blocked:** Check SendGrid readiness, from email, email enabled, subject, and body.
- **Normal lead SMS blocked:** Check lead phone, SMS consent, dry-run mode, and duplicate recent attempts.
- **Normal lead email blocked:** Check lead email, template, provider readiness, and duplicate recent attempts.
- **Bad template used:** Re-enable dry-run, correct the template, review affected activities, and check provider logs.
