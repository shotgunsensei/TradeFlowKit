import type Stripe from 'stripe';
import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import { errMsg } from './errors';
import { type CallRecoveryPlan } from '@shared/schema';
import { logger as rootLogger } from './logger';
import type { Logger } from 'pino';

interface StripeEventEnvelope {
  type?: string;
  data?: { object?: Record<string, unknown> };
}

const VALID_PLANS = new Set(['free', 'individual', 'small_business', 'enterprise']);

function getMeta(obj: { metadata?: unknown } | undefined): Record<string, string> {
  return (obj?.metadata as Record<string, string> | undefined) ?? {};
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, log: Logger = rootLogger): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();

    // Verify signature first; signature errors are thrown and caught by caller (→ 400)
    await sync.processWebhook(payload, signature);

    let event: StripeEventEnvelope;
    try {
      event = JSON.parse(payload.toString()) as StripeEventEnvelope;
    } catch (err: any) {
      log.warn({ err: errMsg(err) }, 'Webhook payload JSON parse failed');
      return;
    }

    const eventId: string | undefined = (event as any).id;
    const type = event.type as string;
    const obj = event.data?.object;
    if (!type || !obj) return;
    const meta = getMeta(obj);

    if (!eventId) {
      log.warn({ type }, 'Webhook event missing id; skipping idempotency');
    } else {
      // Atomic check-and-insert: returns false when this event id already exists
      const inserted = await storage.recordProcessedStripeEvent(eventId, type);
      if (!inserted) {
        log.info({ eventId, type }, 'Webhook already processed; skipping');
        return;
      }
    }

    try {
      await WebhookHandlers.dispatch(type, obj, log);
    } catch (err: any) {
      const message = err?.message || String(err);
      // Roll back the idempotency marker so Stripe retries can re-process the event
      if (eventId) {
        try {
          await storage.deleteProcessedStripeEvent(eventId);
        } catch (delErr: any) {
          log.error({ err: delErr?.message || String(delErr), eventId }, 'Failed to roll back processed_stripe_events row');
        }
      }
      log.error({ err: message, eventId, type }, 'Webhook handler failed');
      // Re-throw so the route returns 500 and Stripe retries
      throw err;
    }
  }

  private static async dispatch(type: string, obj: any, log: Logger): Promise<void> {
    const meta = getMeta(obj);
    // ── Call Recovery events ────────────────────────────────────────────────
    if (type === 'checkout.session.completed' && meta.feature === 'call_recovery') {
      await WebhookHandlers.handleCallRecoveryCheckout(obj as unknown as Stripe.Checkout.Session, log);
      return;
    }
    if (
      (type === 'customer.subscription.updated' || type === 'customer.subscription.created') &&
      meta.feature === 'call_recovery'
    ) {
      await WebhookHandlers.handleCallRecoverySubscription(obj as unknown as Stripe.Subscription, 'updated', log);
      return;
    }
    if (type === 'customer.subscription.deleted' && meta.feature === 'call_recovery') {
      await WebhookHandlers.handleCallRecoverySubscription(obj as unknown as Stripe.Subscription, 'canceled', log);
      return;
    }

    // ── Invoice payment events ──────────────────────────────────────────────
    if (type === 'checkout.session.completed' && meta.feature === 'invoice_payment') {
      await WebhookHandlers.handleInvoicePaymentCheckout(obj as unknown as Stripe.Checkout.Session, log);
      return;
    }

    // ── Main plan subscription events ───────────────────────────────────────
    if (type === 'checkout.session.completed') {
      await WebhookHandlers.handleMainPlanCheckout(obj as unknown as Stripe.Checkout.Session, log);
      return;
    }
    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      await WebhookHandlers.handleMainPlanSubscription(obj as unknown as Stripe.Subscription, log);
      return;
    }
    if (type === 'customer.subscription.deleted') {
      await WebhookHandlers.handleMainPlanSubscriptionDeleted(obj as unknown as Stripe.Subscription, log);
      return;
    }
    if (type === 'invoice.payment_failed') {
      await WebhookHandlers.handleMainPlanPaymentFailed(obj as unknown as Stripe.Invoice, log);
      return;
    }
  }

  private static async handleMainPlanCheckout(session: Stripe.Checkout.Session, log: Logger): Promise<void> {
    try {
      const meta = (session.metadata ?? {}) as Record<string, string>;
      const { orgId, plan } = meta;
      if (!orgId) return;

      const org = await storage.getOrg(orgId);
      if (!org) {
        log.warn({ orgId }, '[billing] checkout.session.completed: org not found');
        return;
      }

      const updateData: Record<string, unknown> = {
        stripeSubscriptionId: (session.subscription as string | null) || org.stripeSubscriptionId,
        stripeCustomerId: (session.customer as string | null) || org.stripeCustomerId,
        subscriptionStatus: 'active',
      };

      if (plan && VALID_PLANS.has(plan) && plan !== 'free') {
        updateData.plan = plan;
      }

      await storage.updateOrg(orgId, updateData);
      log.info({ orgId, plan }, '[billing] checkout activated');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[billing] handleMainPlanCheckout error');
    }
  }

  private static async handleMainPlanSubscription(sub: Stripe.Subscription, log: Logger): Promise<void> {
    try {
      const customerId = sub.customer as string | undefined;
      if (!customerId) return;

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return;

      const status: string = sub.status || 'unknown';
      const isActive = status === 'active' || status === 'trialing';
      const cancelAtPeriodEnd: boolean = sub.cancel_at_period_end === true;
      // current_period_end may be present at runtime even when not in narrow Stripe types
      const currentPeriodEndRaw = (sub as unknown as { current_period_end?: number }).current_period_end;
      const currentPeriodEnd = currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : undefined;

      const updateData: Record<string, unknown> = {
        stripeSubscriptionId: sub.id,
        subscriptionStatus: status,
        cancelAtPeriodEnd,
      };

      if (currentPeriodEnd) {
        updateData.currentPeriodEnd = currentPeriodEnd;
      }

      const meta = (sub.metadata ?? {}) as Record<string, string>;
      const metaPlan = meta.plan;
      if (metaPlan && VALID_PLANS.has(metaPlan)) {
        if (isActive) {
          updateData.plan = metaPlan;
        } else if (!isActive && (status === 'canceled' || status === 'unpaid' || status === 'past_due')) {
          updateData.plan = 'free';
          updateData.cancelAtPeriodEnd = false;
        }
      } else if (!isActive) {
        updateData.plan = 'free';
        updateData.cancelAtPeriodEnd = false;
      }

      await storage.updateOrg(org.id, updateData);
      log.info({ orgId: org.id, subscriptionId: sub.id, status, cancelAtPeriodEnd }, '[billing] subscription updated');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[billing] handleMainPlanSubscription error');
    }
  }

  private static async handleMainPlanSubscriptionDeleted(sub: Stripe.Subscription, log: Logger): Promise<void> {
    try {
      const customerId = sub.customer as string | undefined;
      if (!customerId) return;

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return;

      const currentPeriodEndRaw = (sub as unknown as { current_period_end?: number }).current_period_end;

      await storage.updateOrg(org.id, {
        plan: 'free',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : undefined,
      });

      log.info({ orgId: org.id }, '[billing] subscription deleted → downgraded to free');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[billing] handleMainPlanSubscriptionDeleted error');
    }
  }

  private static async handleMainPlanPaymentFailed(invoice: Stripe.Invoice, log: Logger): Promise<void> {
    try {
      const customerId = invoice.customer as string | undefined;
      if (!customerId) return;

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return;

      await storage.updateOrg(org.id, { subscriptionStatus: 'past_due' });
      log.warn({ orgId: org.id }, '[billing] payment failed');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[billing] handleMainPlanPaymentFailed error');
    }
  }

  // ── Invoice payment handlers ──────────────────────────────────────────────

  private static async handleInvoicePaymentCheckout(session: Stripe.Checkout.Session, log: Logger): Promise<void> {
    try {
      const meta = (session.metadata ?? {}) as Record<string, string>;
      const { invoiceId, orgId } = meta;
      if (!invoiceId || !orgId) return;

      const paymentIntentId = (session.payment_intent as string | null) || undefined;

      await storage.updateInvoice(orgId, invoiceId, {
        status: 'paid',
        paidAt: new Date(),
        paidViaStripe: true,
        stripePaymentIntentId: paymentIntentId || null,
      });

      log.info({ orgId, invoiceId }, '[invoice-payment] invoice marked paid via Stripe');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[invoice-payment] handleInvoicePaymentCheckout error');
    }
  }

  private static async handleCallRecoveryCheckout(session: Stripe.Checkout.Session, log: Logger): Promise<void> {
    try {
      const meta = (session.metadata ?? {}) as Record<string, string>;
      const { orgId, callRecoveryPlan } = meta;
      if (!orgId || !callRecoveryPlan) return;

      const subscriptionId = (session.subscription as string | null) ?? undefined;
      const customerId = (session.customer as string | null) ?? undefined;

      const existingSub = await storage.getCallRecoverySubscription(orgId);
      let subId: string;
      if (existingSub) {
        await storage.updateCallRecoverySubscription(existingSub.id, {
          plan: callRecoveryPlan as CallRecoveryPlan,
          status: 'active',
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          usageCount: 0,
        });
        subId = existingSub.id;
      } else {
        const newSub = await storage.createCallRecoverySubscription({
          orgId,
          plan: callRecoveryPlan as CallRecoveryPlan,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
        });
        subId = newSub.id;
      }

      await storage.updateOrg(orgId, {
        callRecoveryPlan: callRecoveryPlan as CallRecoveryPlan,
        callRecoveryStatus: 'active',
        callRecoveryStripeSubId: subscriptionId || null,
        callRecoverySubscriptionId: subId,
      });

      log.info({ orgId, plan: callRecoveryPlan }, '[call-recovery] checkout activated');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[call-recovery] handleCallRecoveryCheckout error');
    }
  }

  private static async handleCallRecoverySubscription(sub: Stripe.Subscription, action: 'updated' | 'canceled', log: Logger): Promise<void> {
    try {
      const meta = (sub.metadata ?? {}) as Record<string, string>;
      const { orgId, callRecoveryPlan } = meta;
      if (!orgId) return;

      const status = action === 'canceled' ? 'canceled' : sub.status;
      const isActive = status === 'active' || status === 'trialing';

      const existingSub = await storage.getCallRecoverySubscription(orgId);
      if (existingSub) {
        const periods = sub as unknown as { current_period_start?: number; current_period_end?: number };
        const periodStart = periods.current_period_start ? new Date(periods.current_period_start * 1000) : undefined;
        const periodEnd = periods.current_period_end ? new Date(periods.current_period_end * 1000) : undefined;
        const isNewPeriod = !!(periodStart && existingSub.currentPeriodStart &&
          periodStart.getTime() > existingSub.currentPeriodStart.getTime());

        await storage.updateCallRecoverySubscription(existingSub.id, {
          status: isActive ? 'active' : 'canceled',
          plan: isActive ? (callRecoveryPlan as CallRecoveryPlan) : existingSub.plan,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          usageCount: isNewPeriod ? 0 : existingSub.usageCount,
        });
      }

      await storage.updateOrg(orgId, {
        callRecoveryPlan: isActive ? (callRecoveryPlan as CallRecoveryPlan) : null,
        callRecoveryStatus: status,
        callRecoveryStripeSubId: isActive ? sub.id : null,
      });

      log.info({ orgId, action }, '[call-recovery] subscription updated');
    } catch (err) {
      log.error({ err: errMsg(err) }, '[call-recovery] handleCallRecoverySubscription error');
    }
  }
}
