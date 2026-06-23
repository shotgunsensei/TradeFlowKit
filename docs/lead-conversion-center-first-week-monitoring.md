# Lead Conversion Center First-Week Monitoring

Use this during the first week after a contractor starts using Lead Conversion Center.

## Daily checks

- New leads captured.
- Hot leads reviewed.
- Follow-ups due today.
- Overdue follow-ups.
- Failed message attempts.
- Converted leads.
- Last public form or source activity.
- Current mode: demo, dry-run, or live.

## New leads captured

Check whether new opportunities are entering the system from expected sources. Confirm source labels and service types make sense.

## Hot leads reviewed

Review hot leads with the office manager. Confirm the score matches real priority and adjust template keywords later if needed.

## Overdue follow-ups

Overdue follow-ups are the clearest early sign that the office process needs attention. Review who owns each overdue lead and whether timing should be changed.

## Failed message attempts

Review the **Needs Attention** section. Common reasons include missing consent, missing recipient, provider not ready, or duplicate recent attempts.

## Conversion count

Track how many leads become customers/jobs. Early conversion count matters less than whether staff understand the workflow.

## Public form/source activity

Confirm the last lead source event is recent and expected. If no source events appear, verify the website form or source setup.

## Dry-run vs live message status

- In dry-run, normal lead messages should be prepared only.
- In live mode, messages should send only when consent, templates, provider readiness, and recipient checks pass.

## Provider errors

Check Twilio and SendGrid logs if a live test or live message fails. Do not expose provider secrets in notes or screenshots.

## Client feedback

Ask office staff:

- Which lead section do you check first?
- Did any lead arrive without enough information?
- Did any follow-up timing feel wrong?
- Did any message wording sound off?
- Did conversion to customer/job make sense?

## Template adjustments

Review SMS and email wording after staff use the system for several real leads. Keep opt-out wording visible for SMS.

## Scoring adjustments

Tune service keywords, urgency language, and high-value service examples only after reviewing real lead quality with the client.

## Go-live rollback criteria

Roll back to dry-run if:

- Staff are confused about live vs prepared messages.
- Provider logs do not match TradeFlowKit activity.
- Bad leads are entering from a public source.
- A message template is wrong.
- Consent handling is unclear.
- Follow-up timing causes operational issues.

## End-of-week review questions

- How many leads were captured?
- Which sources worked?
- Which leads were hot?
- How many follow-ups went overdue?
- Were any messages blocked or failed?
- How many leads converted?
- What should be changed before month two?
