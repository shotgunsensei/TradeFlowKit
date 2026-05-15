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
import { setupOrg, trackOrg, trackUser, trackStripeEvent, cleanupAll } from "./helpers";
import { pool } from "../server/db";

function makeEvent(type: string, object: any, id = `evt_test_${Math.random().toString(36).slice(2)}`) {
  trackStripeEvent(id);
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

  it("invoice_payment checkout (card) marks invoice paid immediately", async () => {
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
      payment_status: "paid",
    });
    await WebhookHandlers.processWebhook(payload, "sig");
    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("paid");
    expect(refreshed?.paidViaStripe).toBe(true);
    expect(refreshed?.stripePaymentIntentId).toBe(paymentIntentId);
  });

  it("invoice_payment checkout (ACH) puts invoice in processing state, not paid", async () => {
    const cust = await storage.createCustomer(ctx.orgId!, { name: "AchCust", phone: "" } as any);
    const inv = await storage.createInvoice(
      ctx.orgId!,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "sent", items: [{ description: "svc", qty: 1, unitPrice: 75 }] },
      ctx.userId!,
    );
    const payload = makeEvent("checkout.session.completed", {
      metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
      payment_intent: "pi_ach_processing",
      payment_status: "processing",
    });
    await WebhookHandlers.processWebhook(payload, "sig");
    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("processing");
    expect(refreshed?.paidViaStripe).toBe(false);
    expect(refreshed?.paidAt).toBeNull();
    expect(refreshed?.stripePaymentIntentId).toBe("pi_ach_processing");
  });

  it("payment_intent.processing marks invoice processing (resolved by metadata)", async () => {
    const cust = await storage.createCustomer(ctx.orgId!, { name: "AchPi", phone: "" } as any);
    const inv = await storage.createInvoice(
      ctx.orgId!,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "sent", items: [{ description: "svc", qty: 1, unitPrice: 100 }] },
      ctx.userId!,
    );
    const payload = makeEvent("payment_intent.processing", {
      id: "pi_pi_processing",
      metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
    });
    await WebhookHandlers.processWebhook(payload, "sig");
    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("processing");
    expect(refreshed?.stripePaymentIntentId).toBe("pi_pi_processing");
    expect(refreshed?.paidViaStripe).toBe(false);
  });

  it("payment_intent.succeeded settles processing ACH invoice as paid", async () => {
    const cust = await storage.createCustomer(ctx.orgId!, { name: "AchSettled", phone: "" } as any);
    const inv = await storage.createInvoice(
      ctx.orgId!,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "sent", items: [{ description: "svc", qty: 1, unitPrice: 200 }] },
      ctx.userId!,
    );
    // Initiate ACH
    await WebhookHandlers.processWebhook(
      makeEvent("checkout.session.completed", {
        metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
        payment_intent: "pi_ach_settle",
        payment_status: "processing",
      }),
      "sig",
    );
    const intermediate = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(intermediate?.status).toBe("processing");

    // Settle (no metadata on the payment_intent — should fall back to lookup by id)
    await WebhookHandlers.processWebhook(
      makeEvent("payment_intent.succeeded", {
        id: "pi_ach_settle",
        metadata: { feature: "invoice_payment" },
      }),
      "sig",
    );
    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("paid");
    expect(refreshed?.paidViaStripe).toBe(true);
    expect(refreshed?.paidAt).toBeTruthy();
    expect(refreshed?.stripePaymentIntentId).toBe("pi_ach_settle");
  });

  it("payment_intent.payment_failed reverts ACH invoice back to unpaid and audits", async () => {
    const cust = await storage.createCustomer(ctx.orgId!, { name: "AchFailed", phone: "" } as any);
    const inv = await storage.createInvoice(
      ctx.orgId!,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "sent", items: [{ description: "svc", qty: 1, unitPrice: 60 }] },
      ctx.userId!,
    );
    // ACH initiated
    await WebhookHandlers.processWebhook(
      makeEvent("checkout.session.completed", {
        metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
        payment_intent: "pi_ach_fail",
        payment_status: "processing",
      }),
      "sig",
    );

    // ACH failed (insufficient funds, etc.)
    await WebhookHandlers.processWebhook(
      makeEvent("payment_intent.payment_failed", {
        id: "pi_ach_fail",
        metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
        last_payment_error: { code: "insufficient_funds", message: "Insufficient funds in account" },
      }),
      "sig",
    );

    const refreshed = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(refreshed?.status).toBe("sent");
    expect(refreshed?.paidViaStripe).toBe(false);
    expect(refreshed?.paidAt).toBeNull();

    // Audit entry recorded for org notification
    const audit = await storage.getAuditLog(ctx.orgId!, { limit: 50, offset: 0, entity: "invoice", action: "payment_failed" });
    const matching = audit.items.find((row) => row.entityId === inv.id);
    expect(matching).toBeTruthy();
    expect((matching?.after as any)?.code).toBe("insufficient_funds");
    expect((matching?.after as any)?.paymentIntentId).toBe("pi_ach_fail");
  });

  it("payment_intent.succeeded does not downgrade an already-paid invoice", async () => {
    const cust = await storage.createCustomer(ctx.orgId!, { name: "AlreadyPaid", phone: "" } as any);
    const inv = await storage.createInvoice(
      ctx.orgId!,
      { customerId: cust.id, taxRate: "0", discount: "0", status: "sent", items: [{ description: "svc", qty: 1, unitPrice: 30 }] },
      ctx.userId!,
    );
    // Card flow: paid immediately
    await WebhookHandlers.processWebhook(
      makeEvent("checkout.session.completed", {
        metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
        payment_intent: "pi_card_dup",
        payment_status: "paid",
      }),
      "sig",
    );
    const first = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(first?.status).toBe("paid");
    const firstPaidAt = first?.paidAt;

    // payment_intent.succeeded fires later — should be a no-op
    await WebhookHandlers.processWebhook(
      makeEvent("payment_intent.succeeded", {
        id: "pi_card_dup",
        metadata: { feature: "invoice_payment", invoiceId: inv.id, orgId: ctx.orgId },
      }),
      "sig",
    );
    const second = await storage.getInvoice(ctx.orgId!, inv.id);
    expect(second?.status).toBe("paid");
    expect(second?.paidAt?.getTime()).toBe(firstPaidAt?.getTime());
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
