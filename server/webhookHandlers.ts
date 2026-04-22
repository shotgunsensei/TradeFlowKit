import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import { type CallRecoveryPlan } from '@shared/schema';

const VALID_PLANS = new Set(['free', 'individual', 'small_business', 'enterprise']);

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();

    await sync.processWebhook(payload, signature);

    let event: any;
    try {
      event = JSON.parse(payload.toString());
    } catch {
      return;
    }

    const type = event.type as string;
    const obj = event.data?.object;

    // ── Call Recovery events ────────────────────────────────────────────────
    if (type === 'checkout.session.completed' && obj?.metadata?.feature === 'call_recovery') {
      await WebhookHandlers.handleCallRecoveryCheckout(obj);
      return;
    }
    if (
      (type === 'customer.subscription.updated' || type === 'customer.subscription.created') &&
      obj?.metadata?.feature === 'call_recovery'
    ) {
      await WebhookHandlers.handleCallRecoverySubscription(obj, 'updated');
      return;
    }
    if (type === 'customer.subscription.deleted' && obj?.metadata?.feature === 'call_recovery') {
      await WebhookHandlers.handleCallRecoverySubscription(obj, 'canceled');
      return;
    }

    // ── Main plan subscription events ───────────────────────────────────────
    if (type === 'checkout.session.completed') {
      await WebhookHandlers.handleMainPlanCheckout(obj);
      return;
    }
    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      await WebhookHandlers.handleMainPlanSubscription(obj);
      return;
    }
    if (type === 'customer.subscription.deleted') {
      await WebhookHandlers.handleMainPlanSubscriptionDeleted(obj);
      return;
    }
    if (type === 'invoice.payment_failed') {
      await WebhookHandlers.handleMainPlanPaymentFailed(obj);
      return;
    }
  }

  // ── Main plan handlers ────────────────────────────────────────────────────

  private static async handleMainPlanCheckout(session: any): Promise<void> {
    try {
      const { orgId, plan } = session.metadata || {};
      if (!orgId) return;

      const org = await storage.getOrg(orgId);
      if (!org) {
        console.warn(`[billing] checkout.session.completed: org ${orgId} not found`);
        return;
      }

      const updateData: Record<string, unknown> = {
        stripeSubscriptionId: session.subscription || org.stripeSubscriptionId,
        stripeCustomerId: session.customer || org.stripeCustomerId,
        subscriptionStatus: 'active',
      };

      if (plan && VALID_PLANS.has(plan) && plan !== 'free') {
        updateData.plan = plan;
      }

      await storage.updateOrg(orgId, updateData);
      console.log(`[billing] checkout activated for org ${orgId} → plan ${plan}`);
    } catch (err: any) {
      console.error('[billing] handleMainPlanCheckout error:', err.message);
    }
  }

  private static async handleMainPlanSubscription(sub: any): Promise<void> {
    try {
      const customerId: string | undefined = sub.customer;
      if (!customerId) return;

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return;

      const status: string = sub.status || 'unknown';
      const isActive = status === 'active' || status === 'trialing';
      const cancelAtPeriodEnd: boolean = sub.cancel_at_period_end === true;
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : undefined;

      const updateData: Record<string, unknown> = {
        stripeSubscriptionId: sub.id,
        subscriptionStatus: status,
        cancelAtPeriodEnd,
      };

      if (currentPeriodEnd) {
        updateData.currentPeriodEnd = currentPeriodEnd;
      }

      // Determine plan from subscription metadata (set via subscription_data.metadata on checkout)
      const metaPlan: string | undefined = sub.metadata?.plan;
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
      console.log(`[billing] subscription ${sub.id} updated for org ${org.id}: status=${status} cancelAtPeriodEnd=${cancelAtPeriodEnd}`);
    } catch (err: any) {
      console.error('[billing] handleMainPlanSubscription error:', err.message);
    }
  }

  private static async handleMainPlanSubscriptionDeleted(sub: any): Promise<void> {
    try {
      const customerId: string | undefined = sub.customer;
      if (!customerId) return;

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return;

      await storage.updateOrg(org.id, {
        plan: 'free',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : undefined,
      });

      console.log(`[billing] subscription deleted for org ${org.id} → downgraded to free`);
    } catch (err: any) {
      console.error('[billing] handleMainPlanSubscriptionDeleted error:', err.message);
    }
  }

  private static async handleMainPlanPaymentFailed(invoice: any): Promise<void> {
    try {
      const customerId: string | undefined = invoice.customer;
      if (!customerId) return;

      const org = await storage.getOrgByStripeCustomerId(customerId);
      if (!org) return;

      await storage.updateOrg(org.id, { subscriptionStatus: 'past_due' });
      console.log(`[billing] payment failed for org ${org.id}`);
    } catch (err: any) {
      console.error('[billing] handleMainPlanPaymentFailed error:', err.message);
    }
  }

  // ── Call Recovery handlers ────────────────────────────────────────────────

  private static async handleCallRecoveryCheckout(session: any): Promise<void> {
    try {
      const { orgId, callRecoveryPlan } = session.metadata || {};
      if (!orgId || !callRecoveryPlan) return;

      const org = await storage.getOrg(orgId);
      if (!org) return;

      const existingSub = await storage.getCallRecoverySubscription(orgId);
      let subId: string;
      if (existingSub) {
        await storage.updateCallRecoverySubscription(existingSub.id, {
          plan: callRecoveryPlan as CallRecoveryPlan,
          status: 'active',
          stripeSubscriptionId: session.subscription,
          stripeCustomerId: session.customer,
          usageCount: 0,
        });
        subId = existingSub.id;
      } else {
        const newSub = await storage.createCallRecoverySubscription({
          orgId,
          plan: callRecoveryPlan,
          stripeSubscriptionId: session.subscription,
          stripeCustomerId: session.customer,
        });
        subId = newSub.id;
      }

      await storage.updateOrg(orgId, {
        callRecoveryPlan: callRecoveryPlan as CallRecoveryPlan,
        callRecoveryStatus: 'active',
        callRecoveryStripeSubId: session.subscription || null,
        callRecoverySubscriptionId: subId,
      });

      console.log(`[call-recovery] checkout activated for org ${orgId} on plan ${callRecoveryPlan}`);
    } catch (err: any) {
      console.error('[call-recovery] handleCallRecoveryCheckout error:', err.message);
    }
  }

  private static async handleCallRecoverySubscription(sub: any, action: 'updated' | 'canceled'): Promise<void> {
    try {
      const { orgId, callRecoveryPlan } = sub.metadata || {};
      if (!orgId) return;

      const status = action === 'canceled' ? 'canceled' : (sub.status as string);
      const isActive = status === 'active' || status === 'trialing';

      const existingSub = await storage.getCallRecoverySubscription(orgId);
      if (existingSub) {
        const periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000) : undefined;
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined;
        const isNewPeriod = periodStart && existingSub.currentPeriodStart &&
          periodStart.getTime() > existingSub.currentPeriodStart.getTime();

        await storage.updateCallRecoverySubscription(existingSub.id, {
          status: isActive ? 'active' : 'canceled',
          plan: isActive ? callRecoveryPlan as CallRecoveryPlan : existingSub.plan,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          usageCount: isNewPeriod ? 0 : existingSub.usageCount,
        });
      }

      await storage.updateOrg(orgId, {
        callRecoveryPlan: isActive ? callRecoveryPlan as CallRecoveryPlan : null,
        callRecoveryStatus: status,
        callRecoveryStripeSubId: isActive ? sub.id : null,
      });

      console.log(`[call-recovery] subscription ${action} for org ${orgId}`);
    } catch (err: any) {
      console.error('[call-recovery] handleCallRecoverySubscription error:', err.message);
    }
  }
}
