import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";
import { getUncachableStripeClient } from "../stripeClient";
import { randomBytes } from "crypto";

declare module "express-session" {
  interface SessionData {
    stripeConnectState?: { nonce: string; orgId: string };
  }
}

const router = Router();

router.get("/api/stripe/connect/authorize", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const clientId = process.env.STRIPE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "Payments not configured on this platform." });
    }

    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).json({ error: "Org not found" });

    const plan = org.plan;
    if (plan === "free") {
      return res.status(403).json({ error: "Upgrade to Individual or above to connect Stripe." });
    }

    const replitDomains = process.env.REPLIT_DOMAINS;
    const baseUrl = replitDomains
      ? `https://${replitDomains.split(",")[0]}`
      : `http://localhost:${process.env.PORT || 5000}`;
    const redirectUri = `${baseUrl}/api/stripe/connect/callback`;

    const nonce = randomBytes(32).toString("hex");
    req.session.stripeConnectState = { nonce, orgId: req.session.orgId! };

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "read_write",
      redirect_uri: redirectUri,
      state: nonce,
    });

    const url = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/stripe/connect/callback", async (req: Request, res: Response) => {
  const replitDomains = process.env.REPLIT_DOMAINS;
  const baseUrl = replitDomains
    ? `https://${replitDomains.split(",")[0]}`
    : `http://localhost:${process.env.PORT || 5000}`;

  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      console.warn("[stripe-connect] OAuth error:", error);
      return res.redirect(`${baseUrl}/settings?tab=payments&error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${baseUrl}/settings?tab=payments&error=missing_params`);
    }

    const pendingState = req.session.stripeConnectState;
    if (!pendingState || pendingState.nonce !== state) {
      console.warn("[stripe-connect] state mismatch — potential CSRF attempt");
      return res.redirect(`${baseUrl}/settings?tab=payments&error=invalid_state`);
    }

    const { orgId } = pendingState;
    delete req.session.stripeConnectState;

    const membership = await storage.getMembership(orgId, req.session.userId!);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return res.redirect(`${baseUrl}/settings?tab=payments&error=unauthorized`);
    }

    const stripe = await getUncachableStripeClient();
    const response = await (stripe.oauth as any).token({
      grant_type: "authorization_code",
      code,
    });

    const connectedAccountId: string = response.stripe_user_id;

    await storage.updateOrg(orgId, {
      stripeConnectAccountId: connectedAccountId,
      stripeConnectOnboarded: true,
    });

    console.log(`[stripe-connect] org ${orgId} connected account ${connectedAccountId}`);
    res.redirect(`${baseUrl}/settings?tab=payments&connected=true`);
  } catch (err: any) {
    console.error("[stripe-connect] callback error:", err.message);
    res.redirect(`${baseUrl}/settings?tab=payments&error=${encodeURIComponent(err.message)}`);
  }
});

router.delete("/api/stripe/connect", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    await storage.updateOrg(req.session.orgId!, {
      stripeConnectAccountId: null,
      stripeConnectOnboarded: false,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
