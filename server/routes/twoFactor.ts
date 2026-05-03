import { Router, type Request, type Response } from "express";
import { generateSecret, verify as totpVerify, generateURI } from "otplib";

const authenticator = {
  generateSecret: () => generateSecret(),
  check: async (token: string, secret: string) => {
    const r = await totpVerify({ token, secret, epochTolerance: 30 });
    return r.valid;
  },
  keyuri: (user: string, issuer: string, secret: string) =>
    generateURI({ label: user, issuer, secret }),
};
import QRCode from "qrcode";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { storage } from "../storage";
import { requireAuth } from "../middleware";

const router = Router();

const ISSUER = "TradeFlow";

function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${bytes.slice(0, 5)}-${bytes.slice(5, 10)}`);
  }
  return codes;
}

router.post("/api/auth/2fa/setup", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).send("User not found");
    if (user.totpEnabledAt) return res.status(400).json({ error: "2FA already enabled. Disable it first to re-enroll." });

    const secret = authenticator.generateSecret();
    await storage.setUserTotpSecret(user.id, secret);

    const otpauth = authenticator.keyuri(user.username, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    res.json({ secret, otpauthUrl: otpauth, qrDataUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/2fa/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") return res.status(400).json({ error: "Code required" });
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.totpSecret) return res.status(400).json({ error: "No pending 2FA setup. Start enrollment first." });

    const ok = await authenticator.check(code.replace(/\s/g, ""), user.totpSecret);
    if (!ok) return res.status(401).json({ error: "Invalid code. Check your authenticator app and try again." });

    const codes = generateRecoveryCodes(10);
    const hashes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));
    await storage.replaceRecoveryCodes(user.id, hashes);
    await storage.enableUserTotp(user.id);

    res.json({ ok: true, recoveryCodes: codes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/2fa/disable", requireAuth, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required to disable 2FA" });
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).send("User not found");
    const { verifyPassword } = await import("../middleware");
    const valid = await verifyPassword(password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect password" });
    await storage.disableUserTotp(user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/2fa/regenerate-codes", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user || !user.totpEnabledAt) return res.status(400).json({ error: "2FA is not enabled" });
    const codes = generateRecoveryCodes(10);
    const hashes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));
    await storage.replaceRecoveryCodes(user.id, hashes);
    res.json({ ok: true, recoveryCodes: codes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/auth/2fa/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).send("User not found");
    const remaining = user.totpEnabledAt ? (await storage.getActiveRecoveryCodes(user.id)).length : 0;
    res.json({
      enabled: !!user.totpEnabledAt,
      enabledAt: user.totpEnabledAt,
      pendingSetup: !!user.totpSecret && !user.totpEnabledAt,
      recoveryCodesRemaining: remaining,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/login/2fa", async (req: Request, res: Response) => {
  try {
    const { code, recoveryCode } = req.body;
    const pendingId = req.session.pending2faUserId;
    if (!pendingId) return res.status(400).json({ error: "No pending login. Sign in again." });
    const user = await storage.getUser(pendingId);
    if (!user || !user.totpSecret || !user.totpEnabledAt) {
      delete req.session.pending2faUserId;
      return res.status(400).json({ error: "2FA not configured for this account" });
    }

    let verified = false;
    if (code && typeof code === "string") {
      verified = await authenticator.check(code.replace(/\s/g, ""), user.totpSecret);
    }
    if (!verified && recoveryCode && typeof recoveryCode === "string") {
      const normalized = recoveryCode.trim().toUpperCase();
      const active = await storage.getActiveRecoveryCodes(user.id);
      for (const rc of active) {
        if (await bcrypt.compare(normalized, rc.codeHash)) {
          await storage.markRecoveryCodeUsed(rc.id);
          verified = true;
          break;
        }
      }
    }

    if (!verified) return res.status(401).json({ error: "Invalid code" });

    delete req.session.pending2faUserId;
    req.session.userId = user.id;
    const userOrgs = await storage.getUserOrgs(user.id);
    if (userOrgs.length > 0) req.session.orgId = userOrgs[0].id;

    req.session.save((err) => {
      if (err) return res.status(500).send("Session error");
      res.json({ user: { ...user, password: undefined, totpSecret: undefined } });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
