import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";

const router = Router();

router.get("/api/review-requests/stats", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const count = await storage.getReviewRequestCountThisMonth(req.session.orgId!);
    res.json({ countThisMonth: count });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.get("/api/review-requests/job/:jobId", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const rr = await storage.getReviewRequestByJobId(req.session.orgId!, jobId);
    res.json(rr || null);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
