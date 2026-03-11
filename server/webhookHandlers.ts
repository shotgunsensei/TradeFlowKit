import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import { type CallRecoveryPlan } from '@shared/schema';

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

    let event: any;
    try {
      event = JSON.parse(payload.toString());
    } catch {
      event = null;
    }

    if (event) {
      const type = event.type as string;
      const obj = event.data?.object;

      if (type === 'checkout.session.completed' && obj?.metadata?.feature === 'call_recovery') {
        await WebhookHandlers.handleCallRecoveryCheckout(obj);
      } else if ((type === 'customer.subscription.updated' || type === 'customer.subscription.created') && obj?.metadata?.feature === 'call_recovery') {
        await WebhookHandlers.handleCallRecoverySubscription(obj, 'updated');
      } else if (type === 'customer.subscription.deleted' && obj?.metadata?.feature === 'call_recovery') {
        await WebhookHandlers.handleCallRecoverySubscription(obj, 'canceled');
      }
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }

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

      console.log(`Call recovery checkout activated for org ${orgId} on plan ${callRecoveryPlan}`);
    } catch (err: any) {
      console.error('Error handling call recovery checkout:', err.message);
    }
  }

  private static async handleCallRecoverySubscription(sub: any, action: 'updated' | 'canceled'): Promise<void> {
    try {
      const { orgId, callRecoveryPlan } = sub.metadata || {};
      if (!orgId) return;

      const status = action === 'canceled' ? 'canceled' : (sub.status as string);
      const isActive = status === 'active' || status === 'trialing';

      await storage.updateOrg(orgId, {
        callRecoveryPlan: isActive ? callRecoveryPlan as CallRecoveryPlan : null,
        callRecoveryStatus: status,
        callRecoveryStripeSubId: isActive ? sub.id : null,
      });

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

      console.log(`Call recovery subscription ${action} for org ${orgId}`);
    } catch (err: any) {
      console.error('Error handling call recovery subscription:', err.message);
    }
  }
}
