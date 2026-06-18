import type { Lead, Org } from "@shared/schema";
import { storage } from "./storage";

function valueOrBlank(value: unknown): string {
  return value == null ? "" : String(value);
}

export function renderLeadTemplate(template: string, lead: Lead, org?: Org | null): string {
  const replacements: Record<string, string> = {
    name: lead.name,
    lead_name: lead.name,
    phone: valueOrBlank(lead.phone),
    email: valueOrBlank(lead.email),
    service: valueOrBlank(lead.serviceType),
    service_type: valueOrBlank(lead.serviceType),
    urgency: valueOrBlank(lead.urgency),
    business: valueOrBlank(org?.name),
    business_name: valueOrBlank(org?.name),
    org_name: valueOrBlank(org?.name),
  };

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => replacements[key.toLowerCase()] ?? "");
}

export async function recordDryRunSmsActivity(opts: {
  orgId: string;
  lead: Lead;
  body: string;
  createdBy?: string | null;
}) {
  return storage.createLeadActivity(opts.orgId, opts.lead.id, {
    type: "message",
    channel: "sms",
    direction: "outbound",
    subject: "Dry-run SMS",
    body: opts.body,
    status: "dry_run",
    metadata: {
      dryRun: true,
      reason: "Lead Conversion Center v1A does not send real SMS.",
      to: opts.lead.phone || null,
    },
    createdBy: opts.createdBy || null,
  });
}

export async function recordDryRunEmailActivity(opts: {
  orgId: string;
  lead: Lead;
  subject: string;
  body: string;
  createdBy?: string | null;
}) {
  return storage.createLeadActivity(opts.orgId, opts.lead.id, {
    type: "message",
    channel: "email",
    direction: "outbound",
    subject: opts.subject,
    body: opts.body,
    status: "dry_run",
    metadata: {
      dryRun: true,
      reason: "Lead Conversion Center v1A does not send real email.",
      to: opts.lead.email || null,
    },
    createdBy: opts.createdBy || null,
  });
}
