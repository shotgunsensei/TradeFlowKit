import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireSuperAdmin } from "../middleware";

const router = Router();

router.get("/api/admin/orgs", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const allOrgs = await storage.getAllOrgs();
    const orgsWithCounts = await Promise.all(
      allOrgs.map(async (org) => {
        const counts = await storage.getOrgCounts(org.id);
        const mems = await storage.getOrgMemberships(org.id);
        return { ...org, counts, memberCount: mems.length };
      })
    );
    res.json(orgsWithCounts);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/admin/orgs/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { plan, subscriptionStatus, ...otherData } = req.body;
    const updateData: Record<string, unknown> = { ...otherData };
    if (plan) updateData.plan = plan;
    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;

    const org = await storage.updateOrg(req.params.id as string, updateData);
    if (!org) return res.status(404).send("Organization not found");
    res.json(org);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/admin/orgs/:id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    await storage.deleteOrg(req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/admin/orgs/:id/members", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const mems = await storage.getOrgMemberships(req.params.id as string);
    const membersWithUsers = await Promise.all(
      mems.map(async (m) => {
        const user = await storage.getUser(m.userId);
        return { ...m, user: user ? { ...user, password: undefined } : null };
      })
    );
    res.json(membersWithUsers);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete(
  "/api/admin/orgs/:orgId/members/:userId",
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      await storage.deleteMembership(req.params.orgId as string, req.params.userId as string);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).send(errMsg(err));
    }
  }
);

router.get("/api/admin/users", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map((u) => ({ ...u, password: undefined })));
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
