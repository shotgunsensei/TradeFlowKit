import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, checkTeamLimit } from "../middleware";

const router = Router();

router.post("/api/orgs", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, slug, phone, email, address } = req.body;
    if (!name) return res.status(400).send("Organization name required");

    const org = await storage.createOrg({
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      phone: phone || "",
      email: email || "",
      address: address || "",
    });

    await storage.createMembership(org.id, req.session.userId!, "owner");
    req.session.orgId = org.id;
    await storage.recordAudit({ orgId: org.id, userId: req.session.userId, action: "create", entity: "organization", entityId: org.id, after: org });
    await storage.recordAudit({ orgId: org.id, userId: req.session.userId, action: "create", entity: "membership", entityId: req.session.userId!, after: { userId: req.session.userId, role: "owner" } });
    res.json(org);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/orgs/:id", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    if (req.params.id !== req.session.orgId) {
      return res.status(403).send("Cannot edit another organization");
    }
    const {
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionStatus,
      currentPeriodEnd,
      operatorosOrganizationId,
      ...safeData
    } = req.body;
    const before = await storage.getOrg(req.params.id as string);
    const org = await storage.updateOrg(req.params.id as string, safeData);
    await storage.recordAudit({ orgId: req.params.id as string, userId: req.session.userId, action: "update", entity: "organization", entityId: req.params.id as string, before, after: org });
    res.json(org);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch(
  "/api/orgs/:id/operatoros-link",
  requireAuth,
  requireOrg,
  async (req: Request, res: Response) => {
    try {
      if (req.params.id !== req.session.orgId) {
        return res.status(403).send("Cannot edit another organization");
      }
      const user = await storage.getUser(req.session.userId!);
      const membership = await storage.getMembership(req.session.orgId!, req.session.userId!);
      const isOwner = membership?.role === "owner";
      const isSuperAdmin = !!user?.isSuperAdmin;
      if (!isOwner && !isSuperAdmin) {
        return res.status(403).send("Only the organization owner can change the OperatorOS link");
      }

      const raw = req.body?.operatorosOrganizationId;
      let value: string | null;
      if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
        value = null;
      } else if (typeof raw === "string") {
        value = raw.trim();
      } else {
        return res.status(400).send("OperatorOS organization id must be a string");
      }

      if (value !== null) {
        const existing = await storage.getOrgByOperatorosOrganizationId(value);
        if (existing && existing.id !== req.session.orgId) {
          return res
            .status(409)
            .send("That OperatorOS organization is already linked to another TradeFlowKit org.");
        }
      }

      try {
        const org = await storage.updateOrg(req.session.orgId!, { operatorosOrganizationId: value });
        res.json(org);
      } catch (err: any) {
        if (err?.code === "23505") {
          return res
            .status(409)
            .send("That OperatorOS organization is already linked to another TradeFlowKit org.");
        }
        throw err;
      }
    } catch (err) {
      res.status(500).send(errMsg(err));
    }
  }
);

router.post("/api/orgs/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const invite = await storage.getInviteCodeByCode(code);
    if (!invite) return res.status(400).send("Invalid invite code");

    const existing = await storage.getMembership(invite.orgId, req.session.userId!);
    if (existing) return res.status(400).send("Already a member");

    const teamCheck = await checkTeamLimit(invite.orgId);
    if (!teamCheck.canInvite) {
      return res.status(403).send(
        "This organization's plan does not allow team invitations. Upgrade to Small Business or Enterprise plan."
      );
    }
    if (!teamCheck.allowed) {
      return res.status(403).send(
        `Team member limit reached (${teamCheck.limit}). Upgrade your plan to add more members.`
      );
    }

    await storage.createMembership(invite.orgId, req.session.userId!, invite.role);
    req.session.orgId = invite.orgId;
    await storage.recordAudit({ orgId: invite.orgId, userId: req.session.userId, action: "create", entity: "membership", entityId: req.session.userId!, after: { userId: req.session.userId, role: invite.role, viaInvite: invite.code } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/invite-codes", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const codes = await storage.getOrgInviteCodes(req.session.orgId!);
    res.json(codes);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/invite-codes", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const teamCheck = await checkTeamLimit(req.session.orgId!);
    if (!teamCheck.canInvite) {
      return res.status(403).send(
        "Your plan does not allow team invitations. Upgrade to Small Business or Enterprise plan."
      );
    }

    const { role } = req.body;
    const code = await storage.createInviteCode(req.session.orgId!, role || "tech", req.session.userId!);
    res.json(code);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/plan-info", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { PLAN_LIMITS } = await import("@shared/schema");
    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");
    const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.free;
    const counts = await storage.getOrgCounts(org.id);
    res.json({ plan: org.plan, limits, counts, subscriptionStatus: org.subscriptionStatus });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/memberships", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const mems = await storage.getOrgMemberships(req.session.orgId!);
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

router.patch("/api/memberships/:userId/role", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { role } = req.body;
    if (!["owner", "admin", "tech", "viewer"].includes(role)) {
      return res.status(400).send("Invalid role");
    }
    const myMembership = await storage.getMembership(req.session.orgId!, req.session.userId!);
    if (!myMembership || (myMembership.role !== "owner" && myMembership.role !== "admin")) {
      return res.status(403).send("Only owners and admins can change roles");
    }
    if (userId === req.session.userId) {
      return res.status(400).send("Cannot change your own role");
    }
    const targetMembership = await storage.getMembership(req.session.orgId!, userId);
    if (!targetMembership) return res.status(404).send("Member not found");
    if (targetMembership.role === "owner" && myMembership.role !== "owner") {
      return res.status(403).send("Only the owner can change another owner's role");
    }
    await storage.updateMembershipRole(req.session.orgId!, userId, role);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "update", entity: "membership", entityId: userId, before: { userId, role: targetMembership.role }, after: { userId, role } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.delete("/api/memberships/:userId", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    if (userId === req.session.userId) {
      return res.status(400).send("Cannot remove yourself");
    }
    const myMembership = await storage.getMembership(req.session.orgId!, req.session.userId!);
    if (!myMembership || (myMembership.role !== "owner" && myMembership.role !== "admin")) {
      return res.status(403).send("Only owners and admins can remove members");
    }
    const targetMembership = await storage.getMembership(req.session.orgId!, userId);
    if (!targetMembership) return res.status(404).send("Member not found");
    if (targetMembership.role === "owner") {
      return res.status(403).send("Cannot remove the organization owner");
    }
    await storage.deleteMembership(req.session.orgId!, userId);
    await storage.recordAudit({ orgId: req.session.orgId!, userId: req.session.userId, action: "delete", entity: "membership", entityId: userId, before: { userId, role: targetMembership.role } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
