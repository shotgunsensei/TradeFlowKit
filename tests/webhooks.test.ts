import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("../server/stripeClient", () => ({
  getStripeSync: async () => ({
    processWebhook: async () => {
      /* no-op: bypass signature verification in tests */
    },
  }),
}));

import { WebhookHandlers } from "../server/webhookHandlers";
import { storage } from "../server/storage";
import { setupOrg, trackOrg, trackUser, cleanupAll } from "./helpers";
import { pool } from "../server/db";

function makeEvent(type: string, object: any, id = `evt_test_${Math.random().toString(36).slice(2)}`) {
  return Buffer.from(JSON.stringify({ id, type, data: { object } }));
}

describe("WebhookHandlers — main plan checkout", () => {
  const ctx: { orgId?: string; userId?: string } = {};

  beforeEach(async () => {
    // Each test gets a freshly-seeded org so subscription-state mutations
    // from one test can't bleed into another (order-independent).
    const { org, user } = await setupOrg("free");
    ctx.orgId = org.id;
    ctx.userId = user.id;
    trackOrg(org.id);
    trackUser(user.id);
  });

  afterAll(async () => {
    await cleanupAll();
    await pool.end();
  });

  it.each(["individual", "small_business", "enterprise"] as const)(
    "checkout.session.completed upgrades plan to %s",
    async (plan) => {
      const payload = makeEvent("checkout.session.completed", {
        metadata: { orgId: ctx.orgId, plan },
        subscription: `sub_test_${plan}`,
        customer: `cus_test_${plan}`,
      });
      await WebhookHandlers.processWebhook(payload, "sig_test");

      const refreshed = await storage.getOrg(ctx.orgId!);
      expect(refreshed?.plan).toBe(plan);
      expect(refreshed?.subscriptionStatus).toBe("active");
      expect(refreshed?.stripeCustomerId).toBe(`cus_test_${plan}`);
    },
  );

  it("replaying the same checkout event is a no-op (same final state)", async () => {
    // Use a unique event id per run so the dedupe table from a previous
    // run doesn't cause the first delivery to be skipped.
    const eventId = `evt_idempotency_check_${randomUUID()}`;
    const obj = {
      metadata: { orgId: ctx.orgId, plan: "small_business" },
      subscription: `sub_idem_${randomUUID().slice(0, 8)}`,
      customer: `cus_idem_${randomUUID().slice(0, 8)}`,
    };
    await WebhookHandlers.processWebhook(makeEvent("checkout.session.completed", obj, eventId), "sig");
    const first = await storage.getOrg(ctx.orgId!);

    await WebhookHandlers.processWebhook(makeEvent("checkout.session.completed", obj, eventId), "sig");
    const second = await storage.getOrg(ctx.orgId!);

    expect(second?.plan).toBe(first?.plan);
    expect(second?.stripeCustomerId).toBe(first?.stripeCustomerId);
    expect(second?.stripeSubscriptionId).toBe(first?.stripeSubscriptionId);
    expect(second?.subscriptionStatus).toBe("active");
  });

  it("subscription.deleted downgrades org to free", async () => {
    const cust = `cus_del_${randomUUID().slice(0, 8)}`;
    const sub = `sub_del_${randomUUID().slice(0, 8)}`;
    await storage.updateOrg(ctx.orgId!, {
      plan: "enterprise",
      subscriptionStatus: "active",
      stripeCustomerId: cust,
      stripeSubscriptionId: sub,
    } as any);

    const payload = makeEvent("customer.subscription.deleted", {
      id: sub,
      customer: cust,
      status: "canceled",
    });
    await WebhookHandlers.processWebhook(payload, "sig");

    const refreshed = await storage.getOrg(ctx.orgId!);
    expect(refreshed?.plan).toBe("free");
    expect(refreshed?.subscriptionStatus).toBe("canceled");
    expect(refreshed?.stripeSubscriptionId).toBeNull();
  });

  it("invoice.payment_failed marks subscription past_due", async () => {
    const cust = `cus_pf_${randomUUID().slice(0, 8)}`;
    await storage.updateOrg(ctx.orgId!, {
      plan: "small_business",
      subscriptionStatus: "active",
      stripeCustomerId: cust,
    } as any);
    const payload = makeEvent("invoice.payment_failed", { customer: cust });
    await WebhookHandlers.processWebhook(payload, "sig");
    const refreshed = await storage.getOrg(ctx.orgId!);
    expect(refreshed?.subscriptionStatus).toBe("past_due");
  });

  it("invoice_payment checkout marks invoice paid", async () => {
    const cust = await storage.createCustomer(ctx.orgId!, { name: "PayCust", phone: "" } as any);
    const inv = await storage.createInvoice(
      ctx.orgId!,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "sent", items: [{ description: "svc", qty: 1, unitPrice: 50 }] },
      ctx.userId!,
    );
    const paymentIntentId = `pi_test_paid_${randomUUID().slice(0, 8)}`;
    const payload = makeEvent("checkout.session.completed", {
      metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
      payment_intent: paymentIntentId,
    });
    await WebhookHandlers.processWebhook(payload, "sig");
    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("paid");
    expect(refreshed?.paidViaStripe).toBe(true);
    expect(refreshed?.stripePaymentIntentId).toBe(paymentIntentId);
  });

  it("duplicate event id is a no-op: zero writes on replay", async () => {
    const eventId = `evt_zero_writes_${randomUUID()}`;
    const obj = {
      metadata: { orgId: ctx.orgId, plan: "individual" },
      subscription: `sub_zw_${randomUUID().slice(0, 8)}`,
      customer: `cus_zw_${randomUUID().slice(0, 8)}`,
    };

    // First delivery processes normally
    await WebhookHandlers.processWebhook(makeEvent("checkout.session.completed", obj, eventId), "sig");
    const afterFirst = await storage.getOrg(ctx.orgId!);
    expect(afterFirst?.plan).toBe("individual");

    // Spy on every IStorage write/read method to verify the replay performs none of them
    const writeMethods = [
      "updateOrg",
      "createOrg",
      "deleteOrg",
      "updateInvoice",
      "createCallRecoverySubscription",
      "updateCallRecoverySubscription",
    ] as const;
    const readMethods = [
      "getOrg",
      "getOrgByStripeCustomerId",
      "getCallRecoverySubscription",
      "getInvoice",
    ] as const;

    const spies = [
      ...writeMethods.map((m) => vi.spyOn(storage as any, m)),
      ...readMethods.map((m) => vi.spyOn(storage as any, m)),
    ];
    const recordSpy = vi.spyOn(storage, "recordProcessedStripeEvent");
    const deleteSpy = vi.spyOn(storage, "deleteProcessedStripeEvent");

    try {
      await WebhookHandlers.processWebhook(makeEvent("checkout.session.completed", obj, eventId), "sig");

      // The dedupe insert is the only storage call; no handler reads/writes happen
      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).not.toHaveBeenCalled();
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      recordSpy.mockRestore();
      deleteSpy.mockRestore();
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("malformed JSON payload throws (non-2xx upstream)", async () => {
    await expect(
      WebhookHandlers.processWebhook("not-a-buffer" as any, "sig"),
    ).rejects.toThrow(/Buffer/);
  });
});
