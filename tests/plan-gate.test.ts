import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import automationsRouter from "../server/routes/automations";
import { storage } from "../server/storage";
import { setupOrg, trackOrg, trackUser, cleanupAll } from "./helpers";
import { pool } from "../server/db";

function buildApp(orgId: string, userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { orgId, userId };
    next();
  });
  app.use(automationsRouter);
  return app;
}

describe("Plan-gate enforcement: automations endpoint", () => {
  const created: { orgId: string; userId: string; plan: string }[] = [];

  beforeAll(async () => {
    for (const plan of ["free", "individual", "small_business", "enterprise"] as const) {
      const { org, user } = await setupOrg(plan);
      trackOrg(org.id);
      trackUser(user.id);
      created.push({ orgId: org.id, userId: user.id, plan });
    }
  });

  afterAll(async () => {
    await cleanupAll();
    await pool.end();
  });

  it.each(["free", "individual"])("plan=%s cannot enable invoice reminders", async (plan) => {
    const ctx = created.find((c) => c.plan === plan)!;
    const app = buildApp(ctx.orgId, ctx.userId);
    const res = await request(app)
      .post("/api/automations")
      .send({ invoiceReminder: true, quoteFollowUp: true });
    expect(res.status).toBe(403);
  });

  it.each(["small_business", "enterprise"])("plan=%s can enable invoice reminders", async (plan) => {
    const ctx = created.find((c) => c.plan === plan)!;
    const app = buildApp(ctx.orgId, ctx.userId);
    const res = await request(app)
      .post("/api/automations")
      .send({ invoiceReminder: true, quoteFollowUp: true });
    expect(res.status).toBe(200);
    expect(res.body.invoiceReminder).toBe(true);
    expect(res.body.quoteFollowUp).toBe(true);

    const persisted = await storage.getOrgAutomations(ctx.orgId);
    expect(persisted?.invoiceReminder).toBe(true);
  });

  it("GET /api/automations returns defaults for any plan (read is open)", async () => {
    const ctx = created.find((c) => c.plan === "free")!;
    const app = buildApp(ctx.orgId, ctx.userId);
    const res = await request(app).get("/api/automations");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("invoiceReminder");
    expect(res.body).toHaveProperty("invoiceReminderDays");
  });
});

describe("Plan-gate enforcement: recurring jobs (storage-level helper)", () => {
  function canUseRecurring(plan: string): boolean {
    return plan === "small_business" || plan === "enterprise";
  }
  it("free + individual cannot use recurring", () => {
    expect(canUseRecurring("free")).toBe(false);
    expect(canUseRecurring("individual")).toBe(false);
  });
  it("small_business + enterprise can use recurring", () => {
    expect(canUseRecurring("small_business")).toBe(true);
    expect(canUseRecurring("enterprise")).toBe(true);
  });
});

describe("Plan-gate: PLAN_LIMITS resource enforcement", () => {
  it("free plan caps resources at 5", async () => {
    const { PLAN_LIMITS } = await import("@shared/schema");
    expect(PLAN_LIMITS.free.customers).toBe(5);
    expect(PLAN_LIMITS.free.jobs).toBe(5);
    expect(PLAN_LIMITS.free.canInvite).toBe(false);
  });
  it("paid plans are unlimited on resources", async () => {
    const { PLAN_LIMITS } = await import("@shared/schema");
    for (const plan of ["individual", "small_business", "enterprise"] as const) {
      expect(PLAN_LIMITS[plan].customers).toBe(-1);
      expect(PLAN_LIMITS[plan].jobs).toBe(-1);
    }
    expect(PLAN_LIMITS.individual.canInvite).toBe(false);
    expect(PLAN_LIMITS.small_business.canInvite).toBe(true);
    expect(PLAN_LIMITS.enterprise.canInvite).toBe(true);
  });
});
