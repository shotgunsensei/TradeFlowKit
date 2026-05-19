import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { sendSMS, isTwilioConfigured, getTwilioPhoneNumber } from "../twilioClient";
import { randomUUID } from "crypto";
import { logger as rootLogger } from "../logger";

const log = rootLogger.child({ component: "jobs-route" });

const router = Router();

const JOB_STATUSES = ["lead", "quoted", "scheduled", "in_progress", "done", "invoiced", "paid", "canceled"] as const;
const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) });
const bulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
  status: z.enum(JOB_STATUSES),
});

const TERMINAL_STATUSES = new Set(["done", "invoiced", "paid", "canceled"]);

function canUseRecurring(plan: string): boolean {
  return plan === "small_business" || plan === "enterprise";
}

/**
 * OperatorOS-aware variant of {@link canUseRecurring}. For linked orgs the
 * legacy `org.plan` is meaningless — recurring entitlement is whatever
 * `resolveAccess()` derived from the tenant snapshot.
 */
async function canUseRecurringForOrg(orgId: string): Promise<boolean> {
  const { resolveAccess, isLinkedOrg } = await import("@shared/entitlements");
  const org = await storage.getOrg(orgId);
  if (!org) return false;
  if (isLinkedOrg(org)) {
    // Tenant-level feature check — pass a fully-allowed synthetic membership
    // so we read the tenant features without granting any user privilege
    // (we only inspect access.features, never access.allowed).
    const synthetic: Parameters<typeof resolveAccess>[1] = {
      role: "owner",
      moduleRole: "module_admin",
      enabled: true,
      userEntitlementSnapshot: null,
    };
    const access = resolveAccess(org, synthetic);
    return access.features.recurring_jobs === true;
  }
  return canUseRecurring(org.plan);
}

function calcNextScheduledStart(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "annually":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

router.get("/api/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const recurringOnly = req.query.recurring === "true";
    const result = await storage.getJobs(req.session.orgId!, recurringOnly);
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const j = await storage.getJob(req.session.orgId!, req.params.id as string);
    if (!j) return res.status(404).send("Job not found");
    res.json(j);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/jobs/:id/events", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const events = await storage.getJobEvents(req.session.orgId!, req.params.id as string);
    res.json(events);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/jobs/:id/series", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const job = await storage.getJob(req.session.orgId!, req.params.id as string);
    if (!job) return res.status(404).send("Job not found");
    if (!job.recurringSeriesId) return res.json([]);
    const allJobs = await storage.getJobs(req.session.orgId!);
    const series = allJobs.filter((j) => j.recurringSeriesId === job.recurringSeriesId);
    res.json(series);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const planCheck = await checkPlanLimit(req.session.orgId!, "jobs");
    if (!planCheck.allowed) {
      return res.status(403).json({
        error: `Job limit reached (${planCheck.limit}). Upgrade your plan to add more jobs.`,
        limitReached: true,
        resource: "jobs",
        current: planCheck.current,
        limit: planCheck.limit,
      });
    }
    const data = { ...req.body };
    data.customerId = data.customerId || null;
    data.scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
    data.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;

    const org = await storage.getOrg(req.session.orgId!);
    if (!org || !(await canUseRecurringForOrg(org.id))) {
      data.isRecurring = false;
      data.recurringFrequency = null;
      data.parentJobId = null;
      data.recurringSeriesId = null;
    } else if (data.isRecurring && !data.recurringSeriesId) {
      data.recurringSeriesId = randomUUID();
    }

    const j = await storage.createJob(req.session.orgId!, data, req.session.userId!);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "create", entity: "job", entityId: j.id, after: j });
    res.json(j);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const jobId = req.params.id as string;

    const existingJob = await storage.getJob(orgId, jobId);
    if (!existingJob) return res.status(404).send("Job not found");
    const oldStatus = existingJob.status;
    const before = existingJob;

    const data = { ...req.body };
    if ("scheduledStart" in data) data.scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
    if ("scheduledEnd" in data) data.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
    if ("customerId" in data) data.customerId = data.customerId || null;

    const org = await storage.getOrg(orgId);
    if (!org || !(await canUseRecurringForOrg(orgId))) {
      delete data.isRecurring;
      delete data.recurringFrequency;
      delete data.parentJobId;
      delete data.recurringSeriesId;
    }

    const j = await storage.updateJob(orgId, jobId, data);
    if (!j) return res.status(404).send("Job not found");
    await storage.recordAudit({ orgId, userId: req.session.userId, action: "update", entity: "job", entityId: j.id, before, after: j });

    const newStatus = data.status;
    const wasAlreadyTerminal = TERMINAL_STATUSES.has(oldStatus);

    if (newStatus && ["done", "paid"].includes(newStatus) && oldStatus !== newStatus) {
      try {
        const orgPlan = org?.plan || "free";
        const planAllowed = ["individual", "small_business", "enterprise"].includes(orgPlan);

        if (planAllowed && org?.reviewRequestEnabled && org?.reviewRequestUrl) {
          const alreadySent = await storage.getReviewRequestByJobId(orgId, jobId);
          if (!alreadySent && j.customerId) {
            const customer = await storage.getCustomer(orgId, j.customerId);
            const phone = customer?.phone?.trim();
            if (customer && phone && phone.length >= 7) {
              const template = org.reviewRequestTemplate ||
                "Hi {customer}, thanks for choosing {business}! We'd love your feedback. Please leave us a review: {google_link}";
              const message = template
                .replace("{customer}", customer.name || "")
                .replace("{business}", org.name || "")
                .replace("{google_link}", org.reviewRequestUrl);

              const fromPhone = await getTwilioPhoneNumber();
              let smsSent = false;
              if (fromPhone) {
                smsSent = await sendSMS(phone, fromPhone, message);
                if (!smsSent) {
                  log.warn({ phone, jobId }, "Review request SMS failed to send");
                }
              } else {
                log.info({ phone, jobId }, "Twilio not configured — review request SMS not sent");
              }

              if (smsSent) {
                await storage.createReviewRequest({
                  orgId,
                  jobId,
                  customerId: j.customerId,
                  phoneNumber: phone,
                  reviewUrl: org.reviewRequestUrl,
                });
              }
            }
          }
        }
      } catch (reviewErr) {
        log.error({ err: reviewErr, msg: errMsg(reviewErr), jobId }, "Review request error (non-fatal)");
      }
    }

    if (newStatus && (newStatus === "done" || newStatus === "invoiced") && !wasAlreadyTerminal) {
      if (j.isRecurring && j.recurringFrequency) {
        try {
          if (org && (await canUseRecurringForOrg(org.id))) {
            const baseStart = j.scheduledStart ? new Date(j.scheduledStart) : new Date();
            const nextStart = calcNextScheduledStart(baseStart, j.recurringFrequency);
            let nextEnd: Date | null = null;
            if (j.scheduledEnd) {
              const duration = new Date(j.scheduledEnd).getTime() - baseStart.getTime();
              nextEnd = new Date(nextStart.getTime() + duration);
            }
            const seriesId = j.recurringSeriesId || randomUUID();
            await storage.createJob(
              orgId,
              {
                customerId: j.customerId,
                title: j.title,
                description: j.description || "",
                status: "scheduled",
                priority: j.priority,
                scheduledStart: nextStart,
                scheduledEnd: nextEnd,
                assignedUserIds: j.assignedUserIds || [],
                internalNotes: j.internalNotes || "",
                isRecurring: true,
                recurringFrequency: j.recurringFrequency,
                parentJobId: j.id,
                recurringSeriesId: seriesId,
              },
              req.session.userId!
            );
            if (!j.recurringSeriesId) {
              await storage.updateJob(orgId, j.id, { recurringSeriesId: seriesId });
            }
          }
        } catch (recurringErr) {
          log.error({ err: recurringErr, msg: errMsg(recurringErr), jobId }, "Recurring job creation error (non-fatal)");
        }
      }
    }

    res.json(j);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const before = await storage.getJob(req.session.orgId!, req.params.id as string);
    await storage.deleteJob(req.session.orgId!, req.params.id as string);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "delete", entity: "job", entityId: req.params.id as string, before });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

const importJobRowSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  customerName: z.string().trim().optional().default(""),
  description: z.string().optional().default(""),
  status: z.enum(JOB_STATUSES).optional(),
  priority: z.enum(["low", "normal", "urgent"]).optional(),
  scheduledStart: z.string().optional().default(""),
  scheduledEnd: z.string().optional().default(""),
  internalNotes: z.string().optional().default(""),
});

function parseImportDate(value: string): Date | null {
  const v = (value || "").trim();
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

router.post("/api/jobs/import", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const rows = req.body?.jobs;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No jobs provided" });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: "Maximum 1000 rows per import" });
    }

    const planCheck = await checkPlanLimit(orgId, "jobs");
    if (planCheck.limit !== -1) {
      const remaining = planCheck.limit - planCheck.current;
      if (remaining <= 0) {
        return res.status(403).json({
          error: `Job limit reached (${planCheck.limit}). Upgrade your plan to add more jobs.`,
          limitReached: true,
        });
      }
      if (rows.length > remaining) {
        return res.status(403).json({
          error: `Import would exceed your plan limit. You can add ${remaining} more job(s) on your current plan.`,
          limitReached: true,
        });
      }
    }

    const customers = await storage.getCustomers(orgId);
    const customerByName = new Map<string, string>();
    for (const c of customers) {
      customerByName.set(c.name.trim().toLowerCase(), c.id);
    }

    let imported = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = importJobRowSchema.safeParse(rows[i] ?? {});
      if (!parsed.success) {
        errors.push({ row: i + 2, error: parsed.error.errors[0]?.message || "Invalid row" });
        continue;
      }
      const r = parsed.data;
      const customerKey = (r.customerName || "").trim().toLowerCase();
      const customerId = customerKey ? customerByName.get(customerKey) || null : null;
      if (customerKey && !customerId) {
        errors.push({ row: i + 2, error: `Customer "${r.customerName}" not found` });
        continue;
      }

      try {
        await storage.createJob(
          orgId,
          {
            customerId,
            title: r.title,
            description: r.description || "",
            status: r.status || "lead",
            priority: r.priority || "normal",
            scheduledStart: parseImportDate(r.scheduledStart),
            scheduledEnd: parseImportDate(r.scheduledEnd),
            assignedUserIds: [],
            internalNotes: r.internalNotes || "",
            isRecurring: false,
            recurringFrequency: null,
            parentJobId: null,
            recurringSeriesId: null,
          } as any,
          req.session.userId!,
        );
        imported++;
      } catch (err: any) {
        errors.push({ row: i + 2, error: err.message });
      }
    }

    res.json({ imported, skipped: 0, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/jobs/bulk-delete", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const updated = await storage.bulkDeleteJobs(req.session.orgId!, parsed.data.ids);
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/jobs/bulk-restore", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ids" });
    const restored = await storage.bulkRestoreJobs(req.session.orgId!, parsed.data.ids);
    res.json({ restored });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/jobs/bulk-status", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const updated = await storage.bulkUpdateJobStatus(
      req.session.orgId!,
      parsed.data.ids,
      parsed.data.status,
      req.session.userId ?? null,
    );
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
