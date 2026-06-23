# Lead Conversion Center Sales Readiness

## What It Does

Lead Conversion Center packages TradeFlowKit lead handling into a sellable growth module. It helps trade businesses capture website, form, manual, webhook, and missed-call leads, prioritize urgent opportunities, prepare fast replies, schedule follow-ups, and convert qualified leads into existing customers and jobs.

The module is not an external CRM and is not a workflow-engine replacement. External sources normalize into TradeFlowKit leads so TradeFlowKit remains the operational lead-to-cash system.

## Target Businesses

- HVAC contractors that need fast response on no-cooling, no-heat, replacement, and tune-up requests.
- Electrical contractors handling emergency calls, panel upgrades, EV chargers, generators, and commercial wiring.
- Plumbing companies handling leaks, clogs, fixture replacements, water heaters, and emergency dispatch.
- Roofing companies tracking storm damage, leaks, repairs, and replacement estimates.
- Landscaping teams managing maintenance, cleanup, hardscape, irrigation, and recurring service inquiries.
- General contractors qualifying remodel, repair, insurance, and project-scope requests.
- IT field service providers handling onsite dispatch, cabling, network, device, and managed-service opportunities.

## Core Outcomes

- Never lose another lead.
- Every lead gets contacted quickly.
- Fewer missed calls and ignored forms.
- Faster booked jobs.
- Less admin work.
- A clear lead-to-cash workflow from capture to customer, job, quote, invoice, and payment.

## Demo Script

1. Open `/leads` and point out the module status panel.
2. Show the setup checklist and explain that each step maps to a real setup action.
3. Open the pipeline and show how leads move from captured to contacted, qualified, follow-up, converted, or lost.
4. Open a hot demo lead and explain why it scored high, such as emergency language or high-value service type.
5. Show the activity timeline and explain that dry-run messages are logged without sending.
6. Show the public form/embed dialog and adapter endpoint.
7. Convert a qualified lead and show the created customer and job.
8. Explain that live SMS/email is blocked until provider setup, templates, consent, and org-level enablement are ready.

## Setup Checklist

- Choose a trade template.
- Add business/contact information.
- Configure the lead capture form.
- Connect at least one lead source or source label.
- Review SMS and email templates.
- Enable the follow-up sequence.
- Confirm provider readiness.
- Send a test message before live messaging.
- Review dry-run/live mode.
- Create or receive the first lead.
- Convert the first lead into a customer and job.

## Pricing Model Placeholders

Use these as packaging placeholders, not committed public pricing:

- Included in Small Business and Enterprise plans.
- OperatorOS add-on: Lead Conversion Center.
- Setup package: configure templates, source labels, public form, and demo walkthrough.
- Monthly add-on: lead capture, follow-up controls, source adapter access, and support oversight.
- Live messaging may require pass-through provider costs or a separate communications add-on.

## Live Messaging Cautions

- Default mode must remain dry-run.
- Live SMS requires org setting `dryRun=false`, `smsEnabled=true`, Twilio readiness, a from phone number, a valid recipient, SMS consent, a template, and opt-out wording.
- Live email requires org setting `dryRun=false`, `emailEnabled=true`, SendGrid readiness, a from email, a valid recipient, subject, and body.
- Test messages must be sent only to an explicitly entered destination.
- Activity logs must not expose provider secrets.

## Integration Readiness Notes

- Website form capture is available through public token endpoints.
- Generic JSON and website form adapters normalize external submissions into internal leads.
- n8n, Zapier, and Make can post to the generic adapter endpoint.
- Facebook Lead Ads, Google Lead Forms, Twilio Voice source adapters, and chat widget integrations are future provider-specific work.
- External systems should never become the source of truth.

## Limitations

- No OAuth ad-platform integration is included yet.
- No external CRM sync is included yet.
- No new checkout or payment processor logic is included in Phase 4H.
- The module status endpoint reports readiness and usage; it is not a billing meter.
- Demo data cleanup should stay documented unless a safe org-scoped cleanup endpoint is intentionally added.
