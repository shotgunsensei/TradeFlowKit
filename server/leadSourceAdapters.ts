export type NormalizedLeadSourcePayload = {
  source: string;
  sourceDetail: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  description: string;
  preferredContact: string | null;
  preferredTime: string | null;
  consentToSms: boolean;
  metadata: Record<string, unknown>;
};

export type LeadSourceAdapter = {
  key: string;
  label: string;
  description: string;
  examplePayload: Record<string, unknown>;
  normalize(payload: unknown): NormalizedLeadSourcePayload;
};

function asRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be a JSON object.");
  }
  return payload as Record<string, unknown>;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "y", "on"].includes(value.trim().toLowerCase());
  return false;
}

function compactMetadata(input: Record<string, unknown>, adapterKey: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = { adapterKey };
  for (const key of ["id", "leadId", "sourceId", "campaign", "campaignName", "formName", "pageName", "submittedAt", "referrer"]) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[key] = value;
    }
  }
  return metadata;
}

function normalizeGeneric(payload: unknown, adapterKey = "genericJson"): NormalizedLeadSourcePayload {
  const input = asRecord(payload);
  const name = firstText(input, ["name", "fullName", "full_name", "customerName", "leadName"]);
  const phone = firstText(input, ["phone", "phoneNumber", "phone_number", "mobile"]);
  const email = firstText(input, ["email", "emailAddress", "email_address"]);
  if (!name) throw new Error("Name is required.");
  if (!phone && !email) throw new Error("At least one contact method is required.");

  return {
    source: "external_webhook",
    sourceDetail: firstText(input, ["sourceDetail", "source_detail", "source", "formName", "campaignName"]) || adapterKey,
    name,
    phone,
    email,
    address: firstText(input, ["address", "serviceAddress", "service_address", "location"]),
    serviceType: firstText(input, ["serviceType", "service_type", "service", "category", "requestType"]),
    description: firstText(input, ["description", "details", "message", "notes", "request"]),
    preferredContact: firstText(input, ["preferredContact", "preferred_contact", "contactMethod"]) || null,
    preferredTime: firstText(input, ["preferredTime", "preferred_time", "bestTime"]) || null,
    consentToSms: bool(input.consentToSms ?? input.smsConsent ?? input.sms_consent),
    metadata: compactMetadata(input, adapterKey),
  };
}

export const leadSourceAdapters: LeadSourceAdapter[] = [
  {
    key: "genericJson",
    label: "Generic JSON",
    description: "Accepts a simple JSON payload from any website, form tool, or custom script.",
    examplePayload: {
      name: "Pat Customer",
      phone: "+15551234567",
      email: "pat@example.com",
      address: "123 Main St",
      serviceType: "No cooling",
      description: "AC is not cooling and customer needs service today.",
      preferredContact: "phone",
      preferredTime: "Morning",
      consentToSms: true,
      sourceDetail: "Website landing page",
    },
    normalize: (payload) => normalizeGeneric(payload, "genericJson"),
  },
  {
    key: "websiteForm",
    label: "Website Form",
    description: "Normalizes the TradeFlow public website form shape into an internal lead.",
    examplePayload: {
      name: "Pat Customer",
      phone: "+15551234567",
      email: "pat@example.com",
      serviceType: "Emergency plumbing",
      message: "Burst pipe under the sink.",
      consentToSms: true,
    },
    normalize: (payload) => {
      const normalized = normalizeGeneric(payload, "websiteForm");
      return {
        ...normalized,
        source: "website_form",
        sourceDetail: normalized.sourceDetail || "Website Form",
      };
    },
  },
  {
    key: "n8n",
    label: "n8n Webhook",
    description: "Accepts the same generic JSON shape from an n8n webhook workflow.",
    examplePayload: {
      name: "Pat Customer",
      phone: "+15551234567",
      service: "Panel upgrade",
      details: "Customer wants EV charger and panel upgrade quote.",
      consentToSms: true,
      source: "n8n workflow",
    },
    normalize: (payload) => {
      const normalized = normalizeGeneric(payload, "n8n");
      return {
        ...normalized,
        sourceDetail: normalized.sourceDetail || "n8n Webhook",
      };
    },
  },
];

export function getLeadSourceAdapter(adapterKey: string): LeadSourceAdapter | undefined {
  return leadSourceAdapters.find((adapter) => adapter.key === adapterKey);
}

export function getPublicLeadSourceAdapters() {
  return leadSourceAdapters.map(({ key, label, description, examplePayload }) => ({
    key,
    label,
    description,
    examplePayload,
  }));
}
