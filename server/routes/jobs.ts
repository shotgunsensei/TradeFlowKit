import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkPlanLimit } from "../middleware";
import { sendSMS, isTwilioConfigured, getTwilioPhoneNumber } from "../twilioClient";

const router = Router();

router.get("/api/jobs", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const result = await storage.getJobs(req.session.orgId!);
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
    const j = await storage.updateJob(orgId, jobId, data);
    if (!j) return res.status(404).send("Job not found");

    const newStatus = data.status;
    const triggerStatuses = ["done", "paid"];
    const isStatusTrigger = newStatus && triggerStatuses.includes(newStatus) && oldStatus !== newStatus;

    if (isStatusTrigger) {
      try {
        const org = await storage.getOrg(orgId);
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
