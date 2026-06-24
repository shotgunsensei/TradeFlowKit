# Lead Conversion Center Visual QA

Use this checklist before a client demo, dry-run launch, or production activation review.

## Desktop QA

- Open `/leads` at 1280x800 and 1440x900.
- Confirm the page title, primary New Lead action, Performance, Setup, and Settings are visible.
- Confirm the operating mode rail clearly says Demo Mode, Dry-Run Mode, Live Mode, or Needs Attention.
- Confirm Hot Leads, Needs Contact, Follow Up Today, Overdue, Recently Converted, and Needs Attention are easy to scan.
- Confirm stats remain aligned without clipped labels.
- Confirm the lead table scrolls horizontally instead of clipping columns.
- Confirm the pipeline view shows readable cards and stage counts.
- Confirm setup, deployment, and readiness actions open the expected panel.

## Mobile QA

- Test `/leads` at 390x844 and 360x800.
- Confirm header actions wrap without horizontal overflow.
- Confirm the operating mode rail stacks and remains readable.
- Confirm filters stack to full width and all tap targets remain accessible.
- Confirm lead cards replace the wide table.
- Confirm the pipeline uses readable columns without squeezed seven-column cards.
- Confirm New Lead, Setup, Public Form, Settings, Go-Live confirmation, and Lead Detail dialogs fit within the viewport and scroll internally.
- Confirm primary dialog actions are full-width or easy to tap.
- Confirm the mobile bottom navigation exposes Leads.

## Navigation shortcuts

- Sidebar: Dashboard, Leads, Customers, Jobs, Quotes, Invoices.
- Mobile: Leads is a primary bottom-navigation item.
- Command palette:
  - Leads
  - Lead ROI Report
  - Lead Settings
  - Lead Go-Live Checklist
- Dashboard Lead widget opens `/leads`.
- Dashboard New Lead opens `/leads?new=1`.
- `/leads?view=performance` opens Lead Performance.
- `/leads?settings=1` opens Lead Settings and Readiness.
- `/leads?setup=1` opens Lead Conversion Setup.
- `/leads?form=1` opens the public form panel.
- `/leads/demo` opens the demo walkthrough.

## Empty states

- No leads: explain how to add the first lead and expose the public form action.
- No source data: explain that source comparisons appear after leads arrive.
- No failed messages: state that there are no message issues to review.
- No follow-ups: state that none are scheduled.
- No timeline activity: show a clear neutral state.
- No score breakdown or AI qualification: do not show an empty frame without explanation.

## Loading and errors

- Operator panels retain context with skeletons.
- Lead lists do not disappear into a blank page while loading.
- Provider, dashboard, and lead query failures show contractor-friendly messages.
- Invalid or missing dates render a fallback instead of `Invalid Date`.
- Failed message attempts remain visible without exposing credentials or provider internals.

## Mode clarity

### Demo Mode

- Clearly marked as sample data.
- Message actions do not imply a real send.
- Demo walkthrough is reachable from the mode rail.

### Dry-Run Mode

- Exact message: `Dry-run mode is active. Messages are logged but not sent.`
- Lead detail actions say Prepare SMS and Prepare Email.
- Settings repeats the dry-run status.

### Live Mode

- Exact message: `Live mode is active. Messages may be sent to real leads based on your settings.`
- Lead detail explains that consent and provider checks still apply.
- Live mode is never enabled by visiting a page.

### Needs Attention

- Mode rail identifies the problem state.
- Settings exposes the first blocker and the Go-Live Checklist.

## Lead detail

- Name, contact information, service request, source, urgency, score, and response status are visible.
- Next best action is immediately visible.
- Call Now uses the lead phone number.
- Mark Contacted, Mark Qualified, Re-score, Prepare/Send Message, Convert to Job, Mark Lost, and Mark Spam are accessible.
- Missing phone/email disables the matching message action.
- Linked customer, job, quote, and invoice actions are clear.
- Timeline labels use business language.
- Message details are collapsed by default.

## Performance report

- Date range works for 30 days, 90 days, and all time.
- Capture count, conversion count/rate, average response, overdue follow-ups, and estimated converted value are readable.
- Source comparison works with zero, one, and several sources.
- Copy Summary produces plain-language text.
- Estimated opportunity value is not presented as booked revenue or guaranteed ROI.
- Recommended fixes link back to actionable Lead Center views.

## Screenshots before a client demo

Capture these without exposing org IDs, public tokens, phone numbers, emails, or provider credentials:

1. Dashboard Lead Conversion widget.
2. `/leads` operator dashboard with the mode rail.
3. Hot lead detail with next best action.
4. New Lead dialog at desktop width.
5. Settings and Go-Live Checklist.
6. Lead Performance report.
7. Demo walkthrough.
8. Mobile `/leads` operator dashboard.
9. Mobile Lead Detail dialog.
10. Mobile New Lead dialog.

Store screenshots outside the repository unless a committed visual-snapshot convention is introduced.

