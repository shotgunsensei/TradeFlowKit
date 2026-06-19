# Lead Source Adapters

Lead source adapters let external forms and workflow tools submit leads into TradeFlowKit without becoming the system of record. Every accepted payload is normalized into the internal `leads` table, scored, followed up according to Lead Center settings, and moved through the normal customer/job/quote/invoice workflow.

## Public Endpoint

```http
POST /api/public/lead-source/:publicToken/:adapterKey
```

The `publicToken` comes from the Lead Capture Form settings. The adapter key chooses how the JSON payload is normalized.

Supported v1 adapters:

- `genericJson`
- `websiteForm`
- `n8n`

Facebook Lead Ads, Google Lead Forms, Twilio Voice, chat widgets, Zapier, and Make can use this framework later, but Phase 4G does not add OAuth or provider-specific integrations.

## Generic JSON Payload

```json
{
  "name": "Pat Customer",
  "phone": "+15551234567",
  "email": "pat@example.com",
  "address": "123 Main St",
  "serviceType": "No cooling",
  "description": "AC is not cooling and customer needs service today.",
  "preferredContact": "phone",
  "preferredTime": "Morning",
  "consentToSms": true,
  "sourceDetail": "Website landing page"
}
```

The adapter also accepts common aliases such as `fullName`, `phoneNumber`, `emailAddress`, `service`, `details`, `message`, `smsConsent`, and `campaignName`.

## n8n Example

Use an n8n Webhook node with a POST body shaped like:

```json
{
  "name": "Pat Customer",
  "phone": "+15551234567",
  "service": "Panel upgrade",
  "details": "Customer wants EV charger and panel upgrade quote.",
  "consentToSms": true,
  "source": "n8n workflow"
}
```

Point the node to:

```text
https://your-domain.example/api/public/lead-source/<publicToken>/n8n
```

## Zapier And Make Concept

Zapier and Make can POST the same generic JSON shape to:

```text
https://your-domain.example/api/public/lead-source/<publicToken>/genericJson
```

Map the external form fields into `name`, `phone`, `email`, `serviceType`, `description`, and `consentToSms`. The external system should not be treated as the source of truth after submission; TradeFlowKit owns lead qualification, follow-up, conversion, and job workflow.

## Security And Rate Limits

- Public adapter endpoints are rate-limited.
- Invalid tokens return a safe not-found response.
- Disabled lead capture forms reject submissions.
- Adapter logs store status, adapter key, lead id, error reason, and safe metadata.
- Raw payloads and provider secrets are not stored.
- Public responses do not expose org, customer, user, or provider data.

## Normalization

Each adapter produces:

- `source`
- `sourceDetail`
- `name`
- `phone`
- `email`
- `address`
- `serviceType`
- `description`
- `preferredContact`
- `preferredTime`
- `consentToSms`
- `metadata`

The normalized lead is then scored with the active trade template when configured. Follow-up tasks and initial responses use the same Lead Center settings and Phase 4F live-message guards. Real SMS/email remains blocked unless dry-run is off, the channel is enabled, providers are configured, and consent/template checks pass.
