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

    const before = await storage.getOrg(req.params.id as string);
    // OperatorOS-linked orgs may not have their TFK `plan` flipped from the
    // master-admin panel — OperatorOS is the source of truth. Other fields
    // (e.g. callRecoveryPlan) remain editable.
    if (plan && (before?.operatorosTenantId || before?.operatorosOrganizationId)) {
      return res.status(410).json({
        error: "managed_by_operatoros",
        message: "Plan changes for OperatorOS-linked organizations must be made in OperatorOS.",
      });
    }
    if (plan) updateData.plan = plan;
    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;
    const org = await storage.updateOrg(req.params.id as string, updateData);
    if (!org) return res.status(404).send("Organization not found");
    await storage.recordAudit({ orgId: org.id, userId: req.session.userId, action: "update", entity: "organization", entityId: org.id, before, after: org });
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
      const before = await storage.getMembership(req.params.orgId as string, req.params.userId as string);
      await storage.deleteMembership(req.params.orgId as string, req.params.userId as string);
      await storage.recordAudit({ orgId: req.params.orgId as string, userId: req.session.userId, action: "delete", entity: "membership", entityId: req.params.userId as string, before: before ? { userId: before.userId, role: before.role } : undefined });
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
