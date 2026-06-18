import { errMsg } from "../errors";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";
import { getUncachableStripeClient } from "../stripeClient";
import { processConversation, generateInitialMessage, isQuietHours, completeRecovery } from "../callRecoveryAI";
import { ensureLeadForMissedCall } from "../callRecoveryLeadBridge";
import { sendSMS, validateTwilioAccountSid } from "../twilioClient";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { type CallRecoveryPlan, CALL_RECOVERY_PLAN_LIMITS, type MissedCall } from "@shared/schema";
import { logger as rootLogger } from "../logger";

const log = rootLogger.child({ component: "call-recovery-route" });

const router = Router();

const VALID_CR_PLANS: CallRecoveryPlan[] = ["starter", "growth", "pro"];

function isValidCallRecoveryPlan(p: unknown): p is CallRecoveryPlan {
  return typeof p === "string" && VALID_CR_PLANS.includes(p as CallRecoveryPlan);
}

async function safeEnsureLeadForMissedCall(missedCall: MissedCall): Promise<void> {
  try {
    const messages = await storage.getAiMessages(missedCall.id);
    await ensureLeadForMissedCall(missedCall, messages);
  } catch (err) {
    log.warn({ err: errMsg(err), missedCallId: missedCall.id }, "Missed-call lead bridge failed");
  }
}

router.get("/api/call-recovery/subscription", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");

    const plan = org.callRecoveryPlan;
    const limits = plan ? CALL_RECOVERY_PLAN_LIMITS[plan] : null;

    const crSub = await storage.getCallRecoverySubscription(org.id);
    let usage = 0;
    if (crSub) {
      usage = await storage.getMissedCallCount(org.id, crSub.currentPeriodStart);
    }

    res.json({
      plan,
      status: org.callRecoveryStatus,
      phone: org.callRecoveryPhone,
      limits,
      usage,
      stripeSubscriptionId: org.callRecoveryStripeSubId,
      subscription: crSub || null,
      periodStart: crSub?.currentPeriodStart || null,
      periodEnd: crSub?.currentPeriodEnd || null,
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/call-recovery/plans", requireAuth, async (_req: Request, res: Response) => {
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
      WHERE p.active = true AND p.metadata->>'feature' = 'call_recovery'
      ORDER BY pr.unit_amount ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/call-recovery/checkout", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { priceId, plan } = req.body;
    if (!priceId || !plan) return res.status(400).send("Price ID and plan required");

    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");

    const stripe = await getUncachableStripeClient();

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { orgId: org.id },
      });
      customerId = customer.id;
      await storage.updateOrg(org.id, { stripeCustomerId: customerId });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${baseUrl}/call-recovery?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/call-recovery?subscription=cancelled`,
      metadata: { orgId: org.id, feature: "call_recovery", callRecoveryPlan: plan },
      subscription_data: {
        metadata: { orgId: org.id, feature: "call_recovery", callRecoveryPlan: plan },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/call-recovery/verify-checkout", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query;
    if (!session_id || typeof session_id !== "string") {
      return res.status(400).send("session_id required");
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return res.status(400).send("Checkout session not completed");
    }

    const { orgId, callRecoveryPlan } = session.metadata || {};
    if (!orgId || !callRecoveryPlan || orgId !== req.session.orgId) {
      return res.status(400).send("Invalid session metadata");
    }

    if (session.metadata?.feature !== "call_recovery") {
      return res.status(400).send("Not a call recovery session");
    }

    if (!isValidCallRecoveryPlan(callRecoveryPlan)) {
      return res.status(400).send("Invalid call recovery plan in session metadata");
    }

    const existingSub = await storage.getCallRecoverySubscription(orgId);
    let subId: string;
    if (existingSub) {
      await storage.updateCallRecoverySubscription(existingSub.id, {
        plan: callRecoveryPlan,
        status: "active",
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
        usageCount: 0,
      });
      subId = existingSub.id;
    } else {
      const newSub = await storage.createCallRecoverySubscription({
        orgId,
        plan: callRecoveryPlan,
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
      });
      subId = newSub.id;
    }

    await storage.updateOrg(orgId, {
      callRecoveryPlan,
      callRecoveryStatus: "active",
      callRecoveryStripeSubId: (session.subscription as string) || null,
      callRecoverySubscriptionId: subId,
    });

    res.json({ ok: true, plan: callRecoveryPlan });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/call-recovery/portal", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const org = await storage.getOrg(req.session.orgId!);
    if (!org?.stripeCustomerId) return res.status(400).send("No subscription found");

    const stripe = await getUncachableStripeClient();
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${baseUrl}/call-recovery`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.post("/api/call-recovery/configure", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).send("Phone number required");

    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");

    if (!org.callRecoveryPlan) {
      return res.status(403).send("No call recovery subscription active. Subscribe first.");
    }

    await storage.updateOrg(org.id, { callRecoveryPhone: phone });
    res.json({ ok: true, phone });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/call-recovery/missed-calls", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const calls = await storage.getMissedCalls(req.session.orgId!, limit, offset);
    res.json(calls);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get(
  "/api/call-recovery/missed-calls/:id/messages",
  requireAuth,
  requireOrg,
  async (req: Request, res: Response) => {
    try {
      const mc = await storage.getMissedCall(req.params.id as string);
      if (!mc || mc.orgId !== req.session.orgId) {
        return res.status(404).send("Missed call not found");
      }
      const messages = await storage.getAiMessages(req.params.id as string);
      res.json({ missedCall: mc, messages });
    } catch (err) {
      res.status(500).send(errMsg(err));
    }
  }
);

router.post("/api/call-recovery/webhook/missed-call", async (req: Request, res: Response) => {
  const twiml = (inner: string) => {
    res.set("Content-Type", "text/xml");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`);
  };

  try {
    const { Called, From, CallSid, CallStatus, AccountSid } = req.body;

    log.info({ from: From, called: Called, callSid: CallSid, callStatus: CallStatus }, "missed-call webhook");

    if (!From || !Called) {
      log.warn("Missing From or Called — returning Hangup");
      return twiml("<Hangup/>");
    }

    const isValid = await validateTwilioAccountSid(AccountSid);
    if (!isValid) {
      log.warn("AccountSid validation failed — returning Hangup");
      return twiml("<Hangup/>");
    }

    if (CallStatus === "in-progress" || CallStatus === "completed") {
      res.set("Content-Type", "text/xml");
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    }

    const org = await storage.getOrgByCallRecoveryPhone(Called);
    if (!org) return twiml("<Hangup/>");

    if (!org.callRecoveryPlan || org.callRecoveryStatus !== "active") {
      return twiml("<Hangup/>");
    }

    let crSub = await storage.getCallRecoverySubscription(org.id);
    if (!crSub) {
      log.info({ orgId: org.id }, "No call_recovery_subscriptions row — auto-creating");
      crSub = await storage.createCallRecoverySubscription({
        orgId: org.id,
        plan: org.callRecoveryPlan as CallRecoveryPlan,
        currentPeriodStart: new Date(),
      });
    }

    const limits = CALL_RECOVERY_PLAN_LIMITS[org.callRecoveryPlan];
    if (limits && limits.recoveriesPerMonth !== -1) {
      const currentUsage = await storage.getMissedCallCount(org.id, crSub.currentPeriodStart);
      if (currentUsage >= limits.recoveriesPerMonth) {
        return twiml("<Say voice=\"alice\">We received your call. Please try again later.</Say><Hangup/>");
      }
    }

    if (!org.callRecoveryEnabled) {
      log.info({ orgId: org.id }, "Call recovery disabled — not sending SMS");
      return twiml("<Hangup/>");
    }

    if (isQuietHours(org.callRecoveryQuietStart, org.callRecoveryQuietEnd)) {
      log.info({ orgId: org.id }, "Quiet hours active — recording call but not sending SMS");
      const qCall = await storage.createMissedCall(org.id, { callerPhone: From, twilioCallSid: CallSid });
      await storage.incrementCallRecoveryUsage(org.id);
      const updated = await storage.updateMissedCall(qCall.id, { status: "failed" });
      await safeEnsureLeadForMissedCall(updated || qCall);
      return twiml("<Hangup/>");
    }

    const existing = await storage.getMissedCallByPhone(org.id, From);
    if (existing) {
      const existingMessages = await storage.getAiMessages(existing.id);
      const conversationStarted = existingMessages.some((m) => m.role === "user");
      let currentExisting = existing;
      if (!conversationStarted) {
        const retryMessage = generateInitialMessage(org.name, org.callRecoveryCustomMessage, { orgPhone: org.phone });
        const smsSent = await sendSMS(From, Called, retryMessage);
        if (smsSent) {
          const updated = await storage.updateMissedCall(existing.id, { status: "in_progress" });
          currentExisting = updated || existing;
        } else {
          const updated = await storage.updateMissedCall(existing.id, { status: "failed" });
          currentExisting = updated || existing;
        }
      }
      await safeEnsureLeadForMissedCall(currentExisting);
      if (!CallStatus || CallStatus === "ringing") {
        return twiml(
          "<Say voice=\"alice\">Sorry we missed your call. Our automated system will send you a text message shortly.</Say><Hangup/>"
        );
      }
      return twiml("");
    }

    const missedCall = await storage.createMissedCall(org.id, {
      callerPhone: From,
      twilioCallSid: CallSid,
    });

    await storage.incrementCallRecoveryUsage(org.id);

    const initialMessage = generateInitialMessage(org.name, org.callRecoveryCustomMessage, { orgPhone: org.phone });
    await storage.createAiMessage(missedCall.id, "assistant", initialMessage);
    let currentMissedCall = await storage.updateMissedCall(missedCall.id, { status: "in_progress" }) || missedCall;

    const smsSent = await sendSMS(From, Called, initialMessage);
    if (!smsSent) {
      currentMissedCall = await storage.updateMissedCall(missedCall.id, { status: "failed" }) || currentMissedCall;
    }
    await safeEnsureLeadForMissedCall(currentMissedCall);

    if (!CallStatus || CallStatus === "ringing") {
      return twiml(
        "<Say voice=\"alice\">Sorry we missed your call. Our automated system will send you a text message shortly.</Say><Hangup/>"
      );
    }
    return twiml("");
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Missed call webhook error");
    res.set("Content-Type", "text/xml");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }
});

router.post("/api/call-recovery/webhook/sms", async (req: Request, res: Response) => {
  const twiml = (inner: string) => {
    res.set("Content-Type", "text/xml");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`);
  };

  try {
    const { From, Body, To, AccountSid, SmsSid } = req.body;


    if (!From || Body === undefined) {
      return twiml("");
    }

    const isValid = await validateTwilioAccountSid(AccountSid);
    if (!isValid) {
      return twiml("");
    }

    const org = await storage.getOrgByCallRecoveryPhone(To);
    if (!org) return twiml("");

    const missedCall = await storage.getMissedCallByPhone(org.id, From);
    if (!missedCall) return twiml("");

    const result = await processConversation(missedCall.id, Body);
    await sendSMS(From, To, result.responseText);

    if (result.isComplete && result.serviceType && result.location && result.urgency) {
      try {
        await completeRecovery(missedCall.id, result.serviceType, result.location, result.urgency);
      } catch (err) {
        log.error({ err, msg: errMsg(err), missedCallId: missedCall.id }, "Failed to complete recovery");
        await storage.updateMissedCall(missedCall.id, { status: "failed" });
      }
    }

    return twiml("");
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "SMS webhook error");
    res.set("Content-Type", "text/xml");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }
});

router.post("/api/call-recovery/handle-subscription-change", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.SESSION_SECRET || "internal-secret";
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).send("Unauthorized");
    }

    const { customerId, subscriptionId, status, callRecoveryPlan, periodStart, periodEnd } = req.body;
    if (!customerId) return res.status(400).send("Customer ID required");

    const org = await storage.getOrgByStripeCustomerId(customerId);
    if (!org) return res.status(404).send("Organization not found");

    const updateData: Record<string, unknown> = {
      callRecoveryStripeSubId: subscriptionId || null,
      callRecoveryStatus: status || null,
    };

    if (callRecoveryPlan && (status === "active" || status === "trialing")) {
      updateData.callRecoveryPlan = callRecoveryPlan;

      const existingSub = await storage.getCallRecoverySubscription(org.id);
      if (existingSub) {
        await storage.updateCallRecoverySubscription(existingSub.id, {
          plan: callRecoveryPlan,
          status: "active",
          stripeSubscriptionId: subscriptionId,
          currentPeriodStart: periodStart ? new Date(periodStart * 1000) : existingSub.currentPeriodStart,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : existingSub.currentPeriodEnd,
          usageCount: 0,
        });
      } else {
        await storage.createCallRecoverySubscription({
          orgId: org.id,
          plan: callRecoveryPlan,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          currentPeriodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        });
      }
    }

    if (status === "canceled" || status === "unpaid" || status === "past_due") {
      updateData.callRecoveryPlan = null;
      updateData.callRecoveryStatus = status;
      const existingSub = await storage.getCallRecoverySubscription(org.id);
      if (existingSub) {
        await storage.updateCallRecoverySubscription(existingSub.id, { status: "canceled" });
      }
    }

    await storage.updateOrg(org.id, updateData);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/call-recovery/settings", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");

    const { enabled, customMessage, quietStart, quietEnd } = req.body;
    const updateData: Record<string, unknown> = {};
    if (typeof enabled === "boolean") updateData.callRecoveryEnabled = enabled;
    if (customMessage !== undefined) updateData.callRecoveryCustomMessage = customMessage || null;
    if (quietStart !== undefined) updateData.callRecoveryQuietStart = quietStart || null;
    if (quietEnd !== undefined) updateData.callRecoveryQuietEnd = quietEnd || null;

    const updated = await storage.updateOrg(org.id, updateData);
    res.json({
      enabled: updated?.callRecoveryEnabled,
      customMessage: updated?.callRecoveryCustomMessage,
      quietStart: updated?.callRecoveryQuietStart,
      quietEnd: updated?.callRecoveryQuietEnd,
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/call-recovery/settings", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const org = await storage.getOrg(req.session.orgId!);
    if (!org) return res.status(404).send("Organization not found");
    res.json({
      enabled: org.callRecoveryEnabled,
      customMessage: org.callRecoveryCustomMessage,
      quietStart: org.callRecoveryQuietStart,
      quietEnd: org.callRecoveryQuietEnd,
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.get("/api/call-recovery/stats", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const orgId = req.session.orgId!;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const allCalls = await storage.getMissedCalls(orgId, 1000, 0);
    const thisMonthCalls = allCalls.filter((c) => new Date(c.createdAt) >= startOfMonth);
    const lastMonthCalls = allCalls.filter((c) => {
      const d = new Date(c.createdAt);
      return d >= lastMonthStart && d < startOfMonth;
    });

    const recovered = thisMonthCalls.filter((c) => c.status === "recovered");
    const inProgress = thisMonthCalls.filter((c) => c.status === "in_progress" || c.status === "new");
    const failed = thisMonthCalls.filter((c) => c.status === "failed" || c.status === "expired");
    const contacted = thisMonthCalls.filter((c) => c.status !== "new");

    const lastRecovered = lastMonthCalls.filter((c) => c.status === "recovered");
    const recoveryRate = thisMonthCalls.length > 0 ? Math.round((recovered.length / thisMonthCalls.length) * 100) : 0;
    const lastRecoveryRate = lastMonthCalls.length > 0 ? Math.round((lastRecovered.length / lastMonthCalls.length) * 100) : 0;

    const respondedCount = await db.execute(sql`
      SELECT COUNT(DISTINCT mc.id) as count
      FROM missed_calls mc
      WHERE mc.org_id = ${orgId}
        AND mc.created_at >= ${startOfMonth}
        AND EXISTS (
          SELECT 1 FROM ai_messages am WHERE am.missed_call_id = mc.id AND am.role = 'user'
        )
    `);
    const responded = Number((respondedCount.rows[0] as any)?.count || 0);

    const estimatedRevenueResult = await db.execute(sql`
      SELECT COALESCE(AVG(
        COALESCE((SELECT SUM(qty::numeric * unit_price::numeric) FROM invoice_items ii WHERE ii.invoice_id = inv.id), 0)
        * (1 + COALESCE(inv.tax_rate::numeric, 0) / 100)
        - COALESCE(inv.discount::numeric, 0)
      ), 0) as avg_invoice
      FROM invoices inv
      WHERE inv.org_id = ${orgId} AND inv.status = 'paid'
    `);
    const avgInvoice = Number((estimatedRevenueResult.rows[0] as any)?.avg_invoice || 0);
    const estimatedRevenue = Math.round(recovered.length * avgInvoice * 100) / 100;

    res.json({
      totalThisMonth: thisMonthCalls.length,
      recovered: recovered.length,
      inProgress: inProgress.length,
      failed: failed.length,
      contacted: contacted.length,
      responded,
      recoveryRate,
      lastMonthTotal: lastMonthCalls.length,
      lastMonthRecovered: lastRecovered.length,
      lastMonthRecoveryRate: lastRecoveryRate,
      estimatedRevenue,
      funnel: {
        missed: thisMonthCalls.length,
        contacted: contacted.length,
        responded,
        recovered: recovered.length,
      },
    });
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

router.patch("/api/call-recovery/missed-calls/:id/recover", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.session.orgId!;
    const existing = await storage.getMissedCall(id as string);
    if (!existing || existing.orgId !== orgId) {
      return res.status(404).send("Missed call not found");
    }
    const updated = await storage.updateMissedCall(id as string, { status: "recovered" });
    if (!updated) return res.status(404).send("Missed call not found");
    res.json(updated);
  } catch (err) {
    res.status(500).send(errMsg(err));
  }
});

export default router;
