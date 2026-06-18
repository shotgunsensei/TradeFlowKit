import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, resolveRequestAccess } from "../middleware";
import { hasFeature } from "@shared/entitlements";
import { getUncachableStripeClient } from "../stripeClient";
import { randomBytes } from "crypto";
import { logger as rootLogger } from "../logger";

const log = rootLogger.child({ component: "stripe-connect" });

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

    // Linked OperatorOS tenants pay through the hub — Stripe Connect
    // onboarding is unavailable for them entirely.
    const { isLinkedOrg } = await import("@shared/entitlements");
    if (isLinkedOrg(org)) {
      return res.status(410).json({
        error: "managed_by_operatoros",
        message: "Payouts for this organization are managed by OperatorOS.",
      });
    }

    // Gate via feature flag rather than legacy plan-name comparison. Linked
    // OperatorOS tenants are already short-circuited above with a 410, so in
    // practice this branch only fires for non-linked orgs and replaces the
    // old `plan === "free"` check; the feature key still exists so non-free
    // legacy plans (and any future non-linked plan tiers) can be toggled
    // through the same entitlement surface.
    const ctx = await resolveRequestAccess(req);
    if (!ctx || !hasFeature(ctx.access, "stripe_connect")) {
      return res.status(403).json({
        error: "feature_not_in_plan",
        feature: "stripe_connect",
        linked: ctx?.access.linked ?? false,
        planSlug: ctx?.access.planSlug ?? null,
        message: "Upgrade to Individual or above to connect Stripe.",
      });
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
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
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
      log.warn({ err: error }, "OAuth error");
      return res.redirect(`${baseUrl}/settings?tab=payments&error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${baseUrl}/settings?tab=payments&error=missing_params`);
    }

    const pendingState = req.session.stripeConnectState;
    if (!pendingState || pendingState.nonce !== state) {
      log.warn("state mismatch — potential CSRF attempt");
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

    log.info({ orgId, connectedAccountId }, "org connected Stripe account");
    res.redirect(`${baseUrl}/settings?tab=payments&connected=true`);
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "callback error");
    res.redirect(`${baseUrl}/settings?tab=payments&error=${encodeURIComponent(errMsg(err))}`);
  }
});

router.delete("/api/stripe/connect", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    await storage.updateOrg(req.session.orgId!, {
      stripeConnectAccountId: null,
      stripeConnectOnboarded: false,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: errMsg(err) });
  }
});

export default router;
