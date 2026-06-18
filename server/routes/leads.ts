import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { storage } from "../storage";
import { scoreLead } from "../leadScoring";
import { isTwilioConfigured } from "../twilioClient";
import {
  recordDryRunEmailActivity,
  recordDryRunSmsActivity,
  renderLeadTemplate,
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

const leadSettingsSchema = z.object({
  autoRespond: z.boolean().optional(),
  followUpEnabled: z.boolean().optional(),
  hotLeadThreshold: z.number().int().min(0).max(100).optional(),
  dryRun: z.boolean().optional(),
  defaultSmsTemplate: z.string().trim().optional().nullable(),
  defaultEmailSubject: z.string().trim().optional().nullable(),
  defaultEmailTemplate: z.string().trim().optional().nullable(),
  notificationPhone: z.string().trim().optional().nullable(),
  notificationEmail: z.string().trim().email("Invalid notification email").optional().or(z.literal("")).nullable(),
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

async function scheduleDefaultFollowups(orgId: string, lead: any) {
  const settings = await getOrCreateLeadSettings(orgId);
  if (!settings.followUpEnabled) return;
  const channel = selectFollowupChannel(lead);
  if (!channel) return;
  const template = channel === "sms"
    ? settings.defaultSmsTemplate || DEFAULT_SMS_TEMPLATE
    : settings.defaultEmailTemplate || DEFAULT_EMAIL_TEMPLATE;

  await storage.createLeadFollowupTask(orgId, lead.id, {
    stepNumber: 1,
    channel,
    dueAt: plusDays(1),
    status: "pending",
    messageTemplate: template,
    lastAttemptAt: null,
    completedAt: null,
    error: null,
  });
  await storage.createLeadFollowupTask(orgId, lead.id, {
    stepNumber: 2,
    channel,
    dueAt: plusDays(3),
    status: "pending",
    messageTemplate: template,
    lastAttemptAt: null,
    completedAt: null,
    error: null,
  });
}

async function recordInitialAutoResponse(orgId: string, lead: any) {
  const settings = await getOrCreateLeadSettings(orgId);
  if (!settings.autoRespond) return;
  const org = await storage.getOrg(orgId);
  if (lead.consentToSms && lead.phone?.trim()) {
    const body = renderLeadTemplate(settings.defaultSmsTemplate || DEFAULT_SMS_TEMPLATE, lead, org);
    await recordDryRunSmsActivity({ orgId, lead, body, createdBy: null });
    return;
  }
  if (lead.email?.trim()) {
    const subject = renderLeadTemplate(settings.defaultEmailSubject || DEFAULT_EMAIL_SUBJECT, lead, org);
    const body = renderLeadTemplate(settings.defaultEmailTemplate || DEFAULT_EMAIL_TEMPLATE, lead, org);
    await recordDryRunEmailActivity({ orgId, lead, subject, body, createdBy: null });
  }
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
    const scored = scoreLead(payload);
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
    res.json({ settings, captureForm: form });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/leads/provider-status", requireAuth, requireOrg, async (_req: Request, res: Response) => {
  try {
    const twilioConfigured = await isTwilioConfigured();
    res.json({
      twilio: { configured: twilioConfigured },
      sendgrid: { configured: !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) },
      openai: { configured: !!process.env.OPENAI_API_KEY, mode: process.env.OPENAI_API_KEY ? "openai" : "fallback" },
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
    const settings = await storage.upsertLeadSettings(req.session.orgId!, {
      ...parsed.data,
      notificationEmail: parsed.data.notificationEmail || null,
    });
    res.json(settings);
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
    const scored = scoreLead(payload);
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
    const scored = scoreLead(lead);
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
    const template = parsed.data.template || "Hi {name}, this is {business}. We received your request about {service}. What is the best time to follow up?";
    const body = renderLeadTemplate(template, lead, org);
    const activity = await recordDryRunSmsActivity({ orgId, lead, body, createdBy: req.session.userId || null });
    res.json({ ok: true, dryRun: true, activity });
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
    const subject = parsed.data.subject || `Following up from ${org?.name || "TradeFlow"}`;
    const template = parsed.data.template || "Hi {name}, thanks for reaching out about {service}. We can help qualify the request and get you booked.";
    const body = renderLeadTemplate(template, lead, org);
    const activity = await recordDryRunEmailActivity({ orgId, lead, subject, body, createdBy: req.session.userId || null });
    res.json({ ok: true, dryRun: true, activity });
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
