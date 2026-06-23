# Lead Conversion Center Client Deployment

## Deployment overview

This package is for deploying TradeFlowKit Lead Conversion Center for a real contractor org. The goal is to move from discovery to dry-run validation, then to safe production activation only when the client is ready.

The deployment should prove four things:

- Leads can enter TradeFlowKit from the right sources.
- Staff know which leads need attention first.
- Follow-ups are visible before leads go cold.
- Qualified leads convert into customers and jobs.

## Who this deployment is for

Use this process for trade and field-service contractors that need a practical lead-to-job workflow, including HVAC, electrical, plumbing, roofing, landscaping, general contractors, and IT field service teams.

This is not a CRM replacement project. TradeFlowKit remains the operational lead-to-cash system for the contractor workflow.

## Required client access

- TradeFlowKit org/admin access.
- Website admin or DNS/contact-form access if a public form will be embedded.
- Twilio access if live SMS will be used.
- SendGrid access if live email will be used.
- Access to current lead source tools or inboxes.
- A staff-owned phone and email for test messages.

## Required business information

- Business name.
- Service area.
- Primary office phone.
- Primary office email.
- Owner or office manager contact.
- Trade vertical.
- High-value services.
- Emergency service availability.
- After-hours handling process.
- Who owns hot lead follow-up.

## Trade/template selection

1. Choose the closest trade template.
2. Confirm service labels match the client language.
3. Review high-urgency and high-value keywords.
4. Confirm the hot lead threshold.
5. Keep dry-run enabled while reviewing.

## Lead source inventory

Document every current lead source:

- Website contact form.
- Click-to-call phone number.
- Missed calls.
- Manual office entry.
- Email inbox.
- Referral sources.
- Facebook lead forms, if used.
- Google Ads or Local Services, if used.
- Third-party form tools.

Only connect sources that can be validated safely.

## Website/contact form setup

1. Confirm the public lead capture form is enabled.
2. Copy the public form endpoint or embed snippet.
3. Add SMS consent language if SMS follow-up is desired.
4. Submit a staff-owned test lead.
5. Confirm the lead appears in `/leads`.
6. Confirm source, service type, score, and follow-up status.

## SMS/email provider requirements

Live SMS requires:

- Twilio configured.
- From phone configured.
- SMS channel enabled.
- Lead SMS consent.
- SMS opt-out wording.
- Successful explicit test SMS.

Live email requires:

- SendGrid configured.
- From email configured.
- Email channel enabled.
- Subject and body reviewed.
- Successful explicit test email.

## Dry-run validation plan

Dry-run should remain on until the client has seen:

- A test lead captured.
- Lead score and urgency.
- Hot lead dashboard section.
- Follow-up due/overdue behavior.
- Prepared SMS/email activity.
- Conversion to customer/job.
- Production readiness checklist.

## Test lead procedure

1. Create or submit a test lead using staff-owned contact info.
2. Set a realistic service type and urgency.
3. Confirm it appears in the pipeline.
4. Re-score the lead.
5. Prepare dry-run SMS and email.
6. Create or verify follow-up tasks.
7. Convert the lead to customer/job in a test-safe context.

## Go-live plan

1. Review the Go Live Checklist.
2. Resolve all blockers.
3. Send provider test messages.
4. Confirm opt-out copy and templates.
5. Choose a low-risk launch window.
6. Identify the rollback owner.
7. Type `ENABLE LIVE LEADS` only when ready.
8. Monitor the first live leads closely.

## Rollback plan

- Turn dry-run back on.
- Disable SMS and/or email.
- Disable public forms if bad traffic is entering.
- Disable follow-up sequence if timing is wrong.
- Review recent activities.
- Check Twilio and SendGrid logs.
- Correct templates before reactivation.

## Client handoff checklist

- Show how to open `/leads`.
- Explain hot leads.
- Explain follow-ups due today.
- Explain prepared vs sent messages.
- Show manual lead creation.
- Show lead detail.
- Show conversion to customer/job.
- Show lost/spam handling.
- Confirm support contact.

## First-week monitoring checklist

- New leads captured.
- Hot leads reviewed.
- Overdue follow-ups.
- Failed message attempts.
- Converted leads.
- Public form/source activity.
- Dry-run vs live message status.
- Client feedback.
- Template/scoring adjustments.

## Monthly review checklist

- Lead volume by source.
- Hot lead quality.
- Response timing.
- Follow-up completion.
- Conversion count.
- Failed/blocked message reasons.
- Template improvements.
- New service keywords.
- Client staffing/process changes.
