import type { Lead, Org } from "@shared/schema";
import { storage } from "./storage";
import { sendSMS as twilioSendSMS, getTwilioPhoneNumber, isTwilioConfigured } from "./twilioClient";
import { sendEmail as sendGridEmail } from "./emailClient";
import { logger as rootLogger } from "./logger";

const log = rootLogger.child({ component: "lead-messaging" });

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

type LeadMessagingProviderStatus = {
  twilioConfigured: boolean;
  twilioFromPhoneConfigured: boolean;
  sendgridConfigured: boolean;
  sendgridFromEmailConfigured: boolean;
  openaiConfigured: boolean;
  openaiMode: "openai" | "fallback";
};

type LeadMessagingDeps = {
  sendSMS: (to: string, from: string, body: string) => Promise<boolean>;
  getTwilioPhoneNumber: () => Promise<string | undefined>;
  isTwilioConfigured: () => Promise<boolean>;
  sendEmail: typeof sendGridEmail;
};

let deps: LeadMessagingDeps = {
  sendSMS: twilioSendSMS,
  getTwilioPhoneNumber,
  isTwilioConfigured,
  sendEmail: sendGridEmail,
};

export function setLeadMessagingDepsForTests(nextDeps: Partial<LeadMessagingDeps>) {
  deps = { ...deps, ...nextDeps };
}

export function resetLeadMessagingDepsForTests() {
  deps = {
    sendSMS: twilioSendSMS,
    getTwilioPhoneNumber,
    isTwilioConfigured,
    sendEmail: sendGridEmail,
  };
}

export function isSendGridConfigured() {
  return !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

export async function getLeadMessagingProviderStatus(): Promise<LeadMessagingProviderStatus> {
  const [twilioConfigured, twilioPhone] = await Promise.all([
    deps.isTwilioConfigured(),
    deps.getTwilioPhoneNumber(),
  ]);

  return {
    twilioConfigured,
    twilioFromPhoneConfigured: !!twilioPhone,
    sendgridConfigured: isSendGridConfigured(),
    sendgridFromEmailConfigured: !!process.env.SENDGRID_FROM_EMAIL,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    openaiMode: process.env.OPENAI_API_KEY ? "openai" : "fallback",
  };
}

function appendSmsFooter(body: string, footer: string | null | undefined): string {
  const cleanFooter = (footer || "").trim();
  if (!cleanFooter) return body;
  if (body.toLowerCase().includes(cleanFooter.toLowerCase())) return body;
  return `${body.trim()}\n\n${cleanFooter}`;
}

function safeEmailHtml(body: string) {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

async function hasRecentLiveAttempt(orgId: string, leadId: string, channel: "sms" | "email", recipient: string) {
  const recentCutoff = Date.now() - 60 * 1000;
  const activities = await storage.getLeadActivities(orgId, leadId);
  return activities.some((activity) => {
    const metadata = activity.metadata && typeof activity.metadata === "object" ? activity.metadata as Record<string, unknown> : {};
    return activity.type === "message"
      && activity.channel === channel
      && metadata.mode === "live"
      && metadata.recipient === recipient
      && new Date(activity.createdAt).getTime() >= recentCutoff;
  });
}

async function recordMessageActivity(opts: {
  orgId: string;
  lead: Lead;
  channel: "sms" | "email";
  mode: "dry-run" | "live" | "blocked" | "error";
  recipient: string | null;
  subject?: string | null;
  body: string;
  template: string;
  provider: string;
  reason?: string;
  providerResult?: string;
  error?: string;
  createdBy?: string | null;
}) {
  return storage.createLeadActivity(opts.orgId, opts.lead.id, {
    type: "message",
    channel: opts.channel,
    direction: "outbound",
    subject: opts.subject || (opts.channel === "sms" ? "Lead SMS" : "Lead email"),
    body: opts.body,
    status: opts.mode === "dry-run" ? "dry_run" : opts.mode,
    error: opts.error || null,
    metadata: {
      mode: opts.mode,
      dryRun: opts.mode === "dry-run",
      recipient: opts.recipient,
      template: opts.template,
      provider: opts.provider,
      providerResult: opts.providerResult || null,
      reason: opts.reason || null,
    },
    createdBy: opts.createdBy || null,
  });
}

export async function recordDryRunSmsActivity(opts: {
  orgId: string;
  lead: Lead;
  body: string;
  createdBy?: string | null;
}) {
  return recordMessageActivity({
    orgId: opts.orgId,
    lead: opts.lead,
    channel: "sms",
    mode: "dry-run",
    recipient: opts.lead.phone || null,
    subject: "Dry-run SMS",
    body: opts.body,
    template: opts.body,
    provider: "twilio",
    reason: "Lead Conversion Center dry-run mode is active.",
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
  return recordMessageActivity({
    orgId: opts.orgId,
    lead: opts.lead,
    channel: "email",
    mode: "dry-run",
    recipient: opts.lead.email || null,
    subject: opts.subject,
    body: opts.body,
    template: opts.body,
    provider: "sendgrid",
    reason: "Lead Conversion Center dry-run mode is active.",
    createdBy: opts.createdBy || null,
  });
}

export async function sendLeadSms(opts: {
  orgId: string;
  lead: Lead;
  org?: Org | null;
  template: string;
  createdBy?: string | null;
}) {
  const settings = await storage.getLeadSettings(opts.orgId);
  const body = appendSmsFooter(renderLeadTemplate(opts.template, opts.lead, opts.org), settings?.smsComplianceFooter);
  const recipient = opts.lead.phone?.trim() || "";
  const status = await getLeadMessagingProviderStatus();
  const fromPhone = await deps.getTwilioPhoneNumber();

  const blockedReason = !settings || settings.dryRun
    ? "dry_run_enabled"
    : !settings.smsEnabled
      ? "sms_not_enabled"
      : !status.twilioConfigured || !fromPhone
        ? "twilio_not_configured"
        : !recipient
          ? "missing_sms_recipient"
          : !opts.lead.consentToSms
            ? "missing_sms_consent"
            : !opts.template.trim()
              ? "missing_sms_template"
              : await hasRecentLiveAttempt(opts.orgId, opts.lead.id, "sms", recipient)
                ? "duplicate_recent_sms"
                : null;

  if (blockedReason) {
    const mode = blockedReason === "dry_run_enabled" ? "dry-run" : "blocked";
    const activity = await recordMessageActivity({
      orgId: opts.orgId,
      lead: opts.lead,
      channel: "sms",
      mode,
      recipient: recipient || null,
      subject: mode === "dry-run" ? "Dry-run SMS" : "SMS blocked",
      body,
      template: opts.template,
      provider: "twilio",
      reason: blockedReason,
      createdBy: opts.createdBy || null,
    });
    return { ok: mode === "dry-run", mode, reason: blockedReason, activity };
  }

  try {
    const sent = await deps.sendSMS(recipient, fromPhone!, body);
    const mode = sent ? "live" : "error";
    const activity = await recordMessageActivity({
      orgId: opts.orgId,
      lead: opts.lead,
      channel: "sms",
      mode,
      recipient,
      subject: sent ? "SMS sent" : "SMS error",
      body,
      template: opts.template,
      provider: "twilio",
      providerResult: sent ? "sent" : "send_returned_false",
      error: sent ? undefined : "Twilio did not accept the message.",
      createdBy: opts.createdBy || null,
    });
    return { ok: sent, mode, reason: sent ? null : "provider_error", activity };
  } catch (err) {
    log.error({
      err: err instanceof Error ? err.message : String(err),
      orgId: opts.orgId,
      leadId: opts.lead.id,
      channel: "sms",
    }, "Lead SMS provider request failed");
    const activity = await recordMessageActivity({
      orgId: opts.orgId,
      lead: opts.lead,
      channel: "sms",
      mode: "error",
      recipient,
      subject: "SMS error",
      body,
      template: opts.template,
      provider: "twilio",
      error: "SMS provider request failed.",
      createdBy: opts.createdBy || null,
    });
    return { ok: false, mode: "error", reason: "provider_error", activity };
  }
}

export async function sendLeadEmail(opts: {
  orgId: string;
  lead: Lead;
  org?: Org | null;
  subject: string;
  template: string;
  createdBy?: string | null;
}) {
  const settings = await storage.getLeadSettings(opts.orgId);
  const subject = renderLeadTemplate(opts.subject, opts.lead, opts.org);
  const body = renderLeadTemplate(opts.template, opts.lead, opts.org);
  const recipient = opts.lead.email?.trim() || "";
  const status = await getLeadMessagingProviderStatus();

  const blockedReason = !settings || settings.dryRun
    ? "dry_run_enabled"
    : !settings.emailEnabled
      ? "email_not_enabled"
      : !status.sendgridConfigured || !status.sendgridFromEmailConfigured
        ? "sendgrid_not_configured"
        : !recipient
          ? "missing_email_recipient"
          : !opts.template.trim() || !opts.subject.trim()
            ? "missing_email_template"
            : await hasRecentLiveAttempt(opts.orgId, opts.lead.id, "email", recipient)
              ? "duplicate_recent_email"
              : null;

  if (blockedReason) {
    const mode = blockedReason === "dry_run_enabled" ? "dry-run" : "blocked";
    const activity = await recordMessageActivity({
      orgId: opts.orgId,
      lead: opts.lead,
      channel: "email",
      mode,
      recipient: recipient || null,
      subject: mode === "dry-run" ? subject : "Email blocked",
      body,
      template: opts.template,
      provider: "sendgrid",
      reason: blockedReason,
      createdBy: opts.createdBy || null,
    });
    return { ok: mode === "dry-run", mode, reason: blockedReason, activity };
  }

  try {
    await deps.sendEmail({
      to: recipient,
      fromName: opts.org?.name || "TradeFlow",
      replyTo: opts.org?.email || undefined,
      subject,
      text: body,
      html: safeEmailHtml(body),
    });
    const activity = await recordMessageActivity({
      orgId: opts.orgId,
      lead: opts.lead,
      channel: "email",
      mode: "live",
      recipient,
      subject,
      body,
      template: opts.template,
      provider: "sendgrid",
      providerResult: "sent",
      createdBy: opts.createdBy || null,
    });
    return { ok: true, mode: "live", reason: null, activity };
  } catch (err) {
    log.error({
      err: err instanceof Error ? err.message : String(err),
      orgId: opts.orgId,
      leadId: opts.lead.id,
      channel: "email",
    }, "Lead email provider request failed");
    const activity = await recordMessageActivity({
      orgId: opts.orgId,
      lead: opts.lead,
      channel: "email",
      mode: "error",
      recipient,
      subject,
      body,
      template: opts.template,
      provider: "sendgrid",
      error: "Email provider request failed.",
      createdBy: opts.createdBy || null,
    });
    return { ok: false, mode: "error", reason: "provider_error", activity };
  }
}

export async function sendLeadTestMessage(opts: {
  orgId: string;
  org?: Org | null;
  channel: "sms" | "email";
  to: string;
  subject?: string;
  template: string;
}) {
  const settings = await storage.getLeadSettings(opts.orgId);
  const status = await getLeadMessagingProviderStatus();
  const to = opts.to.trim();
  if (!to) return { ok: false, mode: "blocked", reason: "missing_test_destination" };
  if (!settings) return { ok: false, mode: "blocked", reason: "settings_missing" };

  if (opts.channel === "sms") {
    const fromPhone = await deps.getTwilioPhoneNumber();
    if (!settings.smsEnabled) return { ok: false, mode: "blocked", reason: "sms_not_enabled" };
    if (!status.twilioConfigured || !fromPhone) return { ok: false, mode: "blocked", reason: "twilio_not_configured" };
    const body = appendSmsFooter(opts.template, settings.smsComplianceFooter);
    try {
      const sent = await deps.sendSMS(to, fromPhone, body);
      return { ok: sent, mode: sent ? "live" : "error", reason: sent ? null : "provider_error" };
    } catch (err) {
      log.error({
        err: err instanceof Error ? err.message : String(err),
        orgId: opts.orgId,
        channel: "sms",
      }, "Lead test SMS provider request failed");
      return { ok: false, mode: "error", reason: "provider_error" };
    }
  }

  if (!settings.emailEnabled) return { ok: false, mode: "blocked", reason: "email_not_enabled" };
  if (!status.sendgridConfigured || !status.sendgridFromEmailConfigured) return { ok: false, mode: "blocked", reason: "sendgrid_not_configured" };
  try {
    await deps.sendEmail({
      to,
      fromName: opts.org?.name || "TradeFlow",
      replyTo: opts.org?.email || undefined,
      subject: opts.subject || "TradeFlow test message",
      text: opts.template,
      html: safeEmailHtml(opts.template),
    });
    return { ok: true, mode: "live", reason: null };
  } catch (err) {
    log.error({
      err: err instanceof Error ? err.message : String(err),
      orgId: opts.orgId,
      channel: "email",
    }, "Lead test email provider request failed");
    return { ok: false, mode: "error", reason: "provider_error" };
  }
}
