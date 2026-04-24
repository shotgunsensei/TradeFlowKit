import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { sendSMS, isTwilioConfigured, getTwilioPhoneNumber } from "../twilioClient";
import { randomUUID } from "crypto";

const router = Router();

const TERMINAL_STATUSES = new Set(["done", "invoiced", "paid", "canceled"]);

function canUseRecurring(plan: string): boolean {
  return plan === "small_business" || plan === "enterprise";
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
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.get("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const j = await storage.getJob(req.session.orgId!, req.params.id as string);
    if (!j) return res.status(404).send("Job not found");
    res.json(j);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.get("/api/jobs/:id/events", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const events = await storage.getJobEvents(req.session.orgId!, req.params.id as string);
    res.json(events);
  } catch (err: any) {
    res.status(500).send(err.message);
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
  } catch (err: any) {
    res.status(500).send(err.message);
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
    if (!org || !canUseRecurring(org.plan)) {
      data.isRecurring = false;
      data.recurringFrequency = null;
      data.parentJobId = null;
      data.recurringSeriesId = null;
    } else if (data.isRecurring && !data.recurringSeriesId) {
      data.recurringSeriesId = randomUUID();
    }

    const j = await storage.createJob(req.session.orgId!, data, req.session.userId!);
    res.json(j);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.patch("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const jobId = req.params.id as string;

    const existingJob = await storage.getJob(orgId, jobId);
    if (!existingJob) return res.status(404).send("Job not found");
    const oldStatus = existingJob.status;

    const data = { ...req.body };
    if ("scheduledStart" in data) data.scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
    if ("scheduledEnd" in data) data.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
    if ("customerId" in data) data.customerId = data.customerId || null;

    const org = await storage.getOrg(orgId);
    if (!org || !canUseRecurring(org.plan)) {
      delete data.isRecurring;
      delete data.recurringFrequency;
      delete data.parentJobId;
      delete data.recurringSeriesId;
    }

    const j = await storage.updateJob(orgId, jobId, data);
    if (!j) return res.status(404).send("Job not found");

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
                  console.warn(`[ReviewRequest] SMS failed to send to ${phone} for job ${jobId}`);
                }
              } else {
                console.log(`[ReviewRequest] Twilio not configured — SMS not sent. Would have sent to ${phone}: ${message}`);
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
      } catch (reviewErr: any) {
        console.error("Review request error (non-fatal):", reviewErr.message);
      }
    }

    if (newStatus && (newStatus === "done" || newStatus === "invoiced") && !wasAlreadyTerminal) {
      if (j.isRecurring && j.recurringFrequency) {
        try {
          if (org && canUseRecurring(org.plan)) {
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
        } catch (recurringErr: any) {
          console.error("Recurring job creation error (non-fatal):", recurringErr.message);
        }
      }
    }

    res.json(j);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.delete("/api/jobs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    await storage.deleteJob(req.session.orgId!, req.params.id as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
