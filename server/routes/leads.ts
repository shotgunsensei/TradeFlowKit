import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { storage } from "../storage";
import { scoreLead } from "../leadScoring";
import {
  getLeadSourceAdapter,
  getPublicLeadSourceAdapters,
  type NormalizedLeadSourcePayload,
} from "../leadSourceAdapters";
import { LEAD_TRADE_TEMPLATES, getLeadTradeTemplate, isLeadTradeKey } from "../leadTradeTemplates";
import {
  getLeadMessagingProviderStatus,
  sendLeadEmail,
  sendLeadSms,
  sendLeadTestMessage,
} from "../leadMessaging";

const router = Router();

const publicLeadCaptureLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many lead submissions. Please try again later." },
});

const DEFAULT_SMS_TEMPLATE = "Hi {name}, this is {business}. We received your request about {service}. What is the best time to follow up?";
const DEFAULT_EMAIL_SUBJECT = "Thanks for contacting {business}";
const DEFAULT_EMAIL_TEMPLATE = "Hi {name}, thanks for reaching out about {service}. We received your request and will follow up shortly.";

const leadBodySchema = z.object({
  source: z.string().trim().default("manual"),
  sourceDetail: z.string().trim().optional().nullable(),
  status: z.string().trim().default("new"),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")).nullable(),
  address: z.string().trim().optional().nullable(),
  serviceType: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  urgency: z.string().trim().default("normal"),
  estimatedValue: z.union([z.string(), z.number()]).optional().nullable(),
  preferredContact: z.string().trim().optional().nullable(),
  preferredTime: z.string().trim().optional().nullable(),
  consentToSms: z.boolean().optional().default(false),
  consentSource: z.string().trim().optional().nullable(),
  assignedUserId: z.string().trim().optional().nullable(),
  aiSummary: z.string().trim().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  lostReason: z.string().trim().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const activityBodySchema = z.object({
  type: z.string().trim().min(1),
  channel: z.string().trim().optional().nullable(),
  direction: z.string().trim().optional().nullable(),
  subject: z.string().trim().optional().nullable(),
  body: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  error: z.string().trim().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const smsBodySchema = z.object({
  template: z.string().trim().optional(),
});

const emailBodySchema = z.object({
  subject: z.string().trim().optional(),
  template: z.string().trim().optional(),
});

const testMessageSchema = z.object({
  channel: z.enum(["sms", "email"]),
  to: z.string().trim().min(1, "Test destination is required"),
  subject: z.string().trim().optional(),
  template: z.string().trim().min(1, "Test message template is required"),
  confirm: z.boolean().refine((value) => value === true, "Confirm test message before sending"),
});

const leadSettingsSchema = z.object({
  autoRespond: z.boolean().optional(),
  followUpEnabled: z.boolean().optional(),
  hotLeadThreshold: z.number().int().min(0).max(100).optional(),
  dryRun: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  defaultSmsTemplate: z.string().trim().optional().nullable(),
  defaultEmailSubject: z.string().trim().optional().nullable(),
  defaultEmailTemplate: z.string().trim().optional().nullable(),
  smsComplianceFooter: z.string().trim().optional().nullable(),
  notificationPhone: z.string().trim().optional().nullable(),
  notificationEmail: z.string().trim().email("Invalid notification email").optional().or(z.literal("")).nullable(),
  tradeTemplateKey: z.string().trim().optional().nullable(),
  serviceArea: z.string().trim().optional().nullable(),
  leadSources: z.array(z.string().trim().min(1)).optional().nullable(),
});

const captureFormSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sourceLabel: z.string().trim().min(1).optional(),
  isEnabled: z.boolean().optional(),
  defaultServiceType: z.string().trim().optional().nullable(),
  successMessage: z.string().trim().min(1).optional(),
});

const publicBooleanSchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return false;
}, z.boolean());

const publicLeadCaptureSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional().default(""),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")).default(""),
  address: z.string().trim().optional().default(""),
  serviceType: z.string().trim().optional().default(""),
  description: z.string().trim().optional().default(""),
  urgency: z.string().trim().optional().default("normal"),
  preferredContact: z.string().trim().optional().default(""),
  preferredTime: z.string().trim().optional().default(""),
  consentToSms: publicBooleanSchema.optional().default(false),
});

function normalizePhone(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "").slice(-10);
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

async function conversionWouldCreateCustomer(orgId: string, leadId: string): Promise<boolean> {
  const lead = await storage.getLead(orgId, leadId);
  if (!lead) return false;
  const phone = normalizePhone(lead.phone);
  const email = normalizeEmail(lead.email);
  const customers = await storage.getCustomers(orgId);
  const existing = customers.find((c) => {
    const phoneMatches = phone.length >= 7 && normalizePhone(c.phone) === phone;
    const emailMatches = !!email && normalizeEmail(c.email) === email;
    return phoneMatches || emailMatches;
  });
  return !existing;
}

function toLeadPayload(data: z.infer<typeof leadBodySchema>) {
  return {
    ...data,
    phone: data.phone || "",
    email: data.email || "",
    address: data.address || "",
    serviceType: data.serviceType || "",
    description: data.description || "",
    sourceDetail: data.sourceDetail || null,
    estimatedValue: data.estimatedValue == null || data.estimatedValue === "" ? null : String(data.estimatedValue),
    preferredContact: data.preferredContact || null,
    preferredTime: data.preferredTime || null,
    consentSource: data.consentSource || null,
    assignedUserId: data.assignedUserId || null,
    aiSummary: data.aiSummary || null,
    nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
    lostReason: data.lostReason || null,
    metadata: data.metadata || null,
  };
}

function plusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function selectFollowupChannel(lead: { phone?: string | null; email?: string | null; consentToSms?: boolean }) {
  if (lead.consentToSms && lead.phone?.trim()) return "sms";
  if (lead.email?.trim()) return "email";
  return null;
}

async function getOrCreateLeadSettings(orgId: string) {
  const existing = await storage.getLeadSettings(orgId);
  if (existing) return existing;
  return storage.upsertLeadSettings(orgId, {});
}

async function getActiveLeadTemplate(orgId: string) {
  const settings = await getOrCreateLeadSettings(orgId);
  return getLeadTradeTemplate(settings.tradeTemplateKey);
}

async function scheduleDefaultFollowups(orgId: string, lead: any) {
  const settings = await getOrCreateLeadSettings(orgId);
  if (!settings.followUpEnabled) return;
  const channel = selectFollowupChannel(lead);
  if (!channel) return;
  const tradeTemplate = getLeadTradeTemplate(settings.tradeTemplateKey);
  const sequence = tradeTemplate?.defaultFollowUpSequence.length
    ? tradeTemplate.defaultFollowUpSequence
    : [
      { stepNumber: 1, delayDays: 1, channel, messageTemplate: channel === "sms" ? settings.defaultSmsTemplate || DEFAULT_SMS_TEMPLATE : settings.defaultEmailTemplate || DEFAULT_EMAIL_TEMPLATE },
      { stepNumber: 2, delayDays: 3, channel, messageTemplate: channel === "sms" ? settings.defaultSmsTemplate || DEFAULT_SMS_TEMPLATE : settings.defaultEmailTemplate || DEFAULT_EMAIL_TEMPLATE },
    ];
  const fallbackTemplate = channel === "sms"
    ? settings.defaultSmsTemplate || DEFAULT_SMS_TEMPLATE
    : settings.defaultEmailTemplate || DEFAULT_EMAIL_TEMPLATE;

  for (const step of sequence) {
    await storage.createLeadFollowupTask(orgId, lead.id, {
      stepNumber: step.stepNumber,
      channel: step.channel === "sms" && !lead.consentToSms ? "email" : step.channel,
      dueAt: plusDays(step.delayDays),
      status: "pending",
      messageTemplate: step.messageTemplate || fallbackTemplate,
      lastAttemptAt: null,
      completedAt: null,
      error: null,
    });
  }
}

async function recordInitialAutoResponse(orgId: string, lead: any) {
  const settings = await getOrCreateLeadSettings(orgId);
  if (!settings.autoRespond) return;
  const org = await storage.getOrg(orgId);
  if (lead.consentToSms && lead.phone?.trim()) {
    await sendLeadSms({
      orgId,
      lead,
      org,
      template: settings.defaultSmsTemplate || DEFAULT_SMS_TEMPLATE,
      createdBy: null,
    });
    return;
  }
  if (lead.email?.trim()) {
    await sendLeadEmail({
      orgId,
      lead,
      org,
      subject: settings.defaultEmailSubject || DEFAULT_EMAIL_SUBJECT,
      template: settings.defaultEmailTemplate || DEFAULT_EMAIL_TEMPLATE,
      createdBy: null,
    });
  }
}

async function createLeadFromAdapterPayload(orgId: string, payload: NormalizedLeadSourcePayload, captureFormId?: string | null) {
  const settings = await getOrCreateLeadSettings(orgId);
  const scored = scoreLead(payload, { tradeTemplateKey: settings.tradeTemplateKey });
  const lead = await storage.createLead(orgId, {
    source: payload.source,
    sourceDetail: payload.sourceDetail,
    status: "new",
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    address: payload.address,
    serviceType: payload.serviceType,
    description: payload.description,
    urgency: scored.urgency,
    preferredContact: payload.preferredContact,
    preferredTime: payload.preferredTime,
    consentToSms: payload.consentToSms,
    consentSource: payload.consentToSms ? payload.source : null,
    score: scored.score,
    scoreBreakdown: scored.breakdown,
    metadata: {
      ...payload.metadata,
      captureFormId: captureFormId || null,
      normalizedBy: "lead_source_adapter",
    },
  } as any, null);

  await storage.createLeadActivity(orgId, lead.id, {
    type: "created",
    status: "new",
    subject: "Lead captured",
    body: `Captured from ${payload.sourceDetail || payload.source}.`,
    metadata: { captureFormId: captureFormId || null, score: scored.score, adapterKey: payload.metadata.adapterKey },
    createdBy: null,
  });

  await recordInitialAutoResponse(orgId, lead);
  await scheduleDefaultFollowups(orgId, lead);

  return lead;
}

router.post("/api/public/lead-capture/:publicToken", publicLeadCaptureLimiter, async (req: Request, res: Response) => {
  try {
    const form = await storage.getLeadCaptureFormByToken(req.params.publicToken as string);
    if (!form || !form.isEnabled) {
      return res.status(404).json({ error: "Lead capture form not found" });
    }

    const parsed = publicLeadCaptureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid lead request" });
    }
    const data = parsed.data;
    if (!data.phone.trim() && !data.email.trim()) {
      return res.status(400).json({ error: "Provide at least one contact method." });
    }

    const payload = {
      source: "website_form",
      sourceDetail: form.sourceLabel,
      status: "new",
      name: data.name,
      phone: data.phone,
      email: data.email,
      address: data.address,
      serviceType: data.serviceType || form.defaultServiceType || "",
      description: data.description,
      urgency: data.urgency,
      preferredContact: data.preferredContact || null,
      preferredTime: data.preferredTime || null,
      consentToSms: data.consentToSms,
      consentSource: data.consentToSms ? "public_lead_capture" : null,
      metadata: { captureFormId: form.id },
    };
    const settings = await getOrCreateLeadSettings(form.orgId);
    const scored = scoreLead(payload, { tradeTemplateKey: settings.tradeTemplateKey });
    const lead = await storage.createLead(form.orgId, {
      ...payload,
      urgency: scored.urgency,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
    } as any, null);

    await storage.createLeadActivity(form.orgId, lead.id, {
      type: "created",
      status: "new",
      subject: "Public lead captured",
      body: `Captured from ${form.name}.`,
      metadata: { captureFormId: form.id, score: scored.score },
      createdBy: null,
    });

    await recordInitialAutoResponse(form.orgId, lead);
    await scheduleDefaultFollowups(form.orgId, lead);

    return res.json({ ok: true, message: form.successMessage });
  } catch (err) {
    req.log?.error({ err: errMsg(err) }, "Public lead capture failed");
    return res.status(500).json({ error: "Lead capture failed. Please try again later." });
  }
});

router.get("/api/leads", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const filters = {
      status: typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : undefined,
      source: typeof req.query.source === "string" && req.query.source !== "all" ? req.query.source : undefined,
      search: typeof req.query.q === "string" ? req.query.q : undefined,
      hot: req.query.hot === "true",
    };
    const result = await storage.getLeads(req.session.orgId!, filters);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/stats", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    res.json(await storage.getLeadStats(req.session.orgId!));
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/settings", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const settings = await getOrCreateLeadSettings(orgId);
    const form = await storage.ensureDefaultLeadCaptureForm(orgId);
    res.json({ settings, captureForm: form, tradeTemplate: getLeadTradeTemplate(settings.tradeTemplateKey) || null });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/public/lead-source/:publicToken/:adapterKey", publicLeadCaptureLimiter, async (req: Request, res: Response) => {
  const adapterKey = String(req.params.adapterKey || "");
  try {
    const form = await storage.getLeadCaptureFormByToken(req.params.publicToken as string);
    if (!form) {
      return res.status(404).json({ error: "Lead source not found" });
    }
    if (!form.isEnabled) {
      await storage.createLeadSourceEvent(form.orgId, {
        captureFormId: form.id,
        adapterKey,
        status: "failed",
        leadId: null,
        error: "source_disabled",
        metadata: { reason: "source_disabled" },
      });
      return res.status(404).json({ error: "Lead source not found" });
    }

    const adapter = getLeadSourceAdapter(adapterKey);
    if (!adapter) {
      await storage.createLeadSourceEvent(form.orgId, {
        captureFormId: form.id,
        adapterKey,
        status: "failed",
        leadId: null,
        error: "adapter_not_supported",
        metadata: { adapterKey },
      });
      return res.status(400).json({ error: "Lead source adapter is not supported" });
    }

    let normalized: NormalizedLeadSourcePayload;
    try {
      normalized = adapter.normalize(req.body);
    } catch (err) {
      await storage.createLeadSourceEvent(form.orgId, {
        captureFormId: form.id,
        adapterKey,
        status: "failed",
        leadId: null,
        error: errMsg(err),
        metadata: { adapterKey, reason: "normalization_failed" },
      });
      return res.status(400).json({ error: errMsg(err) });
    }

    const lead = await createLeadFromAdapterPayload(form.orgId, {
      ...normalized,
      sourceDetail: normalized.sourceDetail || form.sourceLabel,
      serviceType: normalized.serviceType || form.defaultServiceType || "",
      metadata: {
        ...normalized.metadata,
        adapterKey,
      },
    }, form.id);

    await storage.createLeadSourceEvent(form.orgId, {
      captureFormId: form.id,
      adapterKey,
      status: "success",
      leadId: lead.id,
      error: null,
      metadata: {
        adapterKey,
        source: lead.source,
        sourceDetail: lead.sourceDetail,
        hasPhone: !!lead.phone,
        hasEmail: !!lead.email,
        serviceType: lead.serviceType || null,
      },
    });

    return res.json({ ok: true, message: form.successMessage });
  } catch (err) {
    req.log?.error({ err: errMsg(err), adapterKey }, "Lead source adapter intake failed");
    return res.status(500).json({ error: "Lead source intake failed. Please try again later." });
  }
});

router.get("/api/leads/trade-templates", requireAuth, requireOrg, async (_req: Request, res: Response) => {
  res.json(LEAD_TRADE_TEMPLATES);
});

router.get("/api/leads/source-adapters", requireAuth, requireOrg, async (_req: Request, res: Response) => {
  res.json(getPublicLeadSourceAdapters());
});

router.get("/api/leads/provider-status", requireAuth, requireOrg, async (_req: Request, res: Response) => {
  try {
    const status = await getLeadMessagingProviderStatus();
    res.json({
      twilio: { configured: status.twilioConfigured, fromPhoneConfigured: status.twilioFromPhoneConfigured },
      sendgrid: { configured: status.sendgridConfigured, fromEmailConfigured: status.sendgridFromEmailConfigured },
      openai: { configured: status.openaiConfigured, mode: status.openaiMode },
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/operator-dashboard", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const leads = await storage.getLeads(orgId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const activeLeads = leads.filter((lead) => !["converted", "lost", "spam"].includes(lead.status));

    const hotLeads = activeLeads
      .filter((lead) => lead.score >= 75)
      .sort((a, b) => b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);

    const needsContact = activeLeads
      .filter((lead) => lead.status === "new" && !lead.lastContactedAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 6);

    const followUpsDueToday = activeLeads
      .filter((lead) => {
        if (!lead.nextFollowUpAt) return false;
        const dueAt = new Date(lead.nextFollowUpAt);
        return dueAt >= startOfToday && dueAt < endOfToday;
      })
      .sort((a, b) => new Date(a.nextFollowUpAt || 0).getTime() - new Date(b.nextFollowUpAt || 0).getTime())
      .slice(0, 6);

    const overdueFollowUps = activeLeads
      .filter((lead) => {
        if (!lead.nextFollowUpAt) return false;
        return new Date(lead.nextFollowUpAt) < now;
      })
      .sort((a, b) => new Date(a.nextFollowUpAt || 0).getTime() - new Date(b.nextFollowUpAt || 0).getTime())
      .slice(0, 6);

    const recentlyCaptured = [...leads]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);

    const recentlyConverted = leads
      .filter((lead) => lead.status === "converted" || lead.convertedAt)
      .sort((a, b) => new Date(b.convertedAt || b.updatedAt).getTime() - new Date(a.convertedAt || a.updatedAt).getTime())
      .slice(0, 6);

    const failedAttempts: Array<{
      id: string;
      leadId: string;
      leadName: string;
      channel: string | null;
      reason: string;
      createdAt: Date;
    }> = [];

    for (const lead of leads.slice(0, 100)) {
      const [activities, tasks] = await Promise.all([
        storage.getLeadActivities(orgId, lead.id),
        storage.getLeadFollowupTasks(orgId, lead.id),
      ]);

      activities
        .filter((activity) => activity.error || activity.status === "failed")
        .forEach((activity) => {
          failedAttempts.push({
            id: activity.id,
            leadId: lead.id,
            leadName: lead.name,
            channel: activity.channel,
            reason: activity.error || activity.subject || "Message attempt failed",
            createdAt: activity.createdAt,
          });
        });

      tasks
        .filter((task) => task.status === "failed")
        .forEach((task) => {
          failedAttempts.push({
            id: task.id,
            leadId: lead.id,
            leadName: lead.name,
            channel: task.channel,
            reason: task.error || "Follow-up attempt failed",
            createdAt: task.lastAttemptAt || task.updatedAt || task.createdAt,
          });
        });
    }

    failedAttempts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      hotLeads,
      needsContact,
      followUpsDueToday,
      overdueFollowUps,
      recentlyCaptured,
      recentlyConverted,
      failedAttempts: failedAttempts.slice(0, 8),
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/leads/settings", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = leadSettingsSchema.safeParse(req.body?.settings || req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid lead settings" });
    }
    if (parsed.data.tradeTemplateKey && !isLeadTradeKey(parsed.data.tradeTemplateKey)) {
      return res.status(400).json({ error: "Invalid trade template" });
    }
    const settings = await storage.upsertLeadSettings(req.session.orgId!, {
      ...parsed.data,
      notificationEmail: parsed.data.notificationEmail || null,
      tradeTemplateKey: parsed.data.tradeTemplateKey || null,
      serviceArea: parsed.data.serviceArea || null,
      leadSources: parsed.data.leadSources || [],
      smsComplianceFooter: parsed.data.smsComplianceFooter || "Reply STOP to opt out.",
    });
    res.json(settings);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/settings/apply-template", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = z.object({
      tradeTemplateKey: z.string().trim().min(1),
      serviceArea: z.string().trim().optional().nullable(),
      leadSources: z.array(z.string().trim().min(1)).optional().nullable(),
    }).safeParse(req.body || {});
    if (!parsed.success || !isLeadTradeKey(parsed.data.tradeTemplateKey)) {
      return res.status(400).json({ error: "Invalid trade template" });
    }

    const template = getLeadTradeTemplate(parsed.data.tradeTemplateKey)!;
    const settings = await storage.upsertLeadSettings(req.session.orgId!, {
      tradeTemplateKey: template.tradeKey,
      serviceArea: parsed.data.serviceArea || null,
      leadSources: parsed.data.leadSources?.length ? parsed.data.leadSources : template.defaultLeadSources,
      defaultSmsTemplate: template.defaultSmsTemplate,
      defaultEmailSubject: template.defaultEmailSubject,
      defaultEmailTemplate: template.defaultEmailTemplate,
      hotLeadThreshold: 75,
      dryRun: true,
    });

    res.json({ settings, tradeTemplate: template });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/leads/capture-form/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = captureFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid capture form" });
    }
    const form = await storage.updateLeadCaptureForm(req.session.orgId!, req.params.id as string, {
      ...parsed.data,
      defaultServiceType: parsed.data.defaultServiceType || null,
    } as any);
    if (!form) return res.status(404).send("Lead capture form not found");
    res.json(form);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/source-events", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === "string" ? Math.min(100, Math.max(1, Number(req.query.limit) || 25)) : 25;
    res.json(await storage.getLeadSourceEvents(req.session.orgId!, limit));
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const lead = await storage.getLead(req.session.orgId!, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    res.json(lead);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = leadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid lead" });
    }
    const payload = toLeadPayload(parsed.data);
    const tradeTemplate = await getActiveLeadTemplate(req.session.orgId!);
    const scored = scoreLead(payload, { template: tradeTemplate });
    const lead = await storage.createLead(req.session.orgId!, {
      ...payload,
      urgency: scored.urgency,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
    } as any, req.session.userId || null);

    await storage.createLeadActivity(req.session.orgId!, lead.id, {
      type: "created",
      status: lead.status,
      subject: "Lead created",
      body: `Lead created from ${lead.source}.`,
      metadata: { score: scored.score, recommendedAction: scored.recommendedAction },
      createdBy: req.session.userId || null,
    });
    await scheduleDefaultFollowups(req.session.orgId!, lead);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "create", entity: "lead", entityId: lead.id, after: lead });
    res.json(lead);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/leads/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const before = await storage.getLead(orgId, req.params.id as string);
    if (!before) return res.status(404).send("Lead not found");

    const parsed = leadBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid lead" });
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    if ("email" in patch && patch.email === "") patch.email = "";
    if ("nextFollowUpAt" in patch) patch.nextFollowUpAt = patch.nextFollowUpAt ? new Date(String(patch.nextFollowUpAt)) : null;
    if ("estimatedValue" in patch) patch.estimatedValue = patch.estimatedValue == null || patch.estimatedValue === "" ? null : String(patch.estimatedValue);
    if (
      parsed.data.status &&
      ["contacted", "qualified", "follow_up"].includes(parsed.data.status) &&
      !before.lastContactedAt
    ) {
      patch.lastContactedAt = new Date();
    }

    const updated = await storage.updateLead(orgId, before.id, patch as any);
    if (!updated) return res.status(404).send("Lead not found");

    if (parsed.data.status && parsed.data.status !== before.status) {
      await storage.createLeadActivity(orgId, updated.id, {
        type: "status_change",
        status: updated.status,
        subject: "Status changed",
        body: `${before.status} -> ${updated.status}`,
        metadata: { from: before.status, to: updated.status },
        createdBy: req.session.userId || null,
      });
    }

    await storage.recordAudit({ orgId, userId: req.session.userId, action: "update", entity: "lead", entityId: updated.id, before, after: updated });
    res.json(updated);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/leads/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const before = await storage.getLead(orgId, req.params.id as string);
    if (!before) return res.status(404).send("Lead not found");
    await storage.softDeleteLead(orgId, before.id);
    await storage.recordAudit({ orgId, userId: req.session.userId, action: "delete", entity: "lead", entityId: before.id, before });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/:id/activities", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    res.json(await storage.getLeadActivities(orgId, lead.id));
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/:id/followups", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    res.json(await storage.getLeadFollowupTasks(orgId, lead.id));
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/:id/activities", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    const parsed = activityBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid activity" });
    const activity = await storage.createLeadActivity(orgId, lead.id, { ...parsed.data, createdBy: req.session.userId || null });
    res.json(activity);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/:id/score", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    const tradeTemplate = await getActiveLeadTemplate(orgId);
    const scored = scoreLead(lead, { template: tradeTemplate });
    const updated = await storage.updateLead(orgId, lead.id, {
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      urgency: scored.urgency,
    } as any);
    await storage.createLeadActivity(orgId, lead.id, {
      type: "score_change",
      status: "scored",
      subject: "Lead score refreshed",
      body: `Score updated from ${lead.score} to ${scored.score}. ${scored.recommendedAction}`,
      metadata: scored.breakdown,
      createdBy: req.session.userId || null,
    });
    res.json({ lead: updated, score: scored });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/:id/send-sms", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    const parsed = smsBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid SMS request" });
    const org = await storage.getOrg(orgId);
    const settings = await getOrCreateLeadSettings(orgId);
    const template = parsed.data.template || settings.defaultSmsTemplate || "Hi {name}, this is {business}. We received your request about {service}. What is the best time to follow up?";
    const result = await sendLeadSms({ orgId, lead, org, template, createdBy: req.session.userId || null });
    res.json({ ...result, dryRun: result.mode === "dry-run" });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/:id/send-email", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    const parsed = emailBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid email request" });
    const org = await storage.getOrg(orgId);
    const settings = await getOrCreateLeadSettings(orgId);
    const subject = parsed.data.subject || settings.defaultEmailSubject || `Following up from ${org?.name || "TradeFlow"}`;
    const template = parsed.data.template || settings.defaultEmailTemplate || "Hi {name}, thanks for reaching out about {service}. We can help qualify the request and get you booked.";
    const result = await sendLeadEmail({ orgId, lead, org, subject, template, createdBy: req.session.userId || null });
    res.json({ ...result, dryRun: result.mode === "dry-run" });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/test-message", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = testMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid test message" });
    const orgId = req.session.orgId!;
    const org = await storage.getOrg(orgId);
    const result = await sendLeadTestMessage({
      orgId,
      org,
      channel: parsed.data.channel,
      to: parsed.data.to,
      subject: parsed.data.subject,
      template: parsed.data.template,
    });
    await storage.recordAudit({
      orgId,
      userId: req.session.userId,
      action: "test_message",
      entity: "lead_message_provider",
      after: {
        channel: parsed.data.channel,
        mode: result.mode,
        ok: result.ok,
        reason: result.reason,
        recipient: parsed.data.to,
      },
    });
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/leads/:id/convert", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const lead = await storage.getLead(orgId, req.params.id as string);
    if (!lead) return res.status(404).send("Lead not found");
    if (lead.status === "converted" && lead.jobId) return res.status(400).json({ error: "Lead is already converted." });

    const jobLimit = await checkPlanLimit(orgId, "jobs");
    if (!jobLimit.allowed) {
      return res.status(403).json({ error: `Job limit reached (${jobLimit.limit}). Upgrade your plan to convert more leads.` });
    }

    if (await conversionWouldCreateCustomer(orgId, lead.id)) {
      const customerLimit = await checkPlanLimit(orgId, "customers");
      if (!customerLimit.allowed) {
        return res.status(403).json({ error: `Customer limit reached (${customerLimit.limit}). Upgrade your plan to convert new customers.` });
      }
    }

    const result = await storage.convertLeadToCustomerAndJob(orgId, lead.id, { createdBy: req.session.userId || null });
    await storage.recordAudit({ orgId, userId: req.session.userId, action: "convert", entity: "lead", entityId: lead.id, before: lead, after: result.lead });
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
