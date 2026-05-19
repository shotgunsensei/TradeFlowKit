import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, resolveRequestAccess } from "../middleware";
import { hasFeature } from "@shared/entitlements";
import { sendSMS, getTwilioPhoneNumber } from "../twilioClient";

const router = Router();

router.get("/api/review-requests", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const rawLimit = parseInt(req.query.limit as string);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 25, 1), 100);
    const rawOffset = parseInt(req.query.offset as string);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
    const sort = req.query.sort === "asc" ? "asc" : "desc";
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam ? new Date(toParam) : undefined;
    const result = await storage.getReviewRequests(req.session.orgId!, {
      limit,
      offset,
      sort,
      from: from && !isNaN(from.getTime()) ? from : undefined,
      to: to && !isNaN(to.getTime()) ? to : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/review-requests/stats", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const count = await storage.getReviewRequestCountThisMonth(req.session.orgId!);
    res.json({ countThisMonth: count });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/review-requests/job/:jobId", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const rr = await storage.getReviewRequestByJobId(req.session.orgId!, jobId);
    res.json(rr || null);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/review-requests", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const { jobId } = req.body || {};
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).send("jobId is required");
    }

    const job = await storage.getJob(orgId, jobId);
    if (!job) return res.status(404).send("Job not found");

    const org = await storage.getOrg(orgId);
    if (!org) return res.status(404).send("Org not found");

    const ctx = await resolveRequestAccess(req);
    if (!ctx || !hasFeature(ctx.access, "review_requests")) {
      return res.status(403).json({
        error: "feature_not_in_plan",
        feature: "review_requests",
        linked: ctx?.access.linked ?? false,
        planSlug: ctx?.access.planSlug ?? null,
        message: "Your plan does not include review requests.",
      });
    }
    if (!org.reviewRequestEnabled || !org.reviewRequestUrl) {
      return res.status(400).send("Review requests are not configured for this org");
    }

    const existing = await storage.getReviewRequestByJobId(orgId, jobId);
    if (existing) {
      return res.status(409).send("Review request already sent for this job");
    }

    if (!job.customerId) {
      return res.status(400).send("Job has no customer");
    }
    const customer = await storage.getCustomer(orgId, job.customerId);
    const phone = customer?.phone?.trim();
    if (!customer || !phone || phone.length < 7) {
      return res.status(400).send("Customer has no valid phone number");
    }

    const template = org.reviewRequestTemplate ||
      "Hi {customer}, thanks for choosing {business}! We'd love your feedback. Please leave us a review: {google_link}";
    const message = template
      .replace("{customer}", customer.name || "")
      .replace("{business}", org.name || "")
      .replace("{google_link}", org.reviewRequestUrl);

    const fromPhone = await getTwilioPhoneNumber();
    if (!fromPhone) {
      return res.status(503).send("SMS sender is not configured");
    }
    const smsSent = await sendSMS(phone, fromPhone, message);
    if (!smsSent) {
      return res.status(502).send("Failed to send SMS");
    }

    const rr = await storage.createReviewRequest({
      orgId,
      jobId,
      customerId: job.customerId,
      phoneNumber: phone,
      reviewUrl: org.reviewRequestUrl,
    });

    res.json(rr);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
