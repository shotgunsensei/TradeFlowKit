# Lead Conversion Center Release Checklist

Use this before shipping or demoing the Lead Conversion Center add-on.

## Required Validation

- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npx vitest run tests/lead-scoring.test.ts`
- [ ] `npx vitest run tests/leads-routes.test.ts`
- [ ] `npm test` with `DATABASE_URL` configured
- [ ] `npm run db:push` against the target dev/test database
- [ ] `npm run seed:lead-demo -- --org-id=<org_id>`
- [ ] `npm run test:e2e -- e2e/leads-smoke.spec.ts`
- [ ] Manual QA checklist completed from `docs/lead-conversion-center-qa-checklist.md`

## Provider And Dry-Run Safety

- [ ] Lead GUI SMS action records a `dry_run` activity only.
- [ ] Lead GUI email action records a `dry_run` activity only.
- [ ] No Twilio send path is called from Lead Center GUI actions.
- [ ] No SendGrid send path is called from Lead Center GUI actions.
- [ ] Provider status shows only configured/not configured or fallback mode.
- [ ] Provider status does not expose API keys, tokens, phone numbers, or secrets.
- [ ] Missing Twilio, SendGrid, or OpenAI config does not block lead creation.
- [ ] Demo seed does not send outbound messages.

## Org Isolation

- [ ] Leads created in one org are not visible in another org.
- [ ] Lead detail route blocks cross-org access.
- [ ] Follow-up endpoint blocks cross-org access.
- [ ] Operator dashboard buckets include only current org leads.
- [ ] Conversion creates customer/job only in the selected org.
- [ ] Public capture token creates a lead only for the owning form org.

## Demo Readiness

- [ ] Demo org has seeded leads for Hot Leads.
- [ ] Demo org has seeded leads for Needs Contact.
- [ ] Demo org has seeded leads for Follow Up Today.
- [ ] Demo org has seeded leads for Overdue.
- [ ] Demo org has seeded leads for Recently Converted.
- [ ] Demo org has at least one failed follow-up attempt.
- [ ] Demo org has visible pipeline cards for Captured, Contacted, Qualified, Follow-Up, Converted, and Lost.
- [ ] Demo data badge appears on `/leads`.

## Browser Smoke

- [ ] Dashboard Lead Conversion widget is visible.
- [ ] `/leads` loads operator dashboard.
- [ ] New Lead dialog opens.
- [ ] Manual lead creation succeeds.
- [ ] Lead detail opens.
- [ ] Score/SLA/pipeline visuals render.
- [ ] Re-score action succeeds.
- [ ] Dry-run SMS action succeeds.
- [ ] Dry-run email action succeeds.
- [ ] Conversion creates linked customer/job controls.
- [ ] Failure screenshots are written to Playwright output when the smoke test fails.

## Production Safety

- [ ] `NODE_ENV=production` blocks `scripts/seed-lead-demo.ts`.
- [ ] No demo seed command is run against production.
- [ ] No schema change is included in this release unless separately reviewed.
- [ ] No billing or entitlement behavior is changed unless separately reviewed.
- [ ] Call Recovery AI webhook behavior is unchanged.
- [ ] Customers, jobs, quotes, invoices, payments, reminders, and reviews still pass smoke checks.

## Rollback Notes

- UI-only Lead Center changes can be rolled back by reverting the frontend files and `server/routes/leads.ts` operator bucket additions.
- Demo seed data is marked with `metadata.demoLeadSeed=true`; remove only from dev/demo orgs when cleaning up.
- Do not delete shared lead schema tables during rollback unless the deployment explicitly requires full feature removal.

## Known Limitations

- Full validation requires a configured PostgreSQL `DATABASE_URL`.
- Browser smoke assumes a running app at `E2E_BASE_URL` or `http://localhost:5000`.
- Lead messaging remains dry-run only until a future explicitly approved messaging enablement phase.
