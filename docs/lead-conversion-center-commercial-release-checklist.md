# Lead Conversion Center Commercial Release Checklist

## Product Packaging

- [ ] `/api/leads/module-status` returns org-scoped module readiness.
- [ ] Lead Conversion Center module metadata is present and reused by server/client code.
- [ ] `/leads` shows current status, setup progress, connected sources, messaging mode, recent results, and next best action.
- [ ] Setup checklist actions open existing setup, capture form, settings, or lead creation flows.
- [ ] Contractor-friendly labels are used instead of technical automation labels.

## Demo Mode

- [ ] Demo seed data is visible as demo data without implying real customer results.
- [ ] Demo talking points explain why hot leads, overdue follow-ups, and converted leads appear.
- [ ] Demo cleanup guidance is documented only unless a safe scoped cleanup endpoint exists.

## Messaging Safety

- [ ] Dry-run mode remains the default.
- [ ] Dry-run SMS/email creates activity only and sends nothing.
- [ ] Live SMS still requires org enablement, provider readiness, recipient, consent, template, and opt-out wording.
- [ ] Live email still requires org enablement, provider readiness, recipient, subject, and body.
- [ ] Test message flow requires explicit destination and confirmation.
- [ ] No secrets are returned by provider or module status endpoints.

## Lead Source Adapter Safety

- [ ] Public token validation is required.
- [ ] Disabled forms/sources are rejected safely.
- [ ] Rate limiting is active on public intake endpoints.
- [ ] Adapter events log safe metadata only.
- [ ] External sources normalize into internal TradeFlowKit leads.

## Org Isolation

- [ ] Module status uses `req.session.orgId`.
- [ ] Lead stats, activities, follow-ups, source events, and forms are org-scoped.
- [ ] Cross-org lead reads return 404.
- [ ] Public endpoints do not expose org/customer/user data.

## Usage Summary

- [ ] Leads this month count is visible.
- [ ] Active lead sources count is visible.
- [ ] Public forms count is visible.
- [ ] Follow-ups scheduled count is visible.
- [ ] Messages prepared/sent/dry-run counts are visible.
- [ ] Conversions this month count is visible.

## Production Readiness

- [ ] Production `DATABASE_URL` is configured.
- [ ] Production `SESSION_SECRET` is configured.
- [ ] `REPLIT_DOMAINS` or deployed public domain is configured.
- [ ] SendGrid sender/domain is verified before email live mode.
- [ ] Twilio number is ready before SMS live mode.
- [ ] OpenAI key is configured if Call Recovery AI should use model responses instead of fallback logic.
- [ ] OperatorOS entitlement sync is reviewed if this is sold as a module/add-on.

## Validation

- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npx vitest run tests/lead-scoring.test.ts`
- [ ] `npx vitest run tests/leads-routes.test.ts`
- [ ] `npm test` with `DATABASE_URL` configured, or missing DB documented as environment-blocked.

## Sales Demo Path

- [ ] Login.
- [ ] Open Dashboard.
- [ ] Open `/leads`.
- [ ] Review module status panel.
- [ ] Review setup checklist.
- [ ] Open public form/embed dialog.
- [ ] Create or open a lead.
- [ ] Prepare dry-run SMS/email.
- [ ] Convert a qualified lead to customer/job.
- [ ] Confirm no real outbound communication is sent unless Phase 4F live safety gates are explicitly satisfied.
