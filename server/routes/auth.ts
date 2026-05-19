import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { hashPassword, verifyPassword } from "../middleware";
import { DuplicateEmailError } from "../storage/users";

const router = Router();

router.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { username, password, fullName } = req.body;
    if (!username || !password) {
      return res.status(400).send("Username and password required");
    }
    if (password.length < 6) {
      return res.status(400).send("Password must be at least 6 characters");
    }

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(400).send("Username already taken");
    }

    const user = await storage.createUser({
      username,
      password: await hashPassword(password),
      fullName: fullName || username,
      phone: "",
      email: "",
    });

    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) return res.status(500).send("Session error");
      res.json({ user: { ...user, password: undefined } });
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).send("Invalid credentials");
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).send("Invalid credentials");
    }

    if (/^[0-9a-f]{64}$/.test(user.password)) {
      const newHash = await hashPassword(password);
      await storage.updateUser(user.id, { password: newHash });
    }

    if (user.totpEnabledAt) {
      req.session.pending2faUserId = user.id;
      delete req.session.userId;
      return req.session.save((err) => {
        if (err) return res.status(500).send("Session error");
        res.json({ requires2fa: true });
      });
    }

    req.session.userId = user.id;

    const userOrgs = await storage.getUserOrgs(user.id);
    if (userOrgs.length > 0) {
      req.session.orgId = userOrgs[0].id;
    }

    req.session.save((err) => {
      if (err) return res.status(500).send("Session error");
      res.json({ user: { ...user, password: undefined, totpSecret: undefined } });
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.delete("/api/auth/delete-account", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await storage.deleteUser(userId);
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  } catch (error) {
    res.status(500).json({ error: errMsg(error) || "Failed to delete account" });
  }
});

router.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const { resolveAccess } = await import("@shared/entitlements");
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).send("User not found");

    const userOrgs = await storage.getUserOrgs(user.id);

    let org = null;
    let membership = null;

    if (req.session.orgId) {
      org = await storage.getOrg(req.session.orgId);
      membership = await storage.getMembership(req.session.orgId, user.id);
    }

    if (!org && userOrgs.length > 0) {
      org = userOrgs[0];
      req.session.orgId = org.id;
      membership = await storage.getMembership(org.id, user.id);
    }

    let planLimits = null;
    let orgCounts = null;
    let access = null;
    if (org) {
      const resolved = resolveAccess(org, membership ?? null);
      access = {
        source: resolved.source,
        linked: resolved.linked,
        allowed: resolved.allowed,
        reason: resolved.reason ?? null,
        planSlug: resolved.planSlug,
        subscriptionStatus: resolved.subscriptionStatus,
        accessLevel: resolved.accessLevel,
        features: resolved.features,
        limits: resolved.limits,
        effectiveRole: resolved.effectiveRole,
      };
      planLimits = resolved.limits;
      orgCounts = await storage.getOrgCounts(org.id);
    }

    res.json({
      user: { ...user, password: undefined },
      org,
      membership,
      orgs: userOrgs,
      planLimits,
      orgCounts,
      access,
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/auth/switch-org", requireAuth, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.body;
    const membership = await storage.getMembership(orgId, req.session.userId!);
    if (!membership) return res.status(403).send("Not a member of this organization");
    req.session.orgId = orgId;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/auth/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const { fullName, phone, email } = req.body;
    const user = await storage.updateUser(req.session.userId!, { fullName, phone, email });
    res.json({ ...user, password: undefined });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return res.status(409).send("That email is already in use by another account");
    }
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).send("Current and new password required");
    }
    if (newPassword.length < 6) {
      return res.status(400).send("New password must be at least 6 characters");
    }
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).send("User not found");
    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid) return res.status(401).send("Current password is incorrect");
    const newHash = await hashPassword(newPassword);
    await storage.updateUser(user.id, { password: newHash });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
