import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";

const router = Router();

router.get("/api/audit-log", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const org = await storage.getOrg(orgId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    if (org.plan !== "enterprise") {
      return res.status(403).json({ error: "Audit log access is available on the Enterprise plan." });
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50")) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0")) || 0, 0);
    const entity = req.query.entity ? String(req.query.entity) : undefined;
    const action = req.query.action ? String(req.query.action) : undefined;
    const userId = req.query.userId ? String(req.query.userId) : undefined;

    const result = await storage.getAuditLog(orgId, { limit, offset, entity, action, userId });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
