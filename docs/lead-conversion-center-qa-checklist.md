# Lead Conversion Center QA Checklist

Use this checklist before demoing or releasing the Lead Conversion Center add-on.

## Access

- [ ] User can log in.
- [ ] Session remains valid after refresh.
- [ ] An organization is selected.
- [ ] Sidebar shows Leads after Dashboard.
- [ ] Mobile navigation exposes Leads.
- [ ] Command palette opens Leads.
- [ ] Dashboard Lead Conversion widget links to `/leads`.

## Lead Center

- [ ] `/leads` loads without console errors.
- [ ] Dry-run mode notice is visible when enabled.
- [ ] Provider status does not expose secrets.
- [ ] Empty state explains adding or seeding demo leads.
- [ ] Add-on value panel is visible.
- [ ] Operator dashboard sections stack correctly on mobile.
- [ ] Pipeline view shows Captured, Contacted, Qualified, Follow-Up, Converted, and Lost.
- [ ] Table view works on desktop.
- [ ] Compact cards work on mobile.

## Manual Lead Flow

- [ ] Create a manual lead.
- [ ] Required validation prevents missing name.
- [ ] New lead appears in list.
- [ ] New lead appears in pipeline.
- [ ] Search finds the lead by name.
- [ ] Filters work for status, source, urgency, hot, due follow-up, and overdue.
- [ ] Lead detail opens.
- [ ] Score badge appears.
- [ ] Re-score lead works and creates timeline activity.
- [ ] Mark contacted stamps response state.
- [ ] Mark qualified updates pipeline state.
- [ ] Mark lost closes the active workflow.

## Messaging Dry Run

- [ ] Dry-run SMS creates a timeline activity.
- [ ] Dry-run email creates a timeline activity.
- [ ] Timeline labels say prepared, not sent, when `status=dry_run`.
- [ ] No real SMS is sent.
- [ ] No real email is sent.
- [ ] Activity metadata shows `dryRun=true`.

## Follow-Ups

- [ ] Next follow-up is visible on detail.
- [ ] Pending follow-ups display.
- [ ] Completed follow-ups display.
- [ ] Failed follow-ups display with error text.
- [ ] Due follow-ups appear in the operator dashboard.
- [ ] Overdue follow-ups appear in the operator dashboard and filter.

## Conversion

- [ ] Convert to Customer/Job action is visible before conversion.
- [ ] Conversion creates or reuses a customer.
- [ ] Conversion creates a job with status `lead`.
- [ ] Converted lead status is `converted`.
- [ ] Open Customer link works when linked.
- [ ] Open Job link works when linked.
- [ ] Open Quote link appears only when a quote exists.
- [ ] Open Invoice link appears only when an invoice exists.

## Dashboard

- [ ] Dashboard Lead Conversion widget handles loading state.
- [ ] Dashboard Lead Conversion widget handles API error state.
- [ ] New Leads count updates.
- [ ] Hot Leads count updates.
- [ ] Due Follow-Up count updates.
- [ ] Converted This Month count updates.
- [ ] New Lead quick action opens `/leads?new=1`.

## Public Lead Capture

- [ ] Lead Capture Form dialog opens.
- [ ] Public form URL is visible.
- [ ] Public token status does not expose org ids or secrets.
- [ ] Copy public link works.
- [ ] Copy embed snippet works.
- [ ] Public submission creates an org-scoped lead.
- [ ] Public response returns only the safe success message.

## Demo Data

- [ ] `npm run seed:lead-demo -- --org-id=<org_id>` works in development.
- [ ] Script refuses production.
- [ ] Re-running the script does not duplicate demo scenarios.
- [ ] Demo data badge appears when seeded leads exist.
- [ ] Demo scenarios show hot, overdue, converted, and missed-call-style examples.

## Regression Guard

- [ ] Customers still load.
- [ ] Jobs still load.
- [ ] Quotes still load.
- [ ] Invoices still load.
- [ ] Call Recovery AI page still loads.
- [ ] Existing missed-call workflow still behaves as before.
- [ ] No outbound SMS/email is introduced by Lead Center GUI actions.
