import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

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

  beforeAll(async () => {
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
      // Reset to free
      await storage.updateOrg(ctx.orgId!, { plan: "free", subscriptionStatus: "canceled" } as any);

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
    await storage.updateOrg(ctx.orgId!, { plan: "free", subscriptionStatus: "canceled" } as any);

    const eventId = "evt_idempotency_check";
    const obj = {
      metadata: { orgId: ctx.orgId, plan: "small_business" },
      subscription: "sub_idem",
      customer: "cus_idem",
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
    await storage.updateOrg(ctx.orgId!, {
      plan: "enterprise",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_del_test",
      stripeSubscriptionId: "sub_del_test",
    } as any);

    const payload = makeEvent("customer.subscription.deleted", {
      id: "sub_del_test",
      customer: "cus_del_test",
      status: "canceled",
    });
    await WebhookHandlers.processWebhook(payload, "sig");

    const refreshed = await storage.getOrg(ctx.orgId!);
    expect(refreshed?.plan).toBe("free");
    expect(refreshed?.subscriptionStatus).toBe("canceled");
    expect(refreshed?.stripeSubscriptionId).toBeNull();
  });

  it("invoice.payment_failed marks subscription past_due", async () => {
    await storage.updateOrg(ctx.orgId!, {
      plan: "small_business",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_pf_test",
    } as any);
    const payload = makeEvent("invoice.payment_failed", { customer: "cus_pf_test" });
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
    const payload = makeEvent("checkout.session.completed", {
      metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
      payment_intent: "pi_test_paid",
    });
    await WebhookHandlers.processWebhook(payload, "sig");
    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("paid");
    expect(refreshed?.paidViaStripe).toBe(true);
    expect(refreshed?.stripePaymentIntentId).toBe("pi_test_paid");
  });

  it("duplicate event id is a no-op: zero writes on replay", async () => {
    await storage.updateOrg(ctx.orgId!, {
      plan: "free",
      subscriptionStatus: "canceled",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    } as any);

    const eventId = `evt_zero_writes_${Math.random().toString(36).slice(2)}`;
    const obj = {
      metadata: { orgId: ctx.orgId, plan: "individual" },
      subscription: "sub_zw",
      customer: "cus_zw",
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
