# Lead Conversion Center Onboarding

## Required Client Info

Collect these before setup:

- Business name
- Main phone number
- Main email
- Service area
- Website URL
- Primary trade
- Primary services
- Preferred lead contact method
- Office hours
- Emergency service availability
- Existing lead sources
- Current form/contact page URL
- Messaging compliance preference and approved wording

## Trade Selection

Choose the closest trade template:

- HVAC
- Electrical
- Plumbing
- Roofing
- Landscaping
- General Contractor
- IT Field Service

Confirm:

- Top service categories
- Emergency keywords
- High-value service keywords
- Qualification questions
- Proposal starter notes

## Business And Service Area

Confirm the business details visible to staff and customers:

- Organization name
- Phone
- Email
- Address or market area
- Service radius or covered cities/counties
- Business hours

## Lead Sources

Document every source the business wants to track:

- Website form
- Missed calls
- Manual entry
- Referral
- Google Business Profile form or message
- Facebook/Instagram message
- Trade marketplace
- Generic webhook/source link
- n8n/Zapier/Make source posting to the generic endpoint

Do not make external platforms the source of truth. External submissions should normalize into TradeFlowKit leads.

## Public Form Setup

Configure:

- Form name
- Source label
- Default service type
- Success message
- Enabled status

Copy and test:

- Public form endpoint
- Embed snippet
- Example request
- Safe public success message

Public endpoints must not expose org IDs, customer data, user data, or secrets.

## Messaging Provider Requirements

SMS live mode requires:

- Dry-run off
- SMS enabled
- Twilio configured
- From phone configured
- Valid lead phone
- SMS consent
- SMS template
- Opt-out wording

Email live mode requires:

- Dry-run off
- Email enabled
- SendGrid configured
- From email configured
- Valid lead email
- Email subject
- Email body

OpenAI is optional for fallback behavior but recommended for full Call Recovery AI quality.

## Dry-Run Verification

Before live activation:

- Create a manual test lead.
- Confirm the lead appears in `/leads`.
- Confirm scoring runs.
- Confirm follow-up tasks are scheduled when enabled.
- Prepare a dry-run SMS.
- Prepare a dry-run email.
- Confirm both appear in the lead activity timeline.
- Confirm no real SMS/email was sent.

## Live Activation Safety

Only activate live messaging after:

- Provider readiness is confirmed.
- Templates are approved by the business owner.
- SMS opt-out wording is present.
- SMS consent collection is understood.
- A test SMS/email destination is explicitly entered.
- Test message confirmation is accepted.
- Activity logs show safe provider results.

Never enable live outbound communication by default.

## First-Week Monitoring

Daily for week one:

- Check Hot Leads.
- Check Needs Contact.
- Check Follow Up Today.
- Check Overdue Follow-ups.
- Review failed or blocked message attempts.
- Confirm lead source events are expected.
- Confirm converted leads create the right customer/job records.
- Review whether scoring threshold needs adjustment.

## Handoff Checklist

- [ ] Trade template selected
- [ ] Business/service area confirmed
- [ ] Lead capture form configured
- [ ] Public link or embed copied
- [ ] First lead source connected or labeled
- [ ] SMS/email templates reviewed
- [ ] Follow-up sequence enabled or intentionally disabled
- [ ] Dry-run mode explained
- [ ] Live activation requirements explained
- [ ] First lead created or captured
- [ ] First conversion demonstrated
- [ ] Owner/admin knows where to find Hot Leads, Follow Up Today, and Needs Attention
