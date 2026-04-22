import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/api/stripe/publishable-key", requireAuth, async (_req: Request, res: Response) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.get("/api/stripe/plans", requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.post("/api/stripe/create-checkout", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { priceId, plan } = req.body;
    if (!priceId || !plan) return res.status(400).send("Price ID and plan required");

    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");

    const stripe = await getUncachableStripeClient();

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { name: org.name, metadata: { orgId: org.id } },
        { idempotencyKey: `create-customer-${org.id}` }
      );
      customerId = customer.id;
      await storage.updateOrg(org.id, { stripeCustomerId: customerId });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const idempotencyKey = `checkout-${org.id}-${priceId}-${Date.now()}`;

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        // Pass plan metadata to the subscription so subscription events can determine the plan
        subscription_data: {
          metadata: { orgId: org.id, plan },
        },
        success_url: `${baseUrl}/subscription?subscription=success`,
        cancel_url: `${baseUrl}/subscription?subscription=cancelled`,
        metadata: { orgId: org.id, plan },
      },
      { idempotencyKey }
    );

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.post("/api/stripe/create-portal", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const org = await storage.getOrg(req.session.orgId!);
    if (!org?.stripeCustomerId) return res.status(400).send("No subscription found");

    const stripe = await getUncachableStripeClient();
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const portalSession = await stripe.billingPortal.sessions.create(
      {
        customer: org.stripeCustomerId,
        return_url: `${baseUrl}/subscription`,
      },
      { idempotencyKey: `portal-${org.id}-${Date.now()}` }
    );

    res.json({ url: portalSession.url });
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
