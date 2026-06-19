# Lead Conversion Center Trade Templates

Trade templates make the Lead Conversion Center faster to deploy for a contractor vertical. They are code-defined defaults, not external integrations, and they keep SMS/email in dry-run mode.

## Available Templates

- HVAC
- Electrical
- Plumbing
- Roofing
- Landscaping
- General Contractor
- IT Field Service / MSP Field Service

## What A Template Configures

Each template provides:

- Service categories for manual lead creation and public form previews.
- Urgency keywords that boost lead score and can infer emergency intent.
- High-value keywords that identify larger jobs or project opportunities.
- Disqualification keywords that reduce spam or poor-fit scores.
- Default lead source labels.
- Qualification questions for office staff.
- Default SMS and email templates.
- Default dry-run follow-up sequence.
- Proposal starter notes for converting a lead into the job workflow.
- Dashboard label copy for trade-specific operator language.

## Scoring Behavior

Generic scoring still works when no trade is selected. When an org has an active trade template, scoring adds deterministic trade-specific modifiers:

- Matching a service category adds a small service-fit boost.
- Matching urgency keywords adds an urgency boost and can infer emergency urgency.
- Matching high-value keywords adds a project-value boost.
- Matching disqualification keywords applies a penalty.

Scores are still clamped from 0 to 100, and the score breakdown records the active `tradeTemplate` plus matched trade signals.

## Onboarding Flow

The `/leads` page includes **Lead Conversion Setup**:

1. Choose your trade.
2. Confirm business name and service area.
3. Choose lead sources.
4. Review service categories.
5. Review SMS/email templates.
6. Review follow-up sequence.
7. Finish setup.

Finishing setup saves the selected trade, service area, lead sources, and message defaults to `lead_settings`.

## Public Form And Embed Behavior

When a trade is selected, the public form preview and generated embed snippet show trade-specific service options. The embed snippet only includes the public capture endpoint token. It does not expose org IDs, user IDs, provider secrets, or API keys.

## Follow-Up Defaults

Templates provide a default dry-run follow-up sequence:

- Day 1 follow-up
- Day 3 reminder
- Day 7 final check-in

These create lead follow-up tasks only. Lead Center GUI actions and follow-up processing remain dry-run unless a future phase explicitly enables live messaging.

## Customizing Later

For v1, templates are code-defined in `shared/leadTradeTemplates.ts`. Later customization can add database-backed template overrides if users need per-org service categories, copy, or scoring weights. Keep overrides org-scoped and avoid exposing provider secrets.

## Dry-Run Safety

- No real SMS is sent by the Lead Center template flow.
- No real email is sent by the Lead Center template flow.
- Missing Twilio, SendGrid, or OpenAI configuration should not block setup.
- Template setup does not add Facebook, Google, Zapier, Make, n8n, CRM sync, or billing logic.
